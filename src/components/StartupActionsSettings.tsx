import { useEffect, useState } from "react";
import { useActionsStore } from "../store/actionsStore";
import { useDistroStore } from "../store/distroStore";
import type { StartupConfig, StartupAction, CustomAction } from "../types/actions";
import { DEFAULT_STARTUP_ACTION, ACTION_ICONS } from "../types/actions";

function generateId(): string {
  return `startup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface StartupActionEditorProps {
  action: StartupAction;
  customActions: CustomAction[];
  onChange: (action: StartupAction) => void;
  onDelete: () => void;
}

function StartupActionEditor({ action, customActions, onChange, onDelete }: StartupActionEditorProps) {
  const selectedAction = customActions.find((a) => a.id === action.actionId);
  const getActionIcon = (iconId: string) => ACTION_ICONS.find((i) => i.id === iconId)?.emoji || "⚡";

  return (
    <div className="flex items-start gap-3 p-3 bg-stone-900/50 rounded-lg border border-stone-800" data-testid="startup-action-editor">
      <div className="flex-1 space-y-3">
        {/* Action selector */}
        <div>
          <label className="block text-xs text-stone-500 mb-1">Action</label>
          <select
            data-testid="startup-action-type-selector"
            value={action.actionId || "__inline__"}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "__inline__") {
                onChange({ ...action, actionId: "", command: action.command || "" });
              } else {
                onChange({ ...action, actionId: value, command: undefined });
              }
            }}
            className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 text-sm focus:outline-hidden focus:border-orange-500"
          >
            <option value="__inline__">Custom command...</option>
            {customActions.map((ca) => (
              <option key={ca.id} value={ca.id}>
                {getActionIcon(ca.icon)} {ca.name}
              </option>
            ))}
          </select>
        </div>

        {/* Inline command if no action selected */}
        {!action.actionId && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Command</label>
            <input
              data-testid="startup-command-input"
              type="text"
              value={action.command || ""}
              onChange={(e) => onChange({ ...action, command: e.target.value })}
              placeholder="e.g., echo 'Started!'"
              className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 text-sm font-mono focus:outline-hidden focus:border-orange-500"
            />
          </div>
        )}

        {/* Show command preview if action selected */}
        {selectedAction && (
          <div className="text-xs text-stone-500 font-mono bg-stone-800/50 px-2 py-1 rounded-sm">
            {selectedAction.command}
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-4 text-xs" data-testid="startup-action-options">
          <label className="flex items-center gap-1.5" data-testid="startup-continue-on-error">
            <input
              type="checkbox"
              checked={action.continueOnError}
              onChange={(e) => onChange({ ...action, continueOnError: e.target.checked })}
              className="text-orange-500"
            />
            <span className="text-stone-400">Continue on error</span>
          </label>
          <div className="flex items-center gap-1" data-testid="startup-timeout-container">
            <span className="text-stone-500">Timeout:</span>
            <input
              data-testid="startup-timeout-input"
              type="number"
              value={action.timeout}
              onChange={(e) => onChange({ ...action, timeout: parseInt(e.target.value) || 60 })}
              className="w-16 px-2 py-1 bg-stone-900 border border-stone-700 rounded-sm text-stone-100 text-xs"
            />
            <span className="text-stone-500">s</span>
          </div>
        </div>
      </div>

      <button
        data-testid="startup-remove-action-button"
        onClick={onDelete}
        className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
        title="Remove"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function StartupActionsSettings() {
  const { actions, fetchActions, startupConfigs, fetchStartupConfigs, saveStartupConfig } = useActionsStore();
  const { distributions, fetchDistros } = useDistroStore();
  const [selectedDistro, setSelectedDistro] = useState<string>("");
  const [config, setConfig] = useState<StartupConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchActions();
    fetchDistros();
    fetchStartupConfigs();
  }, [fetchActions, fetchDistros, fetchStartupConfigs]);

  useEffect(() => {
    if (distributions.length > 0 && !selectedDistro) {
      setSelectedDistro(distributions[0].name);
    }
  }, [distributions, selectedDistro]);

  useEffect(() => {
    if (selectedDistro) {
      const existing = startupConfigs.find((c) => c.distroName === selectedDistro);
      setConfig(
        existing || {
          distroName: selectedDistro,
          actions: [],
          runOnAppStart: false,
          enabled: false,
        }
      );
      setHasChanges(false);
    }
  }, [selectedDistro, startupConfigs]);

  const updateConfig = (updates: Partial<StartupConfig>) => {
    if (config) {
      setConfig({ ...config, ...updates });
      setHasChanges(true);
    }
  };

  const addAction = () => {
    if (config) {
      updateConfig({
        actions: [
          ...config.actions,
          { ...DEFAULT_STARTUP_ACTION, id: generateId() },
        ],
      });
    }
  };

  const updateAction = (index: number, action: StartupAction) => {
    if (config) {
      const newActions = [...config.actions];
      newActions[index] = action;
      updateConfig({ actions: newActions });
    }
  };

  const deleteAction = (index: number) => {
    if (config) {
      updateConfig({
        actions: config.actions.filter((_, i) => i !== index),
      });
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    await saveStartupConfig(config);
    setHasChanges(false);
    setIsSaving(false);
  };

  if (distributions.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        <p>No distributions installed.</p>
        <p className="text-sm">Install a distribution to configure startup actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="startup-actions-settings">
      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4" data-testid="startup-info-box">
        <p className="text-sm text-blue-200">
          <span className="font-medium">Startup Actions</span> run automatically when you start a distribution through
          this app. You can use existing custom actions or define inline commands.
        </p>
      </div>

      {/* Distribution selector */}
      <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4">
        <label className="block text-sm font-medium text-stone-200 mb-2">Select Distribution</label>
        <select
          data-testid="startup-distro-selector"
          value={selectedDistro}
          onChange={(e) => setSelectedDistro(e.target.value)}
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 focus:outline-hidden focus:border-orange-500"
        >
          {distributions.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} {d.isDefault ? "(default)" : ""}
            </option>
          ))}
        </select>
      </div>

      {config && (
        <>
          {/* Enable toggle */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4" data-testid="startup-enable-section">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-stone-100" data-testid="startup-enable-label">Enable Startup Actions</h3>
                <p className="text-xs text-stone-500">Run configured actions when this distribution starts</p>
              </div>
              <button
                data-testid="startup-enable-toggle"
                onClick={() => updateConfig({ enabled: !config.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  config.enabled ? "bg-orange-500" : "bg-stone-700"
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {config.enabled && (
              <label className="flex items-center gap-2 mt-4 pt-4 border-t border-stone-800" data-testid="startup-run-on-app-start">
                <input
                  type="checkbox"
                  checked={config.runOnAppStart}
                  onChange={(e) => updateConfig({ runOnAppStart: e.target.checked })}
                  className="text-orange-500"
                />
                <span className="text-sm text-stone-300">Also start this distribution when app launches</span>
              </label>
            )}
          </div>

          {/* Actions list */}
          {config.enabled && (
            <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4" data-testid="startup-actions-list">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-stone-100">Actions</h3>
                <button
                  data-testid="startup-add-action-button"
                  onClick={addAction}
                  className="px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
                >
                  + Add Action
                </button>
              </div>

              {config.actions.length === 0 ? (
                <p className="text-center py-8 text-stone-500 text-sm" data-testid="startup-empty-state">
                  No startup actions configured. Add an action to get started.
                </p>
              ) : (
                <div className="space-y-2" data-testid="startup-actions-container">
                  {config.actions.map((action, index) => (
                    <StartupActionEditor
                      key={action.id}
                      action={action}
                      customActions={actions}
                      onChange={(a) => updateAction(index, a)}
                      onDelete={() => deleteAction(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save button */}
          {hasChanges && (
            <div className="sticky bottom-4 flex justify-end">
              <button
                data-testid="startup-save-button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg shadow-lg shadow-black/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

