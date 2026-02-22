// =============================================================================
// MindLog Web — Reports page
// Prototype layout: 3 report-type cards + request form + reports list.
// Glassmorphic design with frosted glass cards.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportItem {
  id: string;
  patient_id: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  report_type: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  file_url: string | null;
  file_size_bytes: number | null;
  generated_at: string | null;
  expires_at: string | null;
  created_at: string;
  parameters: { report_subtype?: string } | null;
}

interface CaseloadPatient {
  patient_id: string;
  first_name: string;
  last_name: string;
  mrn: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Queued',      color: 'var(--warning)',  bg: 'var(--warning-bg)'  },
  generating: { label: 'Generating…', color: 'var(--info)',     bg: 'var(--info-bg)'     },
  ready:      { label: 'Ready',       color: 'var(--safe)',     bg: 'var(--safe-bg)'     },
  failed:     { label: 'Failed',      color: 'var(--critical)', bg: 'var(--critical-bg)' },
};

const REPORT_TYPES = [
  {
    key: 'weekly_summary' as const,
    icon: '📄',
    title: 'Individual Patient',
    desc: '30-day mood, triggers, symptoms and medication adherence. Export as PDF for clinical handoff.',
    days: 30,
  },
  {
    key: 'monthly_summary' as const,
    icon: '👥',
    title: 'Population Summary',
    desc: 'Aggregate outcomes across your caseload. Suitable for department review and supervision.',
    days: 30,
  },
  {
    key: 'clinical_export' as const,
    icon: '🔄',
    title: 'Handover Report',
    desc: 'Flagged patients, active alerts, and outstanding actions for cover clinician.',
    days: 90,
  },
];

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function defaultRange(days: number): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ReportItem['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['failed']!;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 'var(--r-xs)', padding: '2px 8px',
      fontSize: 11, fontWeight: 600,
    }}>
      {status === 'generating' && '⟳ '}{cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();

  // Report list state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);

  // Patient list for form
  const [patients, setPatients] = useState<CaseloadPatient[]>([]);

  // Form state — opened by clicking a report-type card
  const [activeType, setActiveType] = useState<typeof REPORT_TYPES[number]['key'] | null>(null);
  const [formPatient, setFormPatient] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------------

  const fetchReports = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const d = await api.get<{ items: ReportItem[]; total: number }>(
        `/reports?page=${page}&limit=20`, token,
      );
      setReports(d.items);
      setTotal(d.total);
    } catch { /* silent */ } finally {
      setListLoading(false);
    }
  }, [token, page]);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  useEffect(() => {
    if (!token) return;
    void api.get<CaseloadPatient[]>('/clinicians/caseload', token)
      .then((rows) => setPatients(rows))
      .catch(() => {});
  }, [token]);

  // Poll while any report is pending/generating
  useEffect(() => {
    const hasPending = reports.some((r) => r.status === 'pending' || r.status === 'generating');
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => { void fetchReports(); }, 5000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [reports, fetchReports]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCardClick = (key: typeof REPORT_TYPES[number]['key'], days: number) => {
    if (activeType === key) { setActiveType(null); return; }
    const { start, end } = defaultRange(days);
    setFormStart(start); setFormEnd(end);
    setFormPatient(''); setFormError(null);
    setActiveType(key);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeType) return;
    // Only individual patient reports need a selected patient
    const needsPatient = activeType === 'weekly_summary';
    if (needsPatient && !formPatient) return;
    setSubmitting(true); setFormError(null);
    try {
      await api.post('/reports', {
        ...(needsPatient ? { patient_id: formPatient } : {}),
        report_type: activeType,
        period_start: formStart,
        period_end: formEnd,
      }, token);
      setActiveType(null);
      await fetchReports();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to request report');
    } finally { setSubmitting(false); }
  };

  const currentTypeInfo = REPORT_TYPES.find((t) => t.key === activeType);

  return (
    <div className="view-pad">

      {/* ── 3 Report-type cards ── */}
      <div className="panel anim">
        <div className="panel-header">
          <div className="panel-title">Generate Clinical Reports</div>
          <div className="panel-sub">Select a report type to begin</div>
        </div>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {REPORT_TYPES.map((rt) => (
            <div
              key={rt.key}
              className="report-type-card"
              onClick={() => handleCardClick(rt.key, rt.days)}
              style={activeType === rt.key ? {
                borderColor: 'rgba(110,168,254,0.45)',
                background: 'rgba(110,168,254,0.09)',
                boxShadow: '0 0 20px rgba(110,168,254,0.18), inset 0 1px 0 rgba(110,168,254,0.12)',
              } : {}}
            >
              <div className="report-type-card-icon">{rt.icon}</div>
              <div className="report-type-card-title">{rt.title}</div>
              <div className="report-type-card-desc">{rt.desc}</div>
              <div className="report-type-card-action">
                {activeType === rt.key ? '▲ Close form' : 'Generate →'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Inline request form — shown when a card is selected ── */}
      {activeType && currentTypeInfo && (
        <div className="panel anim" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">{currentTypeInfo.icon} {currentTypeInfo.title}</div>
              <div className="panel-sub">Configure report parameters</div>
            </div>
            <button className="panel-action" onClick={() => setActiveType(null)}>✕ Cancel</button>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>

                {/* Patient — only for individual patient reports */}
                {activeType === 'weekly_summary' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--ink-mid)', marginBottom: 4 }}>
                      Patient
                    </label>
                    <select
                      required
                      value={formPatient}
                      onChange={(e) => setFormPatient(e.target.value)}
                      className="form-input"
                    >
                      <option value="">Select a patient…</option>
                      {patients.map((p) => (
                        <option key={p.patient_id} value={p.patient_id}>
                          {p.last_name}, {p.first_name} — {p.mrn}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Period start */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--ink-mid)', marginBottom: 4 }}>
                    Period Start
                  </label>
                  <input
                    type="date" required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="form-input"
                  />
                </div>

                {/* Period end */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--ink-mid)', marginBottom: 4 }}>
                    Period End
                  </label>
                  <input
                    type="date" required
                    value={formEnd} min={formStart}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="form-input"
                  />
                </div>

                {/* Submit */}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={submitting || (activeType === 'weekly_summary' && !formPatient)}
                    style={{
                      width: '100%', padding: '9px 16px',
                      background: 'rgba(110,168,254,0.13)',
                      border: '1px solid rgba(110,168,254,0.35)',
                      borderRadius: 'var(--r-sm)',
                      color: 'var(--info)', fontSize: 13, fontWeight: 700,
                      cursor: submitting || (activeType === 'weekly_summary' && !formPatient) ? 'not-allowed' : 'pointer',
                      opacity: submitting || (activeType === 'weekly_summary' && !formPatient) ? 0.5 : 1,
                      fontFamily: 'var(--font-body)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {submitting ? '⟳ Generating…' : 'Generate Report'}
                  </button>
                </div>
              </div>

              {formError && (
                <div style={{
                  background: 'var(--critical-bg)',
                  border: '1px solid var(--critical-border)',
                  borderRadius: 'var(--r-sm)', padding: '8px 12px',
                  color: 'var(--critical)', fontSize: 13,
                }}>
                  {formError}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Reports history table ── */}
      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Report History</div>
            {total > 0 && <div className="panel-sub">{total} total</div>}
          </div>
        </div>

        {listLoading && reports.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 40 }}>Loading…</div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">No reports yet</div>
            Select a report type above to generate your first PDF.
          </div>
        ) : (
          <>
            <table className="patient-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Patient</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const expired = isExpired(r.expires_at);
                  const subtype = r.parameters?.report_subtype ?? r.report_type;
                  return (
                    <tr key={r.id} style={{ opacity: r.status === 'failed' ? 0.6 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, textTransform: 'capitalize' }}>
                          {String(subtype).replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td>
                        {r.patient_first_name ? (
                          <button
                            onClick={() => r.patient_id && navigate(`/patients/${r.patient_id}`)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--info)',
                              fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                            }}
                          >
                            {r.patient_last_name}, {r.patient_first_name}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--ink-soft)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.date_range_start)}<br />
                        <span style={{ fontSize: 11 }}>→ {fmtDate(r.date_range_end)}</span>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                        {r.generated_at && (
                          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 4 }}>
                            {fmtDate(r.generated_at)}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                        {r.file_size_bytes ? fmtBytes(r.file_size_bytes) : '—'}
                      </td>
                      <td>
                        {r.status === 'ready' && r.file_url && !expired ? (
                          <a
                            href={r.file_url} target="_blank" rel="noopener noreferrer"
                            className="action-btn resolve"
                            style={{ textDecoration: 'none', display: 'inline-block' }}
                          >
                            ↓ PDF
                          </a>
                        ) : r.status === 'ready' && expired ? (
                          <span style={{ color: 'var(--warning)', fontSize: 11 }}>Link expired</span>
                        ) : r.status === 'pending' || r.status === 'generating' ? (
                          <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>⏳ Pending</span>
                        ) : r.status === 'failed' ? (
                          <span style={{ color: 'var(--critical)', fontSize: 11 }}>Error</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {total > 20 && (
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <span className="page-info">Page {page} of {Math.ceil(total / 20)}</span>
                <button className="page-btn" disabled={reports.length < 20} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* HIPAA footnote */}
      <div style={{
        marginTop: 20, fontSize: 11, color: 'var(--ink-ghost)',
        borderTop: '1px solid var(--border)', paddingTop: 12,
      }}>
        PDFs stored in Supabase Storage (private bucket: <code style={{ color: 'var(--ink-mid)' }}>reports</code>).{' '}
        Download links expire after 7 days. HIPAA: PDFs contain PHI — BAA required before production.
      </div>
    </div>
  );
}
