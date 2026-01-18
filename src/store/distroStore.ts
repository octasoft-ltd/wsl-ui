import { create } from "zustand";
import type { Distribution, WslStatus } from "../types/distribution";
import { wslService } from "../services/wslService";
import { actionsService } from "../services/actionsService";
import { useActionsStore } from "./actionsStore";
import { parseError, logError, formatError } from "../utils/errors";
import { logger, info, warn } from "../utils/logger";

interface DistroStore {
  distributions: Distribution[];
  isLoading: boolean;
  error: string | null;
  isTimeoutError: boolean;
  actionInProgress: string | null;
  compactingDistro: string | null;

  // Actions
  fetchDistros: (silent?: boolean) => Promise<void>;
  startDistro: (name: string, id?: string) => Promise<void>;
  stopDistro: (name: string) => Promise<void>;
  deleteDistro: (name: string) => Promise<void>;
  shutdownAll: () => Promise<void>;
  forceKillWsl: () => Promise<void>;
  setDefault: (name: string) => Promise<void>;
  openTerminal: (name: string, id?: string) => Promise<void>;
  openSystemTerminal: () => Promise<void>;
  openFileExplorer: (name: string) => Promise<void>;
  openIDE: (name: string) => Promise<void>;
  restartDistro: (name: string, id?: string) => Promise<void>;
  exportDistro: (name: string) => Promise<string | null>;
  importDistro: (name: string, installLocation: string) => Promise<string | null>;
  renameDistro: (
    id: string,
    newName: string,
    updateTerminalProfile: boolean,
    updateShortcut: boolean
  ) => Promise<string | null>;
  setActionInProgress: (action: string | null) => void;
  setCompactingDistro: (name: string | null) => void;
  clearError: () => void;
  clearDistributions: () => void;

  // Computed
  getStatus: () => WslStatus;
}

// Request ID counter to track and invalidate stale requests
let currentFetchId = 0;

// Helper to detect timeout errors from backend
const isTimeoutErrorMessage = (error: string): boolean => {
  return error.toLowerCase().includes("timed out") ||
         error.toLowerCase().includes("timeout") ||
         error.toLowerCase().includes("taking too long");
};

