/**
 * Business Configuration Center (Prompt #25).
 *
 * Centralized settings UI with category navigation, effective value display,
 * change preview, audit history, and rollback.
 */

import { useState, useMemo } from "react";
import {
  Settings,
  Search,
  History,
  Check,
  ChevronRight,
  RotateCcw,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import {
  SETTING_CATEGORIES,
  CATEGORY_META,
  getSettingsForCategory,
  searchSettings,
  setSettingValue,
  getSettingHistory,
  rollbackSetting,
  getEffectiveValue,
  getSettingDefinition,
  validateSettingValue,
  type SettingCategory,
  type SettingDefinition,
  type EffectiveValue,
  type ScopeContext,
} from "@/domain/settings";

// =================================================================== mock context

const MOCK_CONTEXT: ScopeContext = {
  organizationId: "org_demo" as any,
  propertyId: "prop_demo" as any,
  outletId: null,
  departmentId: null,
};

const MOCK_ACTOR = "usr_owner" as any;

// =================================================================== main page

export default function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<SettingCategory | "SEARCH">("GENERAL");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);
  const [editReason, setEditReason] = useState("");
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const searchResults = useMemo(
    () => (searchQuery.length >= 2 ? searchSettings(searchQuery) : []),
    [searchQuery],
  );

  const settings = useMemo(
    () =>
      activeCategory !== "SEARCH"
        ? getSettingsForCategory(activeCategory, MOCK_CONTEXT)
        : [],
    [activeCategory],
  );

  const categoryMeta = useMemo(
    () => CATEGORY_META.find((c) => c.key === activeCategory),
    [activeCategory],
  );

  function handleSave(def: SettingDefinition) {
    setError(null);
    setSuccess(null);

    const validationError = validateSettingValue(def, editValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    const supportedScopes = def.scope;
    const scope = supportedScopes.includes("OUTLET") && MOCK_CONTEXT.outletId
      ? "OUTLET"
      : supportedScopes.includes("PROPERTY") && MOCK_CONTEXT.propertyId
        ? "PROPERTY"
        : "ORGANIZATION";

    const result = setSettingValue({
      settingKey: def.key,
      value: editValue,
      scope,
      context: MOCK_CONTEXT,
      actorId: MOCK_ACTOR,
      reason: editReason || undefined,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(`Setting updated successfully`);
    setEditingKey(null);
    setEditValue(null);
    setEditReason("");
  }

  function handleRollback(auditId: string) {
    setError(null);
    const result = rollbackSetting(auditId, MOCK_ACTOR, MOCK_CONTEXT);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Setting rolled back successfully");
    setShowHistory(null);
  }

  function startEdit(def: SettingDefinition, effective: EffectiveValue) {
    setEditingKey(def.key);
    setEditValue(effective.value);
    setEditReason("");
    setError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue(null);
    setEditReason("");
    setError(null);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Category sidebar */}
      <div className="w-full border-b border-border lg:w-64 lg:border-b-0 lg:border-r border-border">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">
            Configuration
          </h2>
        </div>
        <nav className="space-y-0.5 px-2 pb-4">
          {SETTING_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META.find((c) => c.key === cat);
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setShowHistory(null); setEditingKey(null); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-ink-secondary hover:bg-surface-alt hover:text-ink"
                }`}
              >
                <span className="flex-1">{meta?.label ?? cat}</span>
                {isActive && <ChevronRight className="size-4" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Search bar */}
        <div className="sticky top-0 z-10 border-b border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <TextInput
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length >= 2) setActiveCategory("SEARCH");
                  else if (activeCategory === "SEARCH") setActiveCategory("GENERAL");
                }}
                leadingIcon={<Search className="size-4" />}
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
              <Check className="size-4" />
              {success}
            </div>
          )}

          {activeCategory === "SEARCH" ? (
            <SearchResults
              results={searchResults}
              query={searchQuery}
              onEdit={(def) => {
                const eff = getEffectiveValue(def.key, MOCK_CONTEXT);
                startEdit(def, eff);
                setActiveCategory(def.category);
              }}
            />
          ) : (
            <>
              {/* Category header */}
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-ink">
                  {categoryMeta?.label}
                </h1>
                <p className="mt-1 text-sm text-ink-secondary">
                  {categoryMeta?.description}
                </p>
              </div>

              {/* Settings list */}
              <div className="space-y-3">
                {settings.map(({ definition, effective }) => (
                  <SettingRow
                    key={definition.key}
                    definition={definition}
                    effective={effective}
                    isEditing={editingKey === definition.key}
                    editValue={editValue}
                    editReason={editReason}
                    onEditValueChange={setEditValue}
                    onEditReasonChange={setEditReason}
                    onStartEdit={() => startEdit(definition, effective)}
                    onCancelEdit={cancelEdit}
                    onSave={() => handleSave(definition)}
                    onShowHistory={() => setShowHistory(definition.key)}
                  />
                ))}
              </div>
            </>
          )}

          {/* History panel */}
          {showHistory && (
            <HistoryPanel
              settingKey={showHistory}
              onClose={() => setShowHistory(null)}
              onRollback={handleRollback}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =================================================================== setting row

function SettingRow(props: {
  definition: SettingDefinition;
  effective: EffectiveValue;
  isEditing: boolean;
  editValue: unknown;
  editReason: string;
  onEditValueChange: (v: unknown) => void;
  onEditReasonChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onShowHistory: () => void;
}) {
  const { definition: def, effective } = props;

  const sensitivityColor =
    def.sensitivity === "CRITICAL"
      ? "text-red-600 bg-red-50 border-red-200"
      : def.sensitivity === "SENSITIVE"
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-ink-secondary bg-surface-alt border-border";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-ink">{def.name}</h3>
            <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${sensitivityColor}`}>
              {def.sensitivity}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">{def.description}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-secondary">
            <span>Source: <span className="font-medium text-ink">{effective.source}</span></span>
            {def.status !== "ACTIVE" && (
              <span className="text-amber-600">({def.status})</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!props.isEditing ? (
            <>
              <span className="text-sm font-medium text-ink tabular-nums">
                {formatValue(def, effective.value)}
              </span>
              <Button variant="ghost" size="sm" onClick={props.onStartEdit}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={props.onShowHistory}>
                <History className="size-3.5" />
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <SettingEditor
                definition={def}
                value={props.editValue}
                onChange={props.onEditValueChange}
              />
              {def.requiresReason && (
                <input
                  type="text"
                  placeholder="Reason for change..."
                  value={props.editReason}
                  onChange={(e) => props.onEditReasonChange(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-tertiary"
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={props.onSave}>Save</Button>
                <Button variant="ghost" size="sm" onClick={props.onCancelEdit}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// =================================================================== setting editor

function SettingEditor(props: {
  definition: SettingDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { definition: def, value, onChange } = props;

  switch (def.dataType) {
    case "BOOLEAN":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-ink">{Boolean(value) ? "Enabled" : "Disabled"}</span>
        </label>
      );

    case "ENUM":
      return (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
        >
          {def.enumValues?.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      );

    case "INTEGER":
      return (
        <input
          type="number"
          value={Number(value)}
          step={1}
          min={def.validation?.min}
          max={def.validation?.max}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-32 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink tabular-nums"
        />
      );

    case "DECIMAL":
      return (
        <input
          type="number"
          value={Number(value)}
          step={0.01}
          min={def.validation?.min}
          max={def.validation?.max}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-32 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink tabular-nums"
        />
      );

    case "STRING":
    default:
      return (
        <input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
        />
      );
  }
}

// =================================================================== search results

function SearchResults(props: {
  results: SettingDefinition[];
  query: string;
  onEdit: (def: SettingDefinition) => void;
}) {
  if (props.results.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-ink-secondary">
        No settings found for "{props.query}"
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-medium text-ink-secondary">
        {props.results.length} result{props.results.length !== 1 ? "s" : ""} for "{props.query}"
      </h2>
      <div className="space-y-2">
        {props.results.map((def) => (
          <button
            key={def.key}
            onClick={() => props.onEdit(def)}
            className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-surface-alt transition-colors"
          >
            <Settings className="size-4 text-ink-secondary" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink">{def.name}</div>
              <div className="text-xs text-ink-secondary">{def.description}</div>
            </div>
            <span className="text-xs text-ink-tertiary">
              {CATEGORY_META.find((c) => c.key === def.category)?.label}
            </span>
            <ChevronRight className="size-4 text-ink-tertiary" />
          </button>
        ))}
      </div>
    </div>
  );
}

// =================================================================== history panel

function HistoryPanel(props: {
  settingKey: string;
  onClose: () => void;
  onRollback: (auditId: string) => void;
}) {
  const history = getSettingHistory(props.settingKey, MOCK_CONTEXT);
  const def = getSettingDefinition(props.settingKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold text-ink">Change History</h3>
          <button onClick={props.onClose} className="text-ink-secondary hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary">
              No changes recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-secondary">
                      {new Date(entry.changedAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => props.onRollback(entry.id)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      <RotateCcw className="size-3" />
                      Revert
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-ink-secondary line-through">
                      {formatValue(def, entry.oldValue)}
                    </span>
                    <span className="text-ink-tertiary">→</span>
                    <span className="font-medium text-ink">
                      {formatValue(def, entry.newValue)}
                    </span>
                  </div>
                  {entry.reason && (
                    <p className="mt-1 text-xs text-ink-secondary italic">
                      "{entry.reason}"
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-tertiary">
                    Scope: {entry.scope} · By: {entry.changedBy}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// =================================================================== helpers

function formatValue(def: SettingDefinition | null, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (def?.dataType === "BOOLEAN") return value ? "Enabled" : "Disabled";
  if (def?.dataType === "DECIMAL") return String(value);
  return String(value);
}
