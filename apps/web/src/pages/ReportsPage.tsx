// =============================================================================
// MindLog Web — Reports page
// Clinicians request PDF reports and download them once generated.
// Polls status for in-progress jobs.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGN_TOKENS } from '@mindlog/shared';
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Queued',      color: '#faa307' },
  generating: { label: 'Generating…', color: '#3182ce' },
  ready:      { label: 'Ready',       color: '#6a994e' },
  failed:     { label: 'Failed',      color: '#d62828' },
};

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

function defaultDateRange(type: string): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (type === 'weekly_summary') {
    const start = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    return { start, end };
  }
  if (type === 'monthly_summary') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    return { start, end };
  }
  // clinical_export — last 90 days
  const start = new Date(today.getTime() - 89 * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ReportItem['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['failed']!;
  return (
    <span style={{
      background: `${cfg.color}22`, color: cfg.color,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
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
  const BG = '#0c0f18'; const CARD = '#161a27'; const BORDER = '#1e2535';
  const TEXT = '#e2e8f0'; const SUB = '#8b9cb0';

  // Report list state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);

  // Patient list for the form
  const [patients, setPatients] = useState<CaseloadPatient[]>([]);

  // New report form state
  const [formOpen, setFormOpen] = useState(false);
  const [formPatient, setFormPatient] = useState('');
  const [formType, setFormType] = useState<'weekly_summary' | 'monthly_summary' | 'clinical_export'>('weekly_summary');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Polling ref for in-progress reports
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchReports = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const d = await api.get<{ items: ReportItem[]; total: number }>(
        `/reports?page=${page}&limit=20`,
        token,
      );
      setReports(d.items);
      setTotal(d.total);
    } catch { /* silent */ } finally {
      setListLoading(false);
    }
  }, [token, page]);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  // Fetch caseload patients for the form selector
  useEffect(() => {
    if (!token) return;
    void api.get<CaseloadPatient[]>('/clinicians/caseload', token)
      .then((rows) => setPatients(rows))
      .catch(() => { /* silent */ });
  }, [token]);

  // Poll every 5s while any report is pending/generating
  useEffect(() => {
    const hasPending = reports.some((r) => r.status === 'pending' || r.status === 'generating');
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => { void fetchReports(); }, 5000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [reports, fetchReports]);

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  const handleTypeChange = (t: typeof formType) => {
    setFormType(t);
    const { start, end } = defaultDateRange(t);
    setFormStart(start);
    setFormEnd(end);
  };

  const openForm = () => {
    const { start, end } = defaultDateRange(formType);
    setFormStart(start);
    setFormEnd(end);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formPatient) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post('/reports', {
        patient_id: formPatient,
        report_type: formType,
        period_start: formStart,
        period_end: formEnd,
      }, token);
      setFormOpen(false);
      await fetchReports();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to request report');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: '#0c0f18', border: `1px solid ${BORDER}`, borderRadius: 6,
    color: TEXT, padding: '8px 10px', fontSize: 13, width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.5, color: SUB, marginBottom: 4,
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'Figtree, system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: CARD, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${BORDER}` }}>
        <h1
          onClick={() => navigate('/dashboard')}
          style={{ fontFamily: 'Fraunces, serif', color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 22, margin: 0, cursor: 'pointer' }}
        >
          MindLog
        </h1>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: SUB, textDecoration: 'none', fontSize: 14 }}>Dashboard</a>
          <a href="/alerts" style={{ color: SUB, textDecoration: 'none', fontSize: 14 }}>Alerts</a>
          <a href="/reports" style={{ color: DESIGN_TOKENS.COLOR_PRIMARY, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Reports</a>
        </nav>
      </header>

      <main style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
        {/* Title + New Report button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Clinical Reports
            {total > 0 && <span style={{ marginLeft: 10, fontSize: 14, color: SUB, fontWeight: 400 }}>{total} total</span>}
          </h2>
          <button
            onClick={openForm}
            style={{
              background: `${DESIGN_TOKENS.COLOR_PRIMARY}22`,
              border: `1px solid ${DESIGN_TOKENS.COLOR_PRIMARY}55`,
              color: DESIGN_TOKENS.COLOR_PRIMARY,
              borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + New Report
          </button>
        </div>

        {/* New report form panel */}
        {formOpen && (
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: 24, marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px' }}>Request New Report</h3>
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Patient */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Patient</label>
                  <select
                    required
                    value={formPatient}
                    onChange={(e) => setFormPatient(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select a patient…</option>
                    {patients.map((p) => (
                      <option key={p.patient_id} value={p.patient_id}>
                        {p.last_name}, {p.first_name} — {p.mrn}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Report type */}
                <div>
                  <label style={labelStyle}>Report Type</label>
                  <select
                    value={formType}
                    onChange={(e) => handleTypeChange(e.target.value as typeof formType)}
                    style={inputStyle}
                  >
                    <option value="weekly_summary">Weekly Summary (7 days)</option>
                    <option value="monthly_summary">Monthly Summary (30 days)</option>
                    <option value="clinical_export">Clinical Export (custom range)</option>
                  </select>
                </div>

                {/* Period start */}
                <div>
                  <label style={labelStyle}>Period Start</label>
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Period end */}
                <div>
                  <label style={labelStyle}>Period End</label>
                  <input
                    type="date"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    min={formStart}
                    style={inputStyle}
                  />
                </div>
              </div>

              {formError && (
                <div style={{ background: '#1a0a0a', border: '1px solid #d62828', borderRadius: 6, padding: '8px 12px', color: '#fc8181', fontSize: 13, marginBottom: 12 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  style={{ background: 'none', border: `1px solid ${BORDER}`, color: SUB, borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formPatient}
                  style={{
                    background: `${DESIGN_TOKENS.COLOR_PRIMARY}22`,
                    border: `1px solid ${DESIGN_TOKENS.COLOR_PRIMARY}55`,
                    color: DESIGN_TOKENS.COLOR_PRIMARY,
                    borderRadius: 6, padding: '7px 18px', fontSize: 13, fontWeight: 600,
                    cursor: submitting || !formPatient ? 'not-allowed' : 'pointer',
                    opacity: submitting || !formPatient ? 0.6 : 1,
                  }}
                >
                  {submitting ? 'Requesting…' : 'Generate Report'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Reports list */}
        {listLoading && reports.length === 0 ? (
          <div style={{ color: SUB, textAlign: 'center', padding: 48 }}>Loading…</div>
        ) : reports.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <div style={{ color: TEXT, fontSize: 16, fontWeight: 600 }}>No reports yet</div>
            <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>Click "+ New Report" to generate your first PDF.</div>
          </div>
        ) : (
          <>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Report', 'Patient', 'Period', 'Status', 'Size', 'Download'].map((h) => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600, color: SUB,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => {
                    const expired = isExpired(r.expires_at);
                    const subtype = r.parameters?.report_subtype ?? r.report_type;
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: i < reports.length - 1 ? `1px solid ${BORDER}` : 'none',
                          opacity: r.status === 'failed' ? 0.6 : 1,
                        }}
                      >
                        {/* Report title */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{r.title}</div>
                          <div style={{ fontSize: 11, color: SUB, marginTop: 2, textTransform: 'capitalize' }}>
                            {String(subtype).replace(/_/g, ' ')}
                          </div>
                        </td>

                        {/* Patient */}
                        <td style={{ padding: '14px 16px' }}>
                          {r.patient_first_name ? (
                            <button
                              onClick={() => r.patient_id && navigate(`/patients/${r.patient_id}`)}
                              style={{ background: 'none', border: 'none', color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                              {r.patient_last_name}, {r.patient_first_name}
                            </button>
                          ) : <span style={{ color: SUB }}>—</span>}
                        </td>

                        {/* Period */}
                        <td style={{ padding: '14px 16px', fontSize: 12, color: SUB, whiteSpace: 'nowrap' }}>
                          {fmtDate(r.date_range_start)}<br />
                          <span style={{ fontSize: 11 }}>→ {fmtDate(r.date_range_end)}</span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          <StatusBadge status={r.status} />
                          {r.generated_at && (
                            <div style={{ fontSize: 10, color: SUB, marginTop: 4 }}>
                              {fmtDate(r.generated_at)}
                            </div>
                          )}
                        </td>

                        {/* File size */}
                        <td style={{ padding: '14px 16px', fontSize: 12, color: SUB }}>
                          {r.file_size_bytes ? fmtBytes(r.file_size_bytes) : '—'}
                        </td>

                        {/* Download / status action */}
                        <td style={{ padding: '14px 16px' }}>
                          {r.status === 'ready' && r.file_url && !expired ? (
                            <a
                              href={r.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                background: `${DESIGN_TOKENS.COLOR_PRIMARY}22`,
                                border: `1px solid ${DESIGN_TOKENS.COLOR_PRIMARY}55`,
                                color: DESIGN_TOKENS.COLOR_PRIMARY,
                                borderRadius: 6, padding: '5px 12px',
                                fontSize: 12, fontWeight: 600,
                                textDecoration: 'none', display: 'inline-block',
                              }}
                            >
                              ↓ PDF
                            </a>
                          ) : r.status === 'ready' && expired ? (
                            <span style={{ color: '#faa307', fontSize: 11 }}>Link expired</span>
                          ) : r.status === 'pending' || r.status === 'generating' ? (
                            <span style={{ color: SUB, fontSize: 11 }}>⏳ Pending</span>
                          ) : r.status === 'failed' ? (
                            <span style={{ color: '#d62828', fontSize: 11 }}>Error</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                <PBtn label="← Prev" disabled={page === 1} onClick={() => setPage((p) => p - 1)} />
                <span style={{ color: SUB, fontSize: 14, alignSelf: 'center' }}>Page {page}</span>
                <PBtn label="Next →" disabled={reports.length < 20} onClick={() => setPage((p) => p + 1)} />
              </div>
            )}
          </>
        )}

        {/* Note about Supabase Storage setup */}
        <div style={{ marginTop: 20, fontSize: 11, color: '#4a5568', borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
          PDFs stored in Supabase Storage (private bucket: <code style={{ color: SUB }}>reports</code>).
          Download links expire after 7 days. HIPAA: PDFs contain PHI — BAA with Supabase required before production use.
        </div>
      </main>
    </div>
  );
}

function PBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: '#161a27', border: '1px solid #1e2535', borderRadius: 8, color: disabled ? '#4a5568' : '#e2e8f0', padding: '6px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {label}
    </button>
  );
}
