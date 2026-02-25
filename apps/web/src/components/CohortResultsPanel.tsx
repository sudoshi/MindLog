// =============================================================================
// MindLog Web — CohortResultsPanel
// Results table + analytics charts + export for Cohort Builder v2.
// =============================================================================

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import type { CohortFilterGroup } from '@mindlog/shared';
import { api, ApiError } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CohortPatientRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  risk_level: string;
  status: string;
  latest_phq9: number | null;
  latest_gad7: number | null;
  latest_asrm: number | null;
  avg_mood_30d: number | null;
  tracking_streak: number;
  diagnosis_codes: string[] | null;
  active_med_count: number;
  age: number;
  gender: string | null;
  checkins_30d: number;
}

export interface CohortAggregates {
  total_count: number;
  avg_mood: number | null;
  avg_phq9: number | null;
  avg_gad7: number | null;
  risk_distribution: Record<string, number>;
  gender_distribution: Record<string, number>;
  avg_tracking_streak: number | null;
  avg_med_count: number | null;
}

export interface CohortSnapshot {
  computed_at: string;
  patient_count: number;
  avg_mood: number | null;
  avg_phq9: number | null;
  avg_gad7: number | null;
  risk_distribution: Record<string, number> | null;
  avg_tracking_streak: number | null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BORDER = 'var(--border)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';
const PRIMARY = 'var(--safe)';
const CRITICAL = 'var(--critical)';

const RISK_COLORS: Record<string, string> = {
  low: '#6edcd0',
  moderate: '#c9972a',
  high: '#e07a3a',
  critical: '#e0503a',
};

const GENDER_COLORS: Record<string, string> = {
  male: '#5b8ff9',
  female: '#ff6b9d',
  non_binary: '#9b72cf',
  other: '#7ec7a2',
};

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ aggregates }: { aggregates: CohortAggregates }) {
  const metrics = [
    { label: 'Patients', value: aggregates.total_count.toLocaleString(), color: PRIMARY },
    { label: 'Avg PHQ-9', value: aggregates.avg_phq9?.toFixed(1) ?? '--', color: Number(aggregates.avg_phq9 ?? 0) >= 15 ? CRITICAL : TEXT },
    { label: 'Avg GAD-7', value: aggregates.avg_gad7?.toFixed(1) ?? '--', color: TEXT },
    { label: 'Avg Mood', value: aggregates.avg_mood?.toFixed(1) ?? '--', color: TEXT },
    { label: 'Avg Streak', value: aggregates.avg_tracking_streak?.toFixed(0) ?? '--', color: TEXT },
  ];

  return (
    <div style={{
      display: 'flex', gap: 16, padding: '12px 16px',
      background: 'var(--glass-01)', borderRadius: 8,
      border: `1px solid ${BORDER}`, marginBottom: 14,
      flexWrap: 'wrap',
    }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ minWidth: 80 }}>
          <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>{m.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient table
// ---------------------------------------------------------------------------

interface PatientTableProps {
  patients: CohortPatientRow[];
  sorting: { field: string; dir: string };
  onSort: (field: string) => void;
  pagination: { total: number; limit: number; offset: number; has_next: boolean };
  onPageChange: (offset: number) => void;
}

function PatientTable({ patients, sorting, onSort, pagination, onPageChange }: PatientTableProps) {
  const navigate = useNavigate();

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'risk_level', label: 'Risk', sortable: true },
    { key: 'latest_phq9', label: 'PHQ-9', sortable: true },
    { key: 'latest_gad7', label: 'GAD-7', sortable: true },
    { key: 'avg_mood_30d', label: 'Mood (30d)', sortable: true },
    { key: 'tracking_streak', label: 'Streak', sortable: true },
    { key: 'status', label: 'Status', sortable: false },
  ];

  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  function riskBadge(level: string) {
    const color = RISK_COLORS[level] ?? SUB;
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
        fontSize: 11, fontWeight: 600, background: `${color}22`, color,
        border: `1px solid ${color}44`,
      }}>
        {level}
      </span>
    );
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && onSort(col.key)}
                  style={{
                    padding: '8px 10px', textAlign: 'left', color: SUB, fontWeight: 600,
                    cursor: col.sortable ? 'pointer' : 'default', whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {col.label}
                  {sorting.field === col.key && (
                    <span style={{ marginLeft: 4 }}>{sorting.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: SUB }}>
                  No matching patients
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr
                  key={p.patient_id}
                  style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
                  onClick={() => navigate(`/patients/${p.patient_id}`)}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-01)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '8px 10px', color: TEXT, fontWeight: 500 }}>
                    {p.first_name} {p.last_name}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{riskBadge(p.risk_level)}</td>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{p.latest_phq9 ?? '--'}</td>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{p.latest_gad7 ?? '--'}</td>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{p.avg_mood_30d?.toFixed(1) ?? '--'}</td>
                  <td style={{ padding: '8px 10px', color: TEXT }}>{p.tracking_streak}</td>
                  <td style={{ padding: '8px 10px', color: SUB }}>{p.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 0', marginTop: 8, borderTop: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontSize: 12, color: SUB }}>
            Page {page} of {totalPages} ({pagination.total} total)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                background: 'var(--glass-01)', border: `1px solid ${BORDER}`, color: TEXT,
                opacity: pagination.offset === 0 ? 0.4 : 1,
              }}
            >
              Prev
            </button>
            <button
              onClick={() => onPageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.has_next}
              style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                background: 'var(--glass-01)', border: `1px solid ${BORDER}`, color: TEXT,
                opacity: !pagination.has_next ? 0.4 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics tab
