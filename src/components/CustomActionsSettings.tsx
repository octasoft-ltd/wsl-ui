import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { save, open } from "@tauri-apps/plugin-dialog";
import { useActionsStore } from "../store/actionsStore";
import { useDistroStore } from "../store/distroStore";
import type { CustomAction, DistroScope } from "../types/actions";
import { ACTION_ICONS, ACTION_VARIABLES, DEFAULT_CUSTOM_ACTION } from "../types/actions";

function generateId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface ActionEditorProps {
  action: CustomAction | null;
  onSave: (action: CustomAction) => void;
  onCancel: () => void;
  distros: string[];
}

function ActionEditor({ action, onSave, onCancel, distros }: ActionEditorProps) {
  const { t } = useTranslation("actions");
  const [formData, setFormData] = useState<CustomAction>(
    action || { ...DEFAULT_CUSTOM_ACTION, id: generateId(), order: 999 }
  );

  const updateField = <K extends keyof CustomAction>(key: K, value: CustomAction[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateScope = (newScope: DistroScope) => {
    setFormData((prev) => ({ ...prev, scope: newScope }));
  };

  // Get scope pattern (only valid when scope.type is "pattern")
  const getScopePattern = (): string => {
    return formData.scope.type === "pattern" ? formData.scope.pattern : "";
  };

  // Get scope distros (only valid when scope.type is "specific")
  const getScopeDistros = (): string[] => {
    return formData.scope.type === "specific" ? formData.scope.distros : [];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-stone-200 mb-1">{t('customActionsSettings.name')}</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          required
          data-testid="action-name-input"
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 focus:outline-hidden focus:border-orange-500"
        />
      </div>

      {/* Icon */}
      <div>
        <label className="block text-sm font-medium text-stone-200 mb-2">Icon</label>
        <div className="grid grid-cols-6 gap-2">
          {ACTION_ICONS.map((icon) => (
            <button
              key={icon.id}
              type="button"
              onClick={() => updateField("icon", icon.id)}
              className={`p-2 text-xl rounded-lg border transition-colors ${
                formData.icon === icon.id
                  ? "border-orange-500 bg-orange-500/20"
                  : "border-stone-700 bg-stone-800/50 hover:border-stone-600"
              }`}
              title={icon.label}
            >
              {icon.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Command */}
      <div>
        <label className="block text-sm font-medium text-stone-200 mb-1">{t('customActionsSettings.command')}</label>
        <textarea
          value={formData.command}
          onChange={(e) => updateField("command", e.target.value)}
          required
          rows={3}
          placeholder={t('customActionsSettings.commandPlaceholder')}
          data-testid="action-command-input"
          className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-orange-500 font-mono text-sm"
        />
        <div className="mt-2">
          <p className="text-xs text-stone-500 mb-1">Available variables:</p>
          <div className="flex flex-wrap gap-1">
            {ACTION_VARIABLES.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => updateField("command", formData.command + v.name)}
                className="px-2 py-0.5 text-xs bg-stone-800 text-orange-400 rounded-sm hover:bg-stone-700"
                title={v.description}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target Distributions */}
      <div>
        <label className="block text-sm font-medium text-stone-200 mb-2">{t('customActionsSettings.target')}</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="targetDistros"
              checked={formData.scope.type === "all"}
              onChange={() => updateScope({ type: "all" })}
              className="text-orange-500"
            />
            <span className="text-sm text-stone-300">{t('customActionsSettings.targetAll')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="targetDistros"
              checked={formData.scope.type === "pattern"}
              onChange={() => updateScope({ type: "pattern", pattern: getScopePattern() })}
              className="text-orange-500"
            />
            <span className="text-sm text-stone-300">{t('customActionsSettings.targetRegex')}</span>
          </label>
          {formData.scope.type === "pattern" && (
            <input
              type="text"
              value={formData.scope.pattern}
              onChange={(e) => updateScope({ type: "pattern", pattern: e.target.value })}
              placeholder={t('customActionsSettings.targetPlaceholder')}
              className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-orange-500 text-sm ml-6"
            />
          )}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="targetDistros"
              checked={formData.scope.type === "specific"}
              onChange={() => updateScope({ type: "specific", distros: getScopeDistros() })}
              className="text-orange-500"
            />
            <span className="text-sm text-stone-300">{t('customActionsSettings.targetSpecific')}</span>
          </label>
          {formData.scope.type === "specific" && (
            <div className="flex flex-wrap gap-2 ml-6">
              {distros.map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={getScopeDistros().includes(d)}
                    onChange={(e) => {
                      const current = formData.scope.type === "specific" ? formData.scope.distros : [];
                      if (e.target.checked) {
                        updateScope({ type: "specific", distros: [...current, d] });
                      } else {
                        updateScope({ type: "specific", distros: current.filter((x) => x !== d) });
                      }
                    }}
                    className="text-orange-500"
                  />
                  <span className="text-sm text-stone-400">{d}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.confirmBeforeRun}
            onChange={(e) => updateField("confirmBeforeRun", e.target.checked)}
            data-testid="action-confirm-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActionsSettings.showOutput')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.showOutput}
            onChange={(e) => updateField("showOutput", e.target.checked)}
            data-testid="action-show-output-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActionsSettings.showOutputDesc')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.requiresSudo}
            onChange={(e) => updateField("requiresSudo", e.target.checked)}
            data-testid="action-requires-sudo-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActionsSettings.sudo')}</span>
        </label>
        {formData.requiresSudo && (
          <p className="text-xs text-stone-500 ml-6">
            {t('customActionsSettings.sudoDesc')}
          </p>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.requiresStopped}
            onChange={(e) => updateField("requiresStopped", e.target.checked)}
            data-testid="action-requires-stopped-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActions.requiresStop')}</span>
        </label>
        {formData.requiresStopped && (
          <p className="text-xs text-stone-500 ml-6">
            {t('customActions.requiresStop')}
          </p>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.runInTerminal}
            onChange={(e) => updateField("runInTerminal", e.target.checked)}
            data-testid="action-run-in-terminal-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActionsSettings.showOutput')}</span>
        </label>
        {formData.runInTerminal && (
          <p className="text-xs text-stone-500 ml-6">
            {t('customActionsSettings.showOutputDesc')}
          </p>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.runOnStartup}
            onChange={(e) => updateField("runOnStartup", e.target.checked)}
            data-testid="action-run-on-startup-checkbox"
            className="text-orange-500"
          />
          <span className="text-sm text-stone-300">{t('customActionsSettings.runOnStartup')}</span>
        </label>
        {formData.runOnStartup && (
          <p className="text-xs text-stone-500 ml-6">
            {t('customActionsSettings.runOnStartupDesc')}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200 transition-colors"
        >
          {t('common:button.cancel')}
        </button>
        <button
          type="submit"
          data-testid="save-action-button"
          className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
        >
          {action ? t('customActionsSettings.editAction') : t('customActionsSettings.addAction')}
        </button>
      </div>
    </form>
  );
}

export function CustomActionsSettings() {
  const { t } = useTranslation("actions");
  const { actions, isLoading, fetchActions, addAction, updateAction, deleteAction, exportActionsToFile, importActionsFromFile } =
    useActionsStore();
  const { distributions } = useDistroStore();
  const [editingAction, setEditingAction] = useState<CustomAction | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleSave = async (action: CustomAction) => {
    if (editingAction) {
      await updateAction(action);
    } else {
      await addAction(action);
    }
    setEditingAction(null);
    setIsCreating(false);
  };

  const handleExport = async () => {
    try {
      const path = await save({
        defaultPath: "wsl-ui-actions.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Export Custom Actions",
      });

      if (path) {
        await exportActionsToFile(path);
      }
    } catch (error) {
      console.error("Export failed:", error);
      // Error is already set in store by exportActionsToFile
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Import Custom Actions",
        multiple: false,
      });

      if (path && typeof path === "string") {
        await importActionsFromFile(path, true);
      }
    } catch (error) {
      console.error("Import failed:", error);
      // Error is already set in store by importActionsFromFile
    }
  };

  const getIconEmoji = (iconId: string) => {
    return ACTION_ICONS.find((i) => i.id === iconId)?.emoji || "⚡";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-stone-600 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isCreating || editingAction) {
    return (
      <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-6">
        <h3 className="text-lg font-medium text-stone-100 mb-4">
          {editingAction ? t('customActionsSettings.editAction') : t('customActionsSettings.addAction')}
        </h3>
        <ActionEditor
          action={editingAction}
          onSave={handleSave}
          onCancel={() => {
            setEditingAction(null);
            setIsCreating(false);
          }}
          distros={distributions.map((d) => d.name)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {t('customActionsSettings.description')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            data-testid="import-actions-button"
            className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
          >
            {t('customActionsSettings.importActions')}
          </button>
          <button
            onClick={handleExport}
            data-testid="export-actions-button"
            className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
          >
            {t('customActionsSettings.exportActions')}
          </button>
          <button
            onClick={() => setIsCreating(true)}
            data-testid="new-action-button"
            className="px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            + {t('customActionsSettings.addAction')}
          </button>
        </div>
      </div>

      {/* Actions list */}
      {actions.length === 0 ? (
        <div className="text-center py-12 bg-stone-900/50 border border-stone-800 rounded-xl">
          <p className="text-stone-500">{t('customActionsSettings.noActions')}</p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-2 text-sm text-orange-400 hover:text-orange-300"
          >
            {t('customActionsSettings.noActionsHint')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div
              key={action.id}
              data-testid={`action-card-${action.name.replace(/\s+/g, "-")}`}
              className="flex items-center gap-4 p-4 bg-stone-900/50 border border-stone-800 rounded-xl hover:border-stone-700 transition-colors"
            >
              <div className="text-2xl">{getIconEmoji(action.icon)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-stone-100">{action.name}</h4>
                  {action.runOnStartup && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                      Startup
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 font-mono truncate">{action.command}</p>
                <p className="text-xs text-stone-600 mt-1">
                  {action.scope.type === "all" && "All distributions"}
                  {action.scope.type === "pattern" && `Pattern: ${action.scope.pattern}`}
                  {action.scope.type === "specific" && `${action.scope.distros.length} distributions`}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingAction(action)}
                  className="p-2 text-stone-500 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
                  title="Edit"
                  data-testid={`action-edit-${action.name.replace(/\s+/g, "-")}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => deleteAction(action.id)}
                  className="p-2 text-stone-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete"
                  data-testid={`action-delete-${action.name.replace(/\s+/g, "-")}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

