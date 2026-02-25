// =============================================================================
// MindLog Web — CohortFilterBuilder
// Recursive AND/OR filter group component for Cohort Builder v2.
// Supports nested groups (max depth 2) with categorized field selection.
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CohortFilterRule, CohortFilterGroup, FilterOp } from '@mindlog/shared';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

interface FieldMeta {
  label: string;
  category: string;
  type: 'enum' | 'number' | 'boolean' | 'text' | 'multi';
  enumValues?: string[];
  placeholder?: string;
}

const FIELD_CATALOG: Record<string, FieldMeta> = {
  // Demographics
  age:                { label: 'Age',              category: 'Demographics',   type: 'number' },
  gender:             { label: 'Gender',           category: 'Demographics',   type: 'enum', enumValues: ['male', 'female', 'non_binary', 'other', 'prefer_not_to_say'] },
  status:             { label: 'Status',           category: 'Demographics',   type: 'enum', enumValues: ['active', 'crisis', 'inactive', 'discharged'] },
  risk_level:         { label: 'Risk Level',       category: 'Demographics',   type: 'enum', enumValues: ['low', 'moderate', 'high', 'critical'] },
  // Assessments
  latest_phq9:        { label: 'PHQ-9 (latest)',   category: 'Assessments',    type: 'number' },
  latest_gad7:        { label: 'GAD-7 (latest)',   category: 'Assessments',    type: 'number' },
  latest_asrm:        { label: 'ASRM (latest)',    category: 'Assessments',    type: 'number' },
  // Daily Metrics
  avg_mood_30d:       { label: 'Avg Mood (30d)',   category: 'Daily Metrics',  type: 'number' },
  avg_coping_30d:     { label: 'Avg Coping (30d)', category: 'Daily Metrics',  type: 'number' },
  avg_stress_30d:      { label: 'Avg Stress (30d)', category: 'Daily Metrics', type: 'number' },
  avg_anxiety_30d:    { label: 'Avg Anxiety (30d)', category: 'Daily Metrics', type: 'number' },
  checkins_30d:       { label: 'Check-ins (30d)',  category: 'Daily Metrics',  type: 'number' },
  // Clinical
  diagnosis_codes:    { label: 'ICD-10 Diagnosis', category: 'Clinical',       type: 'text', placeholder: 'e.g. F32.1' },
  active_med_count:   { label: 'Active Medications', category: 'Clinical',     type: 'number' },
  // Engagement
  tracking_streak:    { label: 'Tracking Streak',  category: 'Engagement',     type: 'number' },
  app_installed:      { label: 'App Installed',    category: 'Engagement',     type: 'boolean' },
  onboarding_complete:{ label: 'Onboarding Done',  category: 'Engagement',     type: 'boolean' },
};

const CATEGORIES = ['Demographics', 'Assessments', 'Daily Metrics', 'Clinical', 'Engagement'];

function getOpsForField(field: string): { value: FilterOp; label: string }[] {
  const meta = FIELD_CATALOG[field];
  if (!meta) return [{ value: 'eq', label: '=' }];

  if (meta.type === 'enum') {
    return [
      { value: 'eq', label: 'equals' },
      { value: 'neq', label: 'not equals' },
      { value: 'in', label: 'is any of' },
    ];
  }
  if (meta.type === 'boolean') {
    return [{ value: 'eq', label: 'is' }];
  }
  if (meta.type === 'text') {
    return [{ value: 'contains', label: 'contains' }];
  }
  // number
  return [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '!=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
  ];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BORDER = 'var(--border)';
const CARD = 'var(--glass-01)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';
const PRIMARY = 'var(--safe)';

const selectStyle: React.CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer', outline: 'none',
};

const inputStyle: React.CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none', width: '100%',
};

const smallBtnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${BORDER}`, color: SUB,
  borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
};

// ---------------------------------------------------------------------------
// ICD-10 Autocomplete hook
// ---------------------------------------------------------------------------

interface OmopConcept { code: string; vocabulary_id: string; preferred_label: string }

function useIcd10Search() {
  const token = useAuthStore((s) => s.accessToken);
  const [results, setResults] = useState<OmopConcept[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback((term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term || term.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<{ items: OmopConcept[] }>(
          `/research/omop-concepts?search=${encodeURIComponent(term)}&vocabulary=ICD10CM&limit=8`,
          token ?? undefined,
        );
        setResults(data.items);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  }, [token]);

  return { results, loading, search, clear: () => setResults([]) };
}

// ---------------------------------------------------------------------------
// FilterRuleRow — single rule within a group
// ---------------------------------------------------------------------------

interface FilterRuleRowProps {
  rule: CohortFilterRule;
  onChange: (rule: CohortFilterRule) => void;
  onRemove: () => void;
}

function FilterRuleRow({ rule, onChange, onRemove }: FilterRuleRowProps) {
  const meta = FIELD_CATALOG[rule.field];
  const ops = getOpsForField(rule.field);
  const icd10 = useIcd10Search();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function renderValueInput() {
    if (!meta) return null;

    if (meta.type === 'enum') {
      if (rule.op === 'in') {
        // Multi-select checkboxes for 'in' operator
        const selected = Array.isArray(rule.value) ? rule.value : [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {meta.enumValues?.map((v) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: TEXT, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selected.includes(v)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...selected, v] : selected.filter((x) => x !== v);
                    onChange({ ...rule, value: next });
                  }}
                />
                {v}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select style={selectStyle} value={String(rule.value)} onChange={(e) => onChange({ ...rule, value: e.target.value })}>
          <option value="">Select...</option>
          {meta.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }

    if (meta.type === 'boolean') {
      return (
        <select style={selectStyle} value={String(rule.value)} onChange={(e) => onChange({ ...rule, value: e.target.value === 'true' })}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }

    if (rule.field === 'diagnosis_codes') {
      return (
        <div style={{ position: 'relative' }} ref={suggestionsRef}>
          <input
            type="text"
            style={inputStyle}
            placeholder={meta.placeholder}
            value={String(rule.value)}
            onChange={(e) => {
              onChange({ ...rule, value: e.target.value });
              icd10.search(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => { if (icd10.results.length > 0) setShowSuggestions(true); }}
          />
          {showSuggestions && icd10.results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--glass-02)', border: `1px solid ${BORDER}`, borderRadius: 6,
              maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              {icd10.results.map((c) => (
                <div
                  key={c.code}
                  style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', borderBottom: `1px solid ${BORDER}`, color: TEXT }}
                  onClick={() => { onChange({ ...rule, value: c.code }); setShowSuggestions(false); icd10.clear(); }}
                >
                  <span style={{ fontWeight: 600, color: PRIMARY }}>{c.code}</span>{' '}
                  <span style={{ color: SUB }}>{c.preferred_label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (meta.type === 'number') {
      return (
        <input
          type="number"
          style={inputStyle}
          value={rule.value === '' ? '' : Number(rule.value)}
          onChange={(e) => onChange({ ...rule, value: e.target.value === '' ? '' : Number(e.target.value) })}
          step={rule.field.startsWith('avg_') ? 0.1 : 1}
        />
      );
    }

    return (
      <input
        type="text"
        style={inputStyle}
        placeholder={meta.placeholder}
        value={String(rule.value)}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      />
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr auto',
      gap: 6, alignItems: 'center', padding: '5px 0',
    }}>
      {/* Field selector (categorized) */}
      <select
        style={selectStyle}
        value={rule.field}
        onChange={(e) => {
          const newField = e.target.value;
          const newOps = getOpsForField(newField);
          const defaultOp = newOps[0]?.value ?? 'eq';
          onChange({ field: newField, op: defaultOp, value: '' });
        }}
      >
        {CATEGORIES.map((cat) => (
          <optgroup key={cat} label={cat}>
            {Object.entries(FIELD_CATALOG)
              .filter(([, m]) => m.category === cat)
              .map(([key, m]) => <option key={key} value={key}>{m.label}</option>)
            }
          </optgroup>
        ))}
      </select>

      {/* Operator */}
      <select
        style={{ ...selectStyle, minWidth: 60 }}
        value={rule.op}
        onChange={(e) => onChange({ ...rule, op: e.target.value as FilterOp })}
      >
        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Value */}
      <div>{renderValueInput()}</div>

      {/* Remove */}
      <button
        onClick={onRemove}
        title="Remove rule"
        style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 15, padding: '2px 4px', lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterGroupEditor — recursive group component
// ---------------------------------------------------------------------------

interface FilterGroupEditorProps {
  group: CohortFilterGroup;
  onChange: (group: CohortFilterGroup) => void;
  onRemove?: () => void;
  depth?: number;
}

function makeDefaultRule(): CohortFilterRule {
  return { field: 'risk_level', op: 'eq', value: '' };
}

export function FilterGroupEditor({ group, onChange, onRemove, depth = 0 }: FilterGroupEditorProps) {
  const canNest = depth < 1; // max 2 levels

  function updateRule(index: number, updated: CohortFilterRule) {
    const next = [...group.rules];
    next[index] = updated;
    onChange({ ...group, rules: next });
  }

  function updateSubgroup(index: number, updated: CohortFilterGroup) {
    const next = [...group.rules];
    next[index] = updated;
    onChange({ ...group, rules: next });
  }

  function removeItem(index: number) {
    const next = group.rules.filter((_, i) => i !== index);
    onChange({ ...group, rules: next });
  }

  function addRule() {
    onChange({ ...group, rules: [...group.rules, makeDefaultRule()] });
  }

  function addSubgroup() {
    const sub: CohortFilterGroup = { logic: 'OR', rules: [makeDefaultRule()] };
    onChange({ ...group, rules: [...group.rules, sub] });
  }

  function toggleLogic() {
    onChange({ ...group, logic: group.logic === 'AND' ? 'OR' : 'AND' });
  }

  function isGroup(item: CohortFilterRule | CohortFilterGroup): item is CohortFilterGroup {
    return 'logic' in item && 'rules' in item;
  }

  const borderColor = depth === 0 ? 'var(--safe)' : 'var(--info)';

  return (
    <div style={{
      border: `1px solid ${borderColor}33`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 6,
      padding: '8px 10px',
      marginBottom: depth === 0 ? 0 : 6,
      background: depth === 0 ? 'transparent' : 'var(--glass-01)',
    }}>
      {/* Group header: logic toggle + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button
          onClick={toggleLogic}
          style={{
            background: `${borderColor}22`, border: `1px solid ${borderColor}55`, color: borderColor,
            borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {group.logic}
        </button>
        <span style={{ fontSize: 11, color: SUB }}>
          {group.logic === 'AND' ? 'All conditions must match' : 'Any condition matches'}
        </span>
        {onRemove && (
          <button onClick={onRemove} style={{ ...smallBtnStyle, marginLeft: 'auto', color: 'var(--critical)', borderColor: 'var(--critical)' }}>
            Remove Group
          </button>
        )}
      </div>

      {/* Rules + sub-groups */}
      {group.rules.map((item, i) =>
        isGroup(item) ? (
          <FilterGroupEditor
            key={i}
            group={item}
            onChange={(updated) => updateSubgroup(i, updated)}
            onRemove={() => removeItem(i)}
            depth={depth + 1}
          />
        ) : (
          <FilterRuleRow
            key={i}
            rule={item}
            onChange={(updated) => updateRule(i, updated)}
            onRemove={() => removeItem(i)}
          />
        )
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={addRule} style={smallBtnStyle}>+ Rule</button>
        {canNest && <button onClick={addSubgroup} style={smallBtnStyle}>+ Group</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CohortFilterBuilder — wraps FilterGroupEditor + saved cohorts
// ---------------------------------------------------------------------------

export interface CohortFilterBuilderProps {
  filterGroup: CohortFilterGroup;
  onFilterChange: (group: CohortFilterGroup) => void;
  liveCount: number | null;
  countLoading: boolean;
  onSearch: () => void;
}

export function CohortFilterBuilder({
  filterGroup,
  onFilterChange,
  liveCount,
  countLoading,
  onSearch,
}: CohortFilterBuilderProps) {
  return (
    <div className="panel anim" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Filter Builder</div>
          <div className="panel-sub">Define cohort criteria with AND/OR logic</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        {filterGroup.rules.length === 0 ? (
          <div style={{ color: SUB, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            No filters yet — click "+ Rule" to start building your cohort
          </div>
        ) : (
          <FilterGroupEditor group={filterGroup} onChange={onFilterChange} />
        )}

        {/* Quick add if empty */}
        {filterGroup.rules.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => onFilterChange({ ...filterGroup, rules: [makeDefaultRule()] })}
              style={{
                background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`, color: PRIMARY,
                borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Add First Rule
            </button>
          </div>
        )}
      </div>

      {/* Live count + search trigger */}
      {filterGroup.rules.length > 0 && (
        <div style={{
          padding: '10px 16px 14px',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: SUB }}>Matching:</div>
          <div style={{
            fontSize: 18, fontWeight: 800,
            color: countLoading ? SUB : liveCount !== null ? PRIMARY : 'var(--ink-soft)',
          }}>
            {countLoading ? '...' : liveCount !== null ? liveCount.toLocaleString() : '--'}
          </div>
          <span style={{ fontSize: 12, color: SUB }}>patients</span>
          <button
            onClick={onSearch}
            style={{
              marginLeft: 'auto',
              background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`, color: PRIMARY,
              borderRadius: 6, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>
      )}
    </div>
  );
}
