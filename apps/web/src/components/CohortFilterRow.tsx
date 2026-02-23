// =============================================================================
// MindLog Web — CohortFilterRow
// A single filter criterion row: field selector + operator + value input.
// =============================================================================

import { type CSSProperties } from 'react';

export type FilterField =
  | 'diagnosis'
  | 'age_min'
  | 'age_max'
  | 'risk_level'
  | 'phq9_severity'
  | 'gad7_severity'
  | 'medication'
  | 'tracking_streak_min'
  | 'period_start'
  | 'period_end'
  | 'active_only';

export interface CohortFilter {
  id:    string;
  field: FilterField;
  value: string;
}

const FIELD_LABELS: Record<FilterField, string> = {
  diagnosis:           'ICD-10 Diagnosis',
  age_min:             'Minimum Age',
  age_max:             'Maximum Age',
  risk_level:          'Risk Level',
  phq9_severity:       'PHQ-9 Severity',
  gad7_severity:       'GAD-7 Severity',
  medication:          'Medication Name',
  tracking_streak_min: 'Min Tracking Streak (days)',
  period_start:        'Period Start',
  period_end:          'Period End',
  active_only:         'Active Patients Only',
};

const FIELD_OPTIONS: Array<{ value: FilterField; label: string }> = (
  Object.entries(FIELD_LABELS) as [FilterField, string][]
).map(([value, label]) => ({ value, label }));

const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'];
const PHQ9_LEVELS = ['none', 'mild', 'moderate', 'moderately_severe', 'severe'];
const GAD7_LEVELS = ['minimal', 'mild', 'moderate', 'severe'];

const CARD = 'var(--glass-01)';
const BORDER = 'var(--border)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';

function selectStyle(): CSSProperties {
  return {
    background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
    borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', outline: 'none',
  };
}

function inputStyle(): CSSProperties {
  return {
    background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
    borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', width: '100%',
  };
}

interface CohortFilterRowProps {
  filter: CohortFilter;
  onChange: (updated: CohortFilter) => void;
  onRemove: () => void;
}

export function CohortFilterRow({ filter, onChange, onRemove }: CohortFilterRowProps) {
  const update = (patch: Partial<CohortFilter>) => onChange({ ...filter, ...patch });

  function renderValueInput() {
    if (filter.field === 'risk_level') {
      return (
        <select style={selectStyle()} value={filter.value} onChange={(e) => update({ value: e.target.value })}>
          <option value="">Any</option>
          {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      );
    }
    if (filter.field === 'phq9_severity') {
      return (
        <select style={selectStyle()} value={filter.value} onChange={(e) => update({ value: e.target.value })}>
          <option value="">Any</option>
          {PHQ9_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      );
    }
    if (filter.field === 'gad7_severity') {
      return (
        <select style={selectStyle()} value={filter.value} onChange={(e) => update({ value: e.target.value })}>
          <option value="">Any</option>
          {GAD7_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      );
    }
    if (filter.field === 'active_only') {
      return (
        <select style={selectStyle()} value={filter.value} onChange={(e) => update({ value: e.target.value })}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (filter.field === 'period_start' || filter.field === 'period_end') {
      return (
        <input
          type="date"
          style={inputStyle()}
          value={filter.value}
          onChange={(e) => update({ value: e.target.value })}
        />
      );
    }
    return (
      <input
        type={['age_min', 'age_max', 'tracking_streak_min'].includes(filter.field) ? 'number' : 'text'}
        style={inputStyle()}
        placeholder={filter.field === 'diagnosis' ? 'e.g. F32.1' : filter.field === 'medication' ? 'e.g. Sertraline' : ''}
        value={filter.value}
        onChange={(e) => update({ value: e.target.value })}
        min={0}
      />
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 2fr auto',
      gap: 8, alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${BORDER}`,
    }}>
      <select
        style={selectStyle()}
        value={filter.field}
        onChange={(e) => update({ field: e.target.value as FilterField, value: '' })}
      >
        {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div>{renderValueInput()}</div>

      <button
        onClick={onRemove}
        title="Remove filter"
        style={{
          background: 'transparent', border: 'none', color: 'var(--ink-soft)',
          cursor: 'pointer', fontSize: 16, padding: '4px 6px',
          borderRadius: 4, lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
