// =============================================================================
// MindLog Web — Cohort Builder & Research Export page
// Route: /cohort  (admin / researcher roles only)
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, ApiError } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { CohortFilterRow, type CohortFilter, type FilterField } from '../components/CohortFilterRow.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedCohort {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  last_count: number | null;
  last_run_at: string | null;
  created_at: string;
}

interface ExportJob {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  file_url: string | null;
  record_count: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function filtersToApiPayload(filters: CohortFilter[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of filters) {
    if (f.value === '' || f.value === undefined) continue;
    if (f.field === 'active_only') {
      out[f.field] = f.value === 'true';
    } else if (['age_min', 'age_max', 'tracking_streak_min'].includes(f.field)) {
      out[f.field] = Number(f.value);
    } else {
      out[f.field] = f.value;
    }
  }
  return out;
}

const CARD = 'var(--glass-01)';
const BORDER = 'var(--border)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';
const PRIMARY = 'var(--safe)';
const CRITICAL = 'var(--critical)';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CohortPage() {
  const token = useAuthStore((s) => s.accessToken);

  const [filters, setFilters]               = useState<CohortFilter[]>([]);
  const [liveCount, setLiveCount]           = useState<number | null>(null);
  const [countLoading, setCountLoading]     = useState(false);
  const [savedCohorts, setSavedCohorts]     = useState<SavedCohort[]>([]);
  const [cohortName, setCohortName]         = useState('');
  const [exportFormat, setExportFormat]     = useState<'ndjson' | 'csv' | 'fhir_bundle'>('ndjson');
  const [exportJob, setExportJob]           = useState<ExportJob | null>(null);
  const [polling, setPolling]               = useState(false);
  const [savingCohort, setSavingCohort]     = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [toast, setToast]                   = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch saved cohorts on mount
  useEffect(() => {
    if (!token) return;
    void api.get<SavedCohort[]>('/research/', token).then(setSavedCohorts).catch(() => {});
  }, [token]);

  // Live count — debounced 400ms after filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const payload = filtersToApiPayload(filters);
    if (Object.keys(payload).length === 0) {
      setLiveCount(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (!token) return;
      setCountLoading(true);
      try {
        const res = await api.get<{ count: number }>(
          `/research/cohorts/count?filters=${encodeURIComponent(JSON.stringify(payload))}`,
          token,
        );
        setLiveCount(res.count);
      } catch {
        setLiveCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 400);
  }, [filters, token]);

  // Poll export status
  const pollExport = useCallback(async (jobId: string) => {
    if (!token) return;
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const job = await api.get<ExportJob>(`/research/${jobId}`, token);
        setExportJob(job);
        if (job.status === 'complete' || job.status === 'failed') {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 2000);
  }, [token]);

  function addFilter() {
    setFilters((prev) => [...prev, { id: makeId(), field: 'risk_level' as FilterField, value: '' }]);
  }

  function updateFilter(id: string, updated: CohortFilter) {
    setFilters((prev) => prev.map((f) => (f.id === id ? updated : f)));
  }

  function removeFilter(id: string) {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function handleSaveCohort() {
    if (!token || !cohortName.trim()) return;
    setSavingCohort(true);
    try {
      const payload = filtersToApiPayload(filters);
      await api.post('/research/cohorts', { name: cohortName.trim(), filters: payload }, token);
      const cohorts = await api.get<SavedCohort[]>('/research/', token);
      setSavedCohorts(cohorts);
      setCohortName('');
      showToast('Cohort saved');
    } catch {
      showToast('Failed to save cohort');
    } finally {
      setSavingCohort(false);
    }
  }

  async function handleExport() {
    if (!token) return;
    setExportSubmitting(true);
    try {
      const payload = filtersToApiPayload(filters);
      const job = await api.post<ExportJob>('/research/', {
        filters: payload,
        format: exportFormat,
      }, token);
      setExportJob(job);
      void pollExport(job.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExportSubmitting(false);
    }
  }

  function loadCohort(cohort: SavedCohort) {
    const loaded: CohortFilter[] = Object.entries(cohort.filters).map(([field, value]) => ({
      id: makeId(),
      field: field as FilterField,
      value: String(value),
    }));
    setFilters(loaded);
  }

  return (
    <div className="view-pad">
      <div className="two-col" style={{ alignItems: 'start' }}>

        {/* ── LEFT: Filter builder ── */}
        <div>
          <div className="panel anim" style={{ marginBottom: 14 }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">Build Cohort</div>
                <div className="panel-sub">Add filters to define your research population</div>
              </div>
              <button
                className="panel-action"
                onClick={addFilter}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                + Add Filter
              </button>
            </div>

            <div style={{ padding: '0 16px 12px' }}>
              {filters.length === 0 ? (
                <div style={{ color: SUB, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                  No filters — click "+ Add Filter" to start building your cohort
                </div>
              ) : (
                filters.map((f) => (
                  <CohortFilterRow
                    key={f.id}
                    filter={f}
                    onChange={(updated) => updateFilter(f.id, updated)}
                    onRemove={() => removeFilter(f.id)}
                  />
                ))
              )}
            </div>

            {/* Live count badge */}
            {filters.length > 0 && (
              <div style={{
                padding: '10px 16px 14px',
                borderTop: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 13, color: SUB }}>Matching patients:</div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: countLoading ? SUB : liveCount !== null ? PRIMARY : 'var(--ink-soft)',
                }}>
                  {countLoading ? '…' : liveCount !== null ? liveCount : '—'}
                </div>
              </div>
            )}
          </div>

          {/* Save cohort */}
          {filters.length > 0 && (
            <div className="panel anim anim-d1" style={{ marginBottom: 14 }}>
              <div className="panel-header">
                <div className="panel-title">Save Cohort Definition</div>
              </div>
              <div style={{ padding: '8px 16px 14px', display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Cohort name…"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  style={{
                    flex: 1, background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
                    borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none',
                  }}
                />
                <button
                  onClick={() => void handleSaveCohort()}
                  disabled={savingCohort || !cohortName.trim()}
                  style={{
                    background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`, color: PRIMARY,
                    borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    cursor: savingCohort || !cohortName.trim() ? 'not-allowed' : 'pointer',
                    opacity: !cohortName.trim() ? 0.5 : 1,
                  }}
                >
                  {savingCohort ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Export + Saved cohorts ── */}
        <div>
          {/* Export panel */}
          <div className="panel anim" style={{ marginBottom: 14 }}>
            <div className="panel-header">
              <div className="panel-title">Export Cohort</div>
              <div className="panel-sub">De-identified per HIPAA Safe Harbour</div>
            </div>
            <div style={{ padding: '8px 16px 14px' }}>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 8 }}>Export format</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['ndjson', 'csv', 'fhir_bundle'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: exportFormat === fmt ? 'var(--info)' : CARD,
                      color: exportFormat === fmt ? '#0a0e1a' : SUB,
                      border: `1px solid ${exportFormat === fmt ? 'var(--info)' : BORDER}`,
                      cursor: 'pointer',
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                onClick={() => void handleExport()}
                disabled={exportSubmitting || filters.length === 0}
                style={{
                  width: '100%', background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`,
                  color: PRIMARY, borderRadius: 8, padding: '9px 16px',
                  fontSize: 13, fontWeight: 600,
                  cursor: exportSubmitting || filters.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: filters.length === 0 ? 0.5 : 1,
                }}
              >
                {exportSubmitting ? 'Queuing export…' : 'Export Cohort Data'}
              </button>

              {/* Export job status */}
              {exportJob && (
                <div style={{
                  marginTop: 14, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--glass-02)', border: `1px solid ${BORDER}`,
                  fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: SUB }}>Status</span>
                    <span style={{
                      fontWeight: 700,
                      color: exportJob.status === 'complete' ? PRIMARY
                           : exportJob.status === 'failed' ? CRITICAL
                           : '#c9972a',
                    }}>
                      {exportJob.status === 'processing' && polling ? '⏳ Processing…' : exportJob.status.toUpperCase()}
                    </span>
                  </div>
                  {exportJob.record_count !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: SUB }}>Records</span>
                      <span style={{ color: TEXT }}>{exportJob.record_count.toLocaleString()}</span>
                    </div>
                  )}
                  {exportJob.status === 'complete' && exportJob.file_url && (
                    <a
                      href={exportJob.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block', marginTop: 8, textAlign: 'center',
                        background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`,
                        color: PRIMARY, borderRadius: 6, padding: '7px 12px',
                        fontSize: 12, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      Download Export ↓
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Saved cohorts */}
          {savedCohorts.length > 0 && (
            <div className="panel anim anim-d1">
              <div className="panel-header">
                <div className="panel-title">Saved Cohorts</div>
                <div className="panel-sub">{savedCohorts.length} saved</div>
              </div>
              {savedCohorts.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => loadCohort(c)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{c.name}</div>
                    {c.last_count !== null && (
                      <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
                        {c.last_count} patients · last run {c.last_run_at ? new Date(c.last_run_at).toLocaleDateString() : 'never'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: PRIMARY }}>Load →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--glass-02)', border: `1px solid ${BORDER}`,
          color: TEXT, padding: '10px 18px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