// ---------------------------------------------------------------------------

function AnalyticsTab({ aggregates }: { aggregates: CohortAggregates }) {
  const riskData = Object.entries(aggregates.risk_distribution).map(([name, value]) => ({
    name, value, color: RISK_COLORS[name] ?? '#888',
  }));

  const genderData = Object.entries(aggregates.gender_distribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name, value, color: GENDER_COLORS[name] ?? '#888',
    }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {/* Risk Distribution */}
      <div style={{ padding: 14, background: 'var(--glass-01)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Risk Distribution</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={riskData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 10, fill: SUB }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: TEXT }} width={70} />
            <RechartsTooltip
              contentStyle={{ background: '#1a1e2e', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: TEXT }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {riskData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gender Distribution */}
      <div style={{ padding: 14, background: 'var(--glass-01)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Gender Distribution</div>
        {genderData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {genderData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{ background: '#1a1e2e', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SUB, fontSize: 12 }}>
            No gender data
          </div>
        )}
      </div>

      {/* Score averages */}
      <div style={{ padding: 14, background: 'var(--glass-01)', borderRadius: 8, border: `1px solid ${BORDER}`, gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Cohort Averages</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {[
            { label: 'PHQ-9', value: aggregates.avg_phq9, max: 27 },
            { label: 'GAD-7', value: aggregates.avg_gad7, max: 21 },
            { label: 'Mood (30d)', value: aggregates.avg_mood, max: 10 },
            { label: 'Streak', value: aggregates.avg_tracking_streak, max: null },
            { label: 'Medications', value: aggregates.avg_med_count, max: null },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: PRIMARY }}>{m.value?.toFixed(1) ?? '--'}</div>
              <div style={{ fontSize: 11, color: SUB }}>{m.label}{m.max ? ` / ${m.max}` : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export tab
// ---------------------------------------------------------------------------

interface ExportJob {
  id: string;
  status: string;
  file_url: string | null;
  record_count: number | null;
}

function ExportTab({ hasFilters, filterGroup }: { hasFilters: boolean; filterGroup: CohortFilterGroup }) {
  const token = useAuthStore((s) => s.accessToken);
  const [format, setFormat] = useState<'ndjson' | 'csv' | 'fhir_bundle'>('csv');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);

  const pollExport = useCallback(async (jobId: string) => {
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const data = await api.get<ExportJob>(`/research/${jobId}`, token ?? undefined);
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 2000);
  }, [token]);

  async function handleExport() {
    if (!token) return;
    setSubmitting(true);
    try {
      const result = await api.post<ExportJob>('/research/', { filters: filterGroup, format }, token);
      setJob(result);
      void pollExport(result.id);
    } catch (err) {
      setJob({ id: '', status: 'failed', file_url: null, record_count: null });
      console.error(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontSize: 12, color: SUB, marginBottom: 10 }}>Export format</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['ndjson', 'csv', 'fhir_bundle'] as const).map((fmt) => (
          <button
            key={fmt}
            onClick={() => setFormat(fmt)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: format === fmt ? 'var(--info)' : 'var(--glass-01)',
              color: format === fmt ? '#0a0e1a' : SUB,
              border: `1px solid ${format === fmt ? 'var(--info)' : BORDER}`,
              cursor: 'pointer',
            }}
          >
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>

      <button
        onClick={() => void handleExport()}
        disabled={submitting || !hasFilters}
        style={{
          width: '100%', background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`,
          color: PRIMARY, borderRadius: 8, padding: '9px 16px',
          fontSize: 13, fontWeight: 600,
          cursor: submitting || !hasFilters ? 'not-allowed' : 'pointer',
          opacity: !hasFilters ? 0.5 : 1,
        }}
      >
        {submitting ? 'Queuing...' : 'Export Cohort Data'}
      </button>

      <div style={{ fontSize: 11, color: SUB, marginTop: 8, textAlign: 'center' }}>
        De-identified per HIPAA Safe Harbour (18 PHI fields removed)
      </div>

      {job && (
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 8,
          background: 'var(--glass-02)', border: `1px solid ${BORDER}`, fontSize: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SUB }}>Status</span>
            <span style={{
              fontWeight: 700,
              color: job.status === 'completed' ? PRIMARY : job.status === 'failed' ? CRITICAL : '#c9972a',
            }}>
              {polling ? 'Processing...' : job.status.toUpperCase()}
            </span>
          </div>
          {job.record_count != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: SUB }}>Records</span>
              <span style={{ color: TEXT }}>{job.record_count.toLocaleString()}</span>
            </div>
          )}
          {job.status === 'completed' && job.file_url && (
            <a
              href={job.file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', marginTop: 8, textAlign: 'center',
                background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`,
                color: PRIMARY, borderRadius: 6, padding: '7px 12px',
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Download Export
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CohortResultsPanel
// ---------------------------------------------------------------------------

export interface CohortResultsPanelProps {
  patients: CohortPatientRow[];
  aggregates: CohortAggregates | null;
  pagination: { total: number; limit: number; offset: number; has_next: boolean };
  sorting: { field: string; dir: string };
  onSort: (field: string) => void;
  onPageChange: (offset: number) => void;
  loading: boolean;
  hasFilters: boolean;
  filterGroup: CohortFilterGroup;
}

export function CohortResultsPanel({
  patients,
  aggregates,
  pagination,
  sorting,
  onSort,
  onPageChange,
  loading,
  hasFilters,
  filterGroup,
}: CohortResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<'patients' | 'analytics' | 'export'>('patients');

  const tabs = [
    { key: 'patients' as const, label: 'Patient List' },
    { key: 'analytics' as const, label: 'Analytics' },
    { key: 'export' as const, label: 'Export' },
  ];

  return (
    <div className="panel anim">
      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${BORDER}`,
        padding: '0 16px',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 600,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${PRIMARY}` : '2px solid transparent',
              color: activeTab === tab.key ? PRIMARY : SUB,
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* Summary bar (always visible when we have aggregates) */}
        {aggregates && <SummaryBar aggregates={aggregates} />}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: SUB, fontSize: 13 }}>
            Querying cohort...
          </div>
        ) : !aggregates ? (
          <div style={{ padding: 40, textAlign: 'center', color: SUB, fontSize: 13 }}>
            Add filters and click "Search" to see results
          </div>
        ) : (
          <>
            {activeTab === 'patients' && (
              <PatientTable
                patients={patients}
                sorting={sorting}
                onSort={onSort}
                pagination={pagination}
                onPageChange={onPageChange}
              />
            )}
            {activeTab === 'analytics' && <AnalyticsTab aggregates={aggregates} />}
            {activeTab === 'export' && <ExportTab hasFilters={hasFilters} filterGroup={filterGroup} />}
          </>
        )}
      </div>
    </div>
  );
}
