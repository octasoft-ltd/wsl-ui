import { useState, useEffect } from "react";
import { Portal } from "./ui/Portal";
import {
  HelpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  TerminalIcon,
  SettingsIcon,
  PlayIcon,
  StopIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  RefreshIcon,
  SparklesIcon,
  ContainerIcon,
  StoreIcon,
  LxcIcon,
  PaletteIcon,
} from "./icons";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";

interface HelpDialogProps {
  onClose: () => void;
}

interface HelpSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function HelpSection({ title, icon, children, defaultOpen = false }: HelpSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-theme-border-secondary/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-theme-bg-tertiary/30 hover:bg-theme-bg-tertiary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-theme-accent-primary">{icon}</span>
          <span className="font-medium text-theme-text-primary">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUpIcon size="sm" className="text-theme-text-tertiary" />
        ) : (
          <ChevronDownIcon size="sm" className="text-theme-text-tertiary" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 bg-theme-bg-secondary/50 text-sm text-theme-text-secondary leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function HelpItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="font-medium text-theme-text-primary mb-1">{title}</h4>
      <p className="text-theme-text-secondary">{children}</p>
    </div>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-theme-text-secondary">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const [appVersion, setAppVersion] = useState<string>("");

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch app version
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs"
          onClick={onClose}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-dialog-title"
          data-testid="help-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-theme-border-secondary bg-gradient-to-r from-cyan-900/20 via-theme-bg-secondary to-theme-bg-secondary">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <HelpIcon size="lg" className="text-cyan-400" />
            </div>
            <div>
              <h2 id="help-dialog-title" className="text-xl font-semibold text-theme-text-primary">
                Help & Documentation
              </h2>
              <p className="text-sm text-theme-text-secondary">
                Learn how to use WSL UI
              </p>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {/* Getting Started */}
            <HelpSection
              title="Getting Started"
              icon={<PlayIcon size="md" />}
              defaultOpen={true}
            >
              <HelpItem title="What is WSL UI?">
                WSL UI is a desktop application for managing Windows Subsystem for Linux (WSL) distributions.
                It provides a graphical interface for common WSL operations like starting, stopping,
                creating, and configuring Linux distributions.
              </HelpItem>
              <HelpItem title="Main Dashboard">
                The main view shows all your installed WSL distributions as cards. Each card displays
                the distribution name, status (online/offline), disk usage, and quick action buttons.
              </HelpItem>
              <HelpItem title="Quick Actions">
                Click the menu button (three dots) on any distribution card to access quick actions
                like opening a terminal, file explorer, IDE, or managing the distribution.
              </HelpItem>
            </HelpSection>

            {/* Distribution Management */}
            <HelpSection
              title="Distribution Management"
              icon={<TerminalIcon size="md" />}
            >
              <HelpItem title="Starting & Stopping">
                <span className="flex items-center gap-2 mb-1">
                  <PlayIcon size="sm" className="text-theme-status-success" /> Start a distribution
                </span>
                <span className="flex items-center gap-2">
                  <StopIcon size="sm" className="text-theme-status-error" /> Stop a running distribution
                </span>
              </HelpItem>
              <HelpItem title="Set as Default">
                Set a distribution as default to use it when running WSL commands without specifying a distribution name.
              </HelpItem>
              <HelpItem title="Resource Monitoring">
                Running distributions show real-time CPU and memory usage. Disk size is displayed for all distributions.
              </HelpItem>
            </HelpSection>

            {/* Advanced Operations */}
            <HelpSection
              title="Advanced Operations"
              icon={<SettingsIcon size="md" />}
            >
              <HelpItem title="Rename">
                Change a distribution's name. You can also update the Windows Terminal profile and Start Menu shortcut.
                Requires the distribution to be stopped.
              </HelpItem>
              <HelpItem title="Move">
                Relocate a distribution to a different drive or folder. Useful for managing disk space.
                Requires WSL to be fully shut down.
              </HelpItem>
              <HelpItem title="Resize Disk">
                Expand the virtual disk size for distributions that need more space.
                Only expansion is supported (not shrinking). Requires WSL shutdown.
              </HelpItem>
              <HelpItem title="Set WSL Version">
                Convert between WSL 1 and WSL 2. WSL 2 offers better performance with a full Linux kernel.
                Conversion may take several minutes.
              </HelpItem>
              <HelpItem title="Sparse Mode">
                Enable automatic disk space reclamation. The virtual disk will shrink as you delete files inside the distribution.
              </HelpItem>
              <HelpItem title="Compact Disk">
                One-click optimization to reclaim unused space from a distribution's virtual disk.
                Automatically runs fstrim, shuts down WSL, and compacts the VHDX file.
                Requires administrator privileges and takes 1-2 minutes.
              </HelpItem>
            </HelpSection>

            {/* Creating Distributions */}
            <HelpSection
              title="Creating Distributions"
              icon={<DownloadIcon size="md" />}
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <StoreIcon size="md" className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-medium text-theme-text-primary">Quick Install (Microsoft Store)</h4>
                    <p>One-click installation of official distributions like Ubuntu, Debian, and openSUSE.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ContainerIcon size="md" className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-medium text-theme-text-primary">Container Images</h4>
                    <p>Create distributions from Docker or Podman container images. Supports Docker Hub and other registries.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <DownloadIcon size="md" className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-medium text-theme-text-primary">Direct Download</h4>
                    <p>Download rootfs archives from configurable URLs. Includes Alpine, NixOS, Void Linux, and more.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <LxcIcon size="md" className="text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-medium text-theme-text-primary">Community Catalog (LXC)</h4>
                    <p>Browse hundreds of distributions from the Linux Containers image server.</p>
                  </div>
                </div>
              </div>
            </HelpSection>

            {/* Backup & Restore */}
            <HelpSection
              title="Backup & Restore"
              icon={<CopyIcon size="md" />}
            >
              <HelpItem title="Export">
                Save a distribution to a .tar archive file for backup or migration. You can restore it later or on another machine.
              </HelpItem>
              <HelpItem title="Import">
                Restore a distribution from a .tar archive. Choose a name and installation location for the imported distribution.
              </HelpItem>
              <HelpItem title="Clone">
                Create a copy of an existing distribution with a new name. Useful for testing or creating variants.
              </HelpItem>
            </HelpSection>

            {/* Custom Actions */}
            <HelpSection
              title="Custom Actions"
              icon={<SparklesIcon size="md" />}
            >
              <HelpItem title="What are Custom Actions?">
                Custom actions are user-defined shell commands that appear in the quick actions menu.
                Create actions for common tasks like system updates, backups, or development setup.
              </HelpItem>
              <HelpItem title="Variables">
                Use variables in your commands that get replaced at runtime:
              </HelpItem>
              <ul className="list-none space-y-1 font-mono text-xs bg-theme-bg-tertiary/50 p-3 rounded-lg mt-2">
                <li><code className="text-cyan-400">{"${DISTRO_NAME}"}</code> - Distribution name</li>
                <li><code className="text-cyan-400">{"${HOME}"}</code> - Home directory path</li>
                <li><code className="text-cyan-400">{"${USER}"}</code> - Default user</li>
                <li><code className="text-cyan-400">{"${WINDOWS_HOME}"}</code> - Windows user directory</li>
              </ul>
              <HelpItem title="Targeting Distributions">
                Actions can target all distributions, specific distributions by name, or distributions matching a regex pattern.
              </HelpItem>
            </HelpSection>

            {/* Theming */}
            <HelpSection
              title="Themes & Appearance"
              icon={<PaletteIcon size="md" />}
            >
              <HelpItem title="Built-in Themes">
                Choose from 17 professionally designed themes including dark, light, and middle-ground options.
                Popular themes include Obsidian, Dracula, Nord, and Solarized.
              </HelpItem>
              <HelpItem title="Accessibility Themes">
                Two high contrast themes are available for users with low vision: High Contrast (dark) and High Contrast Light.
              </HelpItem>
              <HelpItem title="Custom Theme">
                Create your own theme with full control over 29 color variables including backgrounds, text, borders, accents, and more.
              </HelpItem>
            </HelpSection>

            {/* Keyboard Shortcuts */}
            <HelpSection
              title="Keyboard Shortcuts"
              icon={<SettingsIcon size="md" />}
            >
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><kbd className="px-2 py-0.5 bg-theme-bg-tertiary rounded text-xs">Tab</kbd></div>
                  <div>Next element</div>
                  <div><kbd className="px-2 py-0.5 bg-theme-bg-tertiary rounded text-xs">Shift+Tab</kbd></div>
                  <div>Previous element</div>
                  <div><kbd className="px-2 py-0.5 bg-theme-bg-tertiary rounded text-xs">Enter</kbd></div>
                  <div>Activate / Submit</div>
                  <div><kbd className="px-2 py-0.5 bg-theme-bg-tertiary rounded text-xs">Escape</kbd></div>
                  <div>Close dialog or menu</div>
                  <div><kbd className="px-2 py-0.5 bg-theme-bg-tertiary rounded text-xs">Space</kbd></div>
                  <div>Toggle checkbox</div>
                </div>
              </div>
              <HelpItem title="Accessibility">
                WSL UI supports screen readers, keyboard navigation, and respects system preferences for reduced motion.
              </HelpItem>
            </HelpSection>

            {/* Settings Overview */}
            <HelpSection
              title="Settings Overview"
              icon={<SettingsIcon size="md" />}
            >
              <FeatureList items={[
                "Terminal: Configure Windows Terminal, custom terminal apps, or command prompt",
                "IDE: Set up VS Code, Cursor, or custom IDE integration",
                "WSL Global: Configure memory, CPU, swap, networking mode, and WSLg",
                "Per-Distribution: Automount options, network settings, systemd, and boot commands",
                "Polling: Adjust auto-refresh intervals for status and resources",
                "Timeouts: Configure operation timeouts for slow systems",
                "Executable Paths: Override default paths for WSL, PowerShell, and other tools",
              ]} />
            </HelpSection>

            {/* Integrations */}
            <HelpSection
              title="Integrations"
              icon={<FolderIcon size="md" />}
            >
              <HelpItem title="Terminal Integration">
                Open distributions in Windows Terminal, Command Prompt, or any custom terminal application.
                Configure your preferred terminal in Settings.
              </HelpItem>
              <HelpItem title="IDE Integration">
                Open distributions directly in VS Code or other IDEs. The distribution's root folder opens in your editor.
              </HelpItem>
              <HelpItem title="File Explorer">
                Browse distribution files in Windows Explorer using the \\wsl$ network path.
              </HelpItem>
              <HelpItem title="System Tray">
                Minimize to system tray for quick access. Configure close behavior in Settings.
              </HelpItem>
            </HelpSection>

            {/* Troubleshooting */}
            <HelpSection
              title="Troubleshooting"
              icon={<RefreshIcon size="md" />}
            >
              <HelpItem title="WSL Not Detected">
                Ensure WSL is installed and enabled. Run <code className="bg-theme-bg-tertiary px-1 rounded">wsl --status</code> in
                PowerShell to check. You may need to enable the Windows features for WSL.
              </HelpItem>
              <HelpItem title="Operations Timing Out">
                If operations frequently timeout, increase the timeout values in Settings &gt; Timeouts.
                The app uses exponential backoff to reduce load during issues.
              </HelpItem>
              <HelpItem title="Distribution Won't Start">
                Try restarting WSL with <code className="bg-theme-bg-tertiary px-1 rounded">wsl --shutdown</code>,
                then start the distribution again.
              </HelpItem>
            </HelpSection>

            {/* Resources */}
            <HelpSection
              title="Resources & Support"
              icon={<ExternalLinkIcon size="md" />}
            >
              <div className="space-y-3">
                <button
                  onClick={() => open("https://github.com/octasoft-ltd/wsl-ui")}
                  className="flex items-center gap-2 text-theme-accent-primary hover:underline"
                >
                  <ExternalLinkIcon size="sm" />
                  GitHub Repository
                </button>
                <button
                  onClick={() => open("https://github.com/octasoft-ltd/wsl-ui/issues")}
                  className="flex items-center gap-2 text-theme-accent-primary hover:underline"
                >
                  <ExternalLinkIcon size="sm" />
                  Report an Issue
                </button>
                <button
                  onClick={() => open("https://www.octasoft.co.uk")}
                  className="flex items-center gap-2 text-theme-accent-primary hover:underline"
                >
                  <ExternalLinkIcon size="sm" />
                  Octasoft Ltd Website
                </button>
                <button
                  onClick={() => open("https://docs.microsoft.com/en-us/windows/wsl/")}
                  className="flex items-center gap-2 text-theme-accent-primary hover:underline"
                >
                  <ExternalLinkIcon size="sm" />
                  Microsoft WSL Documentation
                </button>
              </div>
            </HelpSection>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-theme-border-secondary bg-theme-bg-tertiary/30">
            <span className="text-xs text-theme-text-tertiary">
              WSL UI {appVersion && `v${appVersion}`}
            </span>
            <button
              onClick={onClose}
              data-testid="help-close-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
