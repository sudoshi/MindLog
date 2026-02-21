// =============================================================================
// MindLog Web — Population Dashboard
// Real-time caseload overview: KPI cards + patient table + live WS alert badge.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { api } from '../services/api.js';
import { useAlertSocket } from '../hooks/useAlertSocket.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Snapshot {
  active_patients: number;
  crisis_patients: number;
  total_patients: number;
  avg_mood_x10: number | null;
  critical_alerts_count: number;
  warning_alerts_count: number;
  checkin_rate_pct: number | null;
  snapshot_date: string | null;
  is_live: boolean;
}

interface CaseloadRow {
  patient_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  status: 'active' | 'crisis' | 'inactive' | 'discharged';
  risk_level: 'low' | 'moderate' | 'high' | 'critical' | null;
  tracking_streak: number;
  todays_mood: number | null;
  todays_coping: number | null;
  todays_completion_pct: number | null;
  todays_submitted_at: string | null;
  todays_sleep_minutes: number | null;
  unacknowledged_alert_count: number;
  highest_alert_severity: 'critical' | 'warning' | 'info' | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_COLOR: Record<string, string> = {
  critical: '#d62828',
  high: '#faa307',
  moderate: '#e9c46a',
  low: '#6a994e',
};

const STATUS_COLOR: Record<string, string> = {
  crisis: '#d62828',
  active: '#2a9d8f',
  inactive: '#4a5568',
  discharged: '#4a5568',
};

function moodColor(v: number): string {
  // 1 (red) → 10 (green) through yellow
  const pct = (v - 1) / 9;
  const hue = Math.round(pct * 120);
  return `hsl(${hue}, 75%, 55%)`;
}

function fmtSleep(minutes: number | null): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#161a27', border: '1px solid #1e2535', borderRadius: 12, padding: 20 }}>
      <div style={{ color: '#8b9cb0', fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [caseload, setCaseload] = useState<CaseloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlerts, setNewAlerts] = useState(0);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [snap, rows] = await Promise.all([
        api.get<Snapshot>('/clinicians/snapshot', token),
        api.get<CaseloadRow[]>('/clinicians/caseload', token),
      ]);
      setSnapshot(snap);
      setCaseload(rows);
    } catch (e) {
      console.error('[dashboard] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleAlert = useCallback(() => {
    setNewAlerts((n) => n + 1);
    void fetchData(); // refresh caseload to show updated alert counts
  }, [fetchData]);

  const { status: ws } = useAlertSocket({ token, onAlert: handleAlert });