export const useDistroStore = create<DistroStore>((set, get) => ({
  distributions: [],
  isLoading: true, // Start as loading until first fetch completes
  error: null,
  isTimeoutError: false,
  actionInProgress: null,
  compactingDistro: null,

  fetchDistros: async (silent?: boolean) => {
    // Increment fetch ID to invalidate any pending background requests
    const fetchId = ++currentFetchId;

    if (!silent) set({ isLoading: true, error: null });
    try {
      const newDistributions = await wslService.listDistributions();

      // Check if this fetch is still valid (not superseded by a newer fetch)
      if (fetchId !== currentFetchId) {
        logger.debug("Ignoring stale fetch", "Store", fetchId, "current is", currentFetchId);
        // Still reset isLoading if this was a non-silent fetch to prevent stuck state
        if (!silent) {
          set({ isLoading: false });
        }
        return;
      }

      // Merge with existing data to preserve diskSize, osInfo, and metadata (prevents UI flashing)
      const existingDistros = get().distributions;
      const distributions = newDistributions.map((newDistro) => {
        const existing = existingDistros.find((d) => d.name === newDistro.name);
        if (existing) {
          return {
            ...newDistro,
            diskSize: existing.diskSize,
            osInfo: existing.osInfo,
            metadata: existing.metadata,
          };
        }
        return newDistro;
      });

      // Always clear isLoading on success (even for silent fetches to clear initial loading state)
      set({ distributions, isLoading: false });

      // Fetch disk sizes and OS info in background (don't block the UI)
      // Use Promise.all to parallelize requests for better performance (N+1 optimization)
      logger.info("Fetching details for", "Store", distributions.length, "distributions");

      // Fetch all disk sizes in parallel
      const diskSizePromises = distributions.map(async (distro) => {
        try {
          const diskSize = await wslService.getDistributionDiskSize(distro.name);

          // Only update if:
          // 1. This fetch is still current
          // 2. The distro still exists in the current state
          // 3. We got a valid disk size
          if (fetchId === currentFetchId && diskSize > 0) {
            set((state) => {
              // Double-check the distro still exists
              const distroExists = state.distributions.some((d) => d.name === distro.name);
              if (!distroExists) {
                return state; // No change
              }

              return {
                distributions: state.distributions.map((d) =>
                  d.name === distro.name ? { ...d, diskSize } : d
                ),
              };
            });
          }
        } catch (err) {
          logger.error("Failed to get disk size for", "Store", distro.name, ":", err);
        }
      });

      // Fetch OS info for running distros in parallel
      const osInfoPromises = distributions
        .filter((distro) => distro.state === "Running")
        .map(async (distro) => {
          try {
            const osInfo = await wslService.getDistributionOsInfo(distro.name);

            // Only update if:
            // 1. This fetch is still current
            // 2. The distro still exists in the current state
            if (fetchId === currentFetchId) {
              set((state) => {
                // Double-check the distro still exists
                const distroExists = state.distributions.some((d) => d.name === distro.name);
                if (!distroExists) {
                  return state; // No change
                }

                return {
                  distributions: state.distributions.map((d) =>
                    d.name === distro.name ? { ...d, osInfo } : d
                  ),
                };
              });
            }
          } catch (err) {
            logger.error("Failed to get OS info for", "Store", distro.name, ":", err);
          }
        });

      // Fetch metadata for all distros (single call, not per-distro)
      // Metadata is keyed by distro ID (GUID)
      const metadataPromise = (async () => {
        try {
          const allMetadata = await wslService.getAllDistroMetadata();

          // Only update if this fetch is still current
          if (fetchId === currentFetchId) {
            set((state) => ({
              distributions: state.distributions.map((d) => ({
                ...d,
                // Match metadata by distro ID (GUID)
                metadata: d.id ? allMetadata[d.id] : undefined,
              })),
            }));
          }
        } catch (err) {
          logger.error("Failed to get distro metadata:", "Store", err);
        }
      })();

      // Wait for all background requests to complete (but don't block the main fetch)
      Promise.all([...diskSizePromises, ...osInfoPromises, metadataPromise]).catch(() => {
        // Errors are already handled individually, this is just to prevent unhandled rejections
      });
    } catch (error) {
      // Only set error if this fetch is still current
      if (fetchId === currentFetchId) {
        const appError = parseError(error);
        logError(appError, "distroStore.fetchDistros");
        const errorMessage = formatError(appError);
        // Always clear isLoading on error (even for silent fetches to clear initial loading state)
        set({
          error: errorMessage,
          isTimeoutError: isTimeoutErrorMessage(errorMessage),
          isLoading: false,
        });
      }
    }
  },

  startDistro: async (name: string, id?: string) => {
    set({ actionInProgress: `Starting ${name}...` });
    try {
      await wslService.startDistribution(name, id);
      await get().fetchDistros();

      // Execute startup actions (custom actions with runOnStartup enabled)
      try {
        const startupActions = await actionsService.getStartupActionsForDistro(name);
        if (startupActions.length > 0) {
          info(`[distroStore] Running ${startupActions.length} startup action(s) for ${name}`);
          set({ actionInProgress: `Running startup actions for ${name}...` });

          for (const action of startupActions) {
            try {
              const result = await actionsService.executeAction(action.id, name, id);
              // If action has showOutput enabled, show the output dialog
              if (action.showOutput && result) {
                useActionsStore.getState().setStartupActionOutput({
                  actionName: action.name,
                  distro: name,
                  output: result.output,
                  error: result.error,
                });
              }
            } catch (e) {
              warn(`[distroStore] Startup action '${action.name}' failed: ${e}`);
            }
          }
        }
      } catch (startupError) {
        // Log but don't fail the start operation if startup actions fail
        warn(`[distroStore] Failed to run startup actions for ${name}: ${startupError}`);
      }
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.startDistro");
      const errorMessage = formatError(appError);
      set({
        error: errorMessage,
        isTimeoutError: isTimeoutErrorMessage(errorMessage),
      });
    } finally {
      set({ actionInProgress: null });
    }
  },

  stopDistro: async (name: string) => {
    set({ actionInProgress: `Stopping ${name}...` });
    try {
      await wslService.stopDistribution(name);
      await get().fetchDistros();
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.stopDistro");
      const errorMessage = formatError(appError);
      set({
        error: errorMessage,
        isTimeoutError: isTimeoutErrorMessage(errorMessage),
      });
    } finally {
      set({ actionInProgress: null });
    }
  },

  deleteDistro: async (name: string) => {
    set({ actionInProgress: `Deleting ${name}...` });
    try {
      await wslService.deleteDistribution(name);
      // Note: Backend now automatically deletes metadata when distribution is deleted
      await get().fetchDistros();
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.deleteDistro");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  shutdownAll: async () => {
    set({ actionInProgress: "Shutting down WSL...", isTimeoutError: false });
    try {
      await wslService.shutdownAll();
      await get().fetchDistros();
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.shutdownAll");
      const errorMessage = formatError(appError);
      set({
        error: errorMessage,
        isTimeoutError: isTimeoutErrorMessage(errorMessage),
      });
    } finally {
      set({ actionInProgress: null });
    }
  },

  forceKillWsl: async () => {
    set({ actionInProgress: "Force shutting down WSL...", isTimeoutError: false, error: null });
    try {
      await wslService.forceKillWsl();
      // Give WSL service time to fully shut down before fetching
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Fetch silently - don't propagate errors that might show duplicate timeout messages
      // After a force shutdown, WSL may need more time to stabilize
      try {
        await get().fetchDistros(true);
      } catch {
        // Ignore fetch errors after force shutdown - polling will catch up
        logger.info("Fetch after force shutdown failed, polling will retry", "Store");
      }
      // Ensure clean state after successful force shutdown
      set({ error: null, isTimeoutError: false });
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.forceKillWsl");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  setDefault: async (name: string) => {
    set({ actionInProgress: `Setting ${name} as default...` });
    try {
      await wslService.setDefaultDistribution(name);
      await get().fetchDistros();
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.setDefault");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  openTerminal: async (name: string, id?: string) => {
    set({ actionInProgress: `Opening terminal for ${name}...` });
    try {
      await wslService.openTerminal(name, id);
      // Opening terminal on a stopped distro starts it, so refresh silently after a delay
      setTimeout(() => {
        get().fetchDistros(true);
      }, 1000);
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.openTerminal");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  openSystemTerminal: async () => {
    set({ actionInProgress: "Opening system terminal..." });
    try {
      await wslService.openSystemTerminal();
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.openSystemTerminal");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  openFileExplorer: async (name: string) => {
    set({ actionInProgress: `Opening file explorer for ${name}...` });
    try {
      await wslService.openFileExplorer(name);
      // Opening file explorer on a stopped distro starts it, so refresh silently after a delay
      setTimeout(() => {
        get().fetchDistros(true);
      }, 1000);
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.openFileExplorer");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  openIDE: async (name: string) => {
    set({ actionInProgress: `Opening IDE for ${name}...` });
    try {
      await wslService.openIDE(name);
      // Opening IDE on a stopped distro starts it, so refresh silently after a delay
      setTimeout(() => {
        get().fetchDistros(true);
      }, 1000);
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.openIDE");
      set({ error: formatError(appError) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  restartDistro: async (name: string, id?: string) => {
    set({ actionInProgress: `Restarting ${name}...` });
    try {
      await wslService.restartDistribution(name, id);
      await get().fetchDistros();

      // Execute startup actions (custom actions with runOnStartup enabled)
      try {
        const startupActions = await actionsService.getStartupActionsForDistro(name);
        if (startupActions.length > 0) {
          info(`[distroStore] Running ${startupActions.length} startup action(s) for ${name}`);
          set({ actionInProgress: `Running startup actions for ${name}...` });

          for (const action of startupActions) {
            try {
              const result = await actionsService.executeAction(action.id, name, id);
              // If action has showOutput enabled, show the output dialog
              if (action.showOutput && result) {
                useActionsStore.getState().setStartupActionOutput({
                  actionName: action.name,
                  distro: name,
                  output: result.output,
                  error: result.error,
                });
              }
            } catch (e) {
              warn(`[distroStore] Startup action '${action.name}' failed: ${e}`);
            }
          }
        }
      } catch (startupError) {
        // Log but don't fail the restart operation if startup actions fail
        warn(`[distroStore] Failed to run startup actions for ${name}: ${startupError}`);
      }
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.restartDistro");
      const errorMessage = formatError(appError);
      set({
        error: errorMessage,
        isTimeoutError: isTimeoutErrorMessage(errorMessage),
      });
    } finally {
      set({ actionInProgress: null });
    }
  },

  exportDistro: async (name: string) => {
    set({ actionInProgress: `Exporting ${name}...` });
    try {
      const path = await wslService.exportDistribution(name);
      return path;
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.exportDistro");
      set({ error: formatError(appError) });
      return null;
    } finally {
      set({ actionInProgress: null });
    }
  },

  importDistro: async (name: string, installLocation: string) => {
    set({ actionInProgress: `Importing ${name}...` });
    try {
      const result = await wslService.importDistribution(name, installLocation);
      if (result) {
        await get().fetchDistros();
      }
      return result;
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.importDistro");
      set({ error: formatError(appError) });
      return null;
    } finally {
      set({ actionInProgress: null });
    }
  },

  renameDistro: async (
    id: string,
    newName: string,
    updateTerminalProfile: boolean,
    updateShortcut: boolean
  ) => {
    set({ actionInProgress: `Renaming to ${newName}...` });
    try {
      const oldName = await wslService.renameDistribution(
        id,
        newName,
        updateTerminalProfile,
        updateShortcut
      );
      await get().fetchDistros();
      return oldName;
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "distroStore.renameDistro");
      set({ error: formatError(appError) });
      return null;
    } finally {
      set({ actionInProgress: null });
    }
  },

  setActionInProgress: (action: string | null) => {
    set({ actionInProgress: action });
  },

  setCompactingDistro: (name: string | null) => {
    set({ compactingDistro: name });
  },

  clearError: () => {
    set({ error: null, isTimeoutError: false });
  },

  clearDistributions: () => {
    set({ distributions: [], isLoading: false });
  },

  getStatus: () => {
    const { distributions } = get();
    const defaultDistro = distributions.find((d) => d.isDefault);
    const runningCount = distributions.filter((d) => d.state === "Running").length;

    return {
      defaultDistro: defaultDistro?.name ?? null,
      runningCount,
      totalCount: distributions.length,
    };
  },
}));

// Expose store for e2e testing (allows direct store access from browser.execute)
if (typeof window !== "undefined") {
  (window as unknown as { __distroStore: typeof useDistroStore }).__distroStore =
    useDistroStore;
}

