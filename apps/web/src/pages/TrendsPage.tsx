// =============================================================================
// MindLog Web — Population Trends page (new — matches prototype v-trends view)
// Shows aggregate caseload metrics from the snapshot + caseload data.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
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
  status: 'active' | 'crisis' | 'inactive' | 'discharged';
  risk_level: 'low' | 'moderate' | 'high' | 'critical' | null;
  tracking_streak: number;
  todays_mood: number | null;
  todays_submitted_at: string | null;
  todays_sleep_minutes: number | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatPanel({
  title, value, unit, color, subtitle,
}: {
  title: string;
  value: string;
  unit?: string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
      </div>
      <div className="stat-panel-value" style={{ color: color ?? 'var(--safe)' }}>
        {value}
        {unit && <span style={{ fontSize: 18, color: 'var(--ink-soft)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {subtitle && <div className="stat-panel-label">{subtitle}</div>}
    </div>
  );
}

function RiskDistributionPanel({ caseload }: { caseload: CaseloadRow[] }) {
  const total = caseload.length;
  if (total === 0) return null;

  const buckets = [
    { label: 'Crisis', key: 'crisis', color: 'var(--critical)', count: caseload.filter((r) => r.status === 'crisis').length },
    { label: 'Critical risk', key: 'critical', color: 'var(--critical)', count: caseload.filter((r) => r.risk_level === 'critical' && r.status !== 'crisis').length },
    { label: 'High risk', key: 'high', color: 'var(--warning)', count: caseload.filter((r) => r.risk_level === 'high').length },
    { label: 'Moderate risk', key: 'moderate', color: '#c9972a', count: caseload.filter((r) => r.risk_level === 'moderate').length },
    { label: 'Low risk', key: 'low', color: 'var(--safe)', count: caseload.filter((r) => r.risk_level === 'low').length },
    { label: 'Inactive', key: 'inactive', color: 'var(--ink-soft)', count: caseload.filter((r) => r.status === 'inactive' || r.status === 'discharged').length },
  ].filter((b) => b.count > 0);

  return (
    <div className="panel anim anim-d1" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div className="panel-title">Risk Level Distribution</div>
        <div className="panel-sub">{total} patients in caseload</div>
      </div>
      {/* Stacked bar */}
      <div style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', height: 28, borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 14 }}>
          {buckets.map((b) => (
            <div
              key={b.key}
              style={{
                width: `${(b.count / total) * 100}%`,
                background: b.color,
              }}
              title={`${b.label}: ${b.count}`}
            />
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {buckets.map((b) => (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />
              <span style={{ fontSize: 11, color: 'var(--ink-mid)' }}>
                {b.label}: <strong style={{ color: 'var(--ink)' }}>{b.count}</strong>
                <span style={{ color: 'var(--ink-soft)' }}>
                  {' '}({Math.round((b.count / total) * 100)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackingEngagementPanel({ caseload, snapshot }: { caseload: CaseloadRow[]; snapshot: Snapshot | null }) {
  const loggedToday = caseload.filter((r) => r.todays_submitted_at !== null).length;
  const totalActive = caseload.filter((r) => r.status === 'active' || r.status === 'crisis').length;
  const todayRate = totalActive > 0 ? Math.round((loggedToday / totalActive) * 100) : 0;
  const weekRate = snapshot?.checkin_rate_pct != null ? Math.round(snapshot.checkin_rate_pct) : todayRate;
  const streakAvg = caseload.length > 0
    ? Math.round(caseload.reduce((sum, r) => sum + r.tracking_streak, 0) / caseload.length)
    : 0;

  const rows = [
    { label: 'Today', pct: todayRate, color: 'var(--safe)' },
    { label: '7-day avg', pct: weekRate, color: 'var(--info)' },
    { label: 'Avg streak', pct: Math.min(100, streakAvg * 3), color: 'var(--warning)', val: `${streakAvg}d` },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Tracking Engagement</div>
        <div className="panel-sub">Check-in completion across caseload</div>
      </div>
      <div style={{ padding: '12px 0 8px' }}>
        <div style={{ padding: '4px 18px 12px' }}>
          <div className="stat-panel-value" style={{ color: 'var(--safe)' }}>
            {weekRate}%
          </div>
          <div className="stat-panel-label">Average check-in rate</div>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="mini-bar-row">
            <div className="mini-bar-label">{r.label}</div>
            <div className="mini-bar-track">
              <div className="mini-bar-fill" style={{ width: `${r.pct}%`, background: r.color }} />
            </div>
            <div className="mini-bar-val">{r.val ?? `${r.pct}%`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseloadSummaryPanel({ caseload, snapshot }: { caseload: CaseloadRow[]; snapshot: Snapshot | null }) {
  const crisisCount = caseload.filter((r) => r.status === 'crisis').length;
  const activeCount = caseload.filter((r) => r.status === 'active').length;
  const inactiveCount = caseload.filter((r) => r.status === 'inactive').length;
  const critAlerts = snapshot?.critical_alerts_count ?? 0;
  const warnAlerts = snapshot?.warning_alerts_count ?? 0;

  const summaryRows = [
    { label: 'Crisis patients', value: String(crisisCount), color: crisisCount > 0 ? 'var(--critical)' : 'var(--safe)' },
    { label: 'Active patients', value: String(activeCount), color: 'var(--ink)' },
    { label: 'Inactive patients', value: String(inactiveCount), color: 'var(--ink-soft)' },
    { label: 'Critical alerts', value: String(critAlerts), color: critAlerts > 0 ? 'var(--critical)' : 'var(--ink-soft)' },
    { label: 'Warning alerts', value: String(warnAlerts), color: warnAlerts > 0 ? 'var(--warning)' : 'var(--ink-soft)' },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Caseload Summary</div>
        <div className="panel-sub">Current status snapshot</div>
      </div>
      <div style={{ padding: '6px 0 8px' }}>
        {summaryRows.map((r) => (
          <div
            key={r.label}
            style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 18px', borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function TrendsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [caseload, setCaseload] = useState<CaseloadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [snap, caseRes] = await Promise.all([
        api.get<Snapshot>('/clinicians/snapshot', token),
        api.get<{ success: boolean; data: CaseloadRow[] } | CaseloadRow[]>('/clinicians/caseload', token),
      ]);
      setSnapshot(snap);
      const rows = Array.isArray(caseRes)
        ? caseRes
        : ((caseRes as { data?: CaseloadRow[] }).data ?? []);
      setCaseload(rows);
    } catch (e) {
      console.error('[trends] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Derived values
  const avgMood = (() => {
    if (snapshot?.avg_mood_x10 != null) return (snapshot.avg_mood_x10 / 10).toFixed(1);
    const moods = caseload.map((r) => r.todays_mood).filter((m): m is number => m !== null);
    return moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : '—';
  })();

  const checkinRate = snapshot?.checkin_rate_pct != null
    ? `${Math.round(snapshot.checkin_rate_pct)}%`
    : '—';

  const activePatients = snapshot?.active_patients ?? caseload.filter((r) => r.status === 'active' || r.status === 'crisis').length;

  if (loading) {
    return (
      <div className="view-pad">
        <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 48 }}>Loading trends…</div>
      </div>
    );
  }

  return (
    <div className="view-pad">
      {/* ── 3 stat panels ── */}
      <div className="three-col anim">
        <StatPanel
          title="Avg Mood — Today"
          value={avgMood}
          unit="/10"
          color={avgMood !== '—' && Number(avgMood) >= 7 ? 'var(--safe)' : Number(avgMood) >= 5 ? 'var(--warning)' : 'var(--critical)'}
          subtitle="Population average from logged check-ins"
        />
        <StatPanel
          title="Check-In Rate"
          value={checkinRate}
          color="var(--info)"
          subtitle="Avg completion rate this period"
        />
        <StatPanel
          title="Active Patients"
          value={String(activePatients)}
          color="var(--ink)"
          subtitle={`of ${caseload.length} total in caseload`}
        />
      </div>

      {/* ── Risk distribution ── */}
      <RiskDistributionPanel caseload={caseload} />

      {/* ── Two-col: engagement + summary ── */}
      <div className="two-col anim anim-d2">
        <TrackingEngagementPanel caseload={caseload} snapshot={snapshot} />
        <CaseloadSummaryPanel caseload={caseload} snapshot={snapshot} />
      </div>

      {/* Nightly snapshot note */}
      {snapshot?.snapshot_date && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-ghost)', textAlign: 'right' }}>
          Data from snapshot: {snapshot.snapshot_date}.
          Full 30-day time-series requires nightly snapshot pipeline.
        </div>
      )}
    </div>
  );
}