  // Derived KPIs — prefer nightly snapshot, fall back to live caseload counts
  const totalActive = snapshot?.active_patients ?? caseload.length;
  const checkedInToday = caseload.filter((r) => r.todays_submitted_at !== null).length;
  const crisisAlerts = snapshot?.critical_alerts_count
    ?? caseload.filter((r) => r.status === 'crisis').length;
  const avgMood: string = (() => {
    if (snapshot?.avg_mood_x10 != null) return (snapshot.avg_mood_x10 / 10).toFixed(1);
    const moods = caseload.map((r) => r.todays_mood).filter((m): m is number => m !== null);
    return moods.length > 0
      ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)
      : '—';
  })();

  const BG = '#0c0f18';
  const CARD = '#161a27';
  const BORDER = '#1e2535';
  const TEXT = '#e2e8f0';
  const SUB = '#8b9cb0';
  const wsc = ws === 'connected' ? '#6a994e' : ws === 'connecting' ? '#faa307' : '#d62828';

  const kpis: Array<{ label: string; value: string; color: string }> = [
    { label: 'Active Patients', value: loading ? '…' : String(totalActive), color: TEXT },
    { label: 'Checked In Today', value: loading ? '…' : `${checkedInToday} / ${caseload.length}`, color: '#6a994e' },
    { label: 'Crisis Alerts', value: loading ? '…' : String(crisisAlerts), color: crisisAlerts > 0 ? '#d62828' : TEXT },
    { label: 'Avg Mood (7d)', value: loading ? '…' : avgMood, color: TEXT },
  ];

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
          <a href="/dashboard" style={{ color: DESIGN_TOKENS.COLOR_PRIMARY, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            Dashboard
          </a>
          <a
            href="/alerts"
            style={{ color: SUB, textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setNewAlerts(0)}
          >
            Alerts
            {newAlerts > 0 && (
              <span style={{
                background: '#d62828', color: '#fff', borderRadius: 10,
                padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
              }}>
                {newAlerts > 9 ? '9+' : newAlerts}
              </span>
            )}
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: wsc }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsc, display: 'inline-block' }} />
            {ws === 'connected' ? 'Live' : ws}
          </span>
        </nav>
      </header>

      <main style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Page title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>My Caseload — Today</h2>
          {snapshot?.is_live
            ? <span style={{ fontSize: 12, color: '#6a994e' }}>⬤ Live counts</span>
            : snapshot?.snapshot_date
              ? <span style={{ fontSize: 12, color: SUB }}>Snapshot: {snapshot.snapshot_date}</span>
              : null
          }
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Crisis resource banner */}
        <div style={{
          background: '#1a0a0a', border: '1px solid #4a1010', borderRadius: 10,
          padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#fc8181',
        }}>
          🚨 Patient in crisis? Call 988 · Text HOME to 741741 · Veterans: 988 press 1
        </div>

        {/* Caseload table */}
        {loading ? (
          <div style={{ color: SUB, textAlign: 'center', padding: 48 }}>Loading caseload…</div>
        ) : caseload.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🩺</div>
            <div style={{ color: TEXT, fontSize: 16, fontWeight: 600 }}>No patients assigned</div>
            <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>You have no patients on your caseload yet.</div>
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Patient', 'Status', 'Mood', 'Coping', 'Sleep', 'Check-in', 'Alerts', 'Streak'].map((h) => (
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
                {caseload.map((row, i) => {
                  const alertColor = row.highest_alert_severity === 'critical'
                    ? '#d62828'
                    : row.highest_alert_severity === 'warning'
                      ? '#faa307'
                      : '#2a9d8f';
                  return (
                    <tr
                      key={row.patient_id}
                      onClick={() => navigate(`/patients/${row.patient_id}`)}
                      style={{
                        borderBottom: i < caseload.length - 1 ? `1px solid ${BORDER}` : 'none',
                        cursor: 'pointer',
                        background: row.status === 'crisis' ? '#1a0a0a' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background =
                          row.status === 'crisis' ? '#220f0f' : '#1a1e2e';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background =
                          row.status === 'crisis' ? '#1a0a0a' : 'transparent';
                      }}
                    >
                      {/* Patient name + MRN + risk */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>
                          {row.last_name}, {row.first_name}
                        </div>
                        <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
                          {row.mrn}
                          {row.risk_level && (
                            <span style={{ marginLeft: 8, color: RISK_COLOR[row.risk_level] ?? SUB }}>
                              ● {row.risk_level}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          background: `${STATUS_COLOR[row.status] ?? '#4a5568'}22`,
                          color: STATUS_COLOR[row.status] ?? SUB,
                          borderRadius: 4, padding: '2px 8px',
                          fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                        }}>
                          {row.status}
                        </span>
                      </td>

                      {/* Today's mood */}
                      <td style={{ padding: '14px 16px', fontSize: 16, fontWeight: 700, color: row.todays_mood ? moodColor(row.todays_mood) : SUB }}>
                        {row.todays_mood ?? '—'}
                      </td>

                      {/* Today's coping */}
                      <td style={{ padding: '14px 16px', fontSize: 15, color: row.todays_coping ? moodColor(row.todays_coping) : SUB }}>
                        {row.todays_coping ?? '—'}
                      </td>

                      {/* Sleep */}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: SUB }}>
                        {fmtSleep(row.todays_sleep_minutes)}
                      </td>

                      {/* Check-in completion */}
                      <td style={{ padding: '14px 16px' }}>
                        {row.todays_submitted_at ? (
                          <span style={{ color: '#6a994e', fontSize: 13 }}>
                            ✓{row.todays_completion_pct != null ? ` ${row.todays_completion_pct}%` : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#4a5568', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* Unacknowledged alerts */}
                      <td style={{ padding: '14px 16px' }}>
                        {row.unacknowledged_alert_count > 0 ? (
                          <span style={{
                            background: `${alertColor}22`, color: alertColor,
                            borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
                          }}>
                            {row.unacknowledged_alert_count}
                          </span>
                        ) : (
                          <span style={{ color: '#4a5568' }}>—</span>
                        )}
                      </td>

                      {/* Tracking streak */}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: SUB }}>
                        {row.tracking_streak > 0 ? `🔥 ${row.tracking_streak}d` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Snapshot age note */}
        {snapshot && !snapshot.is_live && snapshot.snapshot_date && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#4a5568', textAlign: 'right' }}>
            KPI figures from nightly snapshot ({snapshot.snapshot_date}). Alert counts are live.
          </div>
        )}
      </main>
    </div>
  );
}
