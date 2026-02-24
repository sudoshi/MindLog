// =============================================================================
// MindLog Web — Population Dashboard (redesigned to match prototype)
// Layout: 5-metric row + alert strip + two-column (heatmap/dist LEFT, alerts/checkin RIGHT)
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAlertSocket } from '../hooks/useAlertSocket.js';
import { useAuthStore } from '../stores/auth.js';
import { DrilldownModal } from '../components/DrilldownModal.js';
import type { DrilldownConfig } from '../components/DrilldownModal.js';

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

interface AlertItem {
  id: string;
  patient_id: string;
  patient_name?: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  rule_key: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function moodVar(v: number | null): string {
  if (!v) return 'rgba(255,255,255,0.08)';
  const idx = Math.max(1, Math.min(10, Math.round(v)));
  return `var(--m${idx})`;
}

function fmtRelative(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

const AVATAR_COLORS = [
  '#2a7ab5','#5A8A8A','#c9972a','#7c6fa0','#2a9d8f',
  '#e05a2a','#2a6db5','#9a5a8a','#3A8A8A','#c04060',
];

const MOOD_COLORS = [
  '#C0392B','#D04A2A','#D4782A','#CC9220','#C9A227',
  '#B8A436','#5BB8A0','#34B8A8','#2BB5C4','#2898B8',
];

// ---------------------------------------------------------------------------
// Drilldown Config Generators
// ---------------------------------------------------------------------------

function buildActiveTodayDrilldown(caseload: CaseloadRow[]): DrilldownConfig {
  const logged = caseload.filter((r) => r.todays_submitted_at !== null);
  const notLogged = caseload.filter((r) => r.todays_submitted_at === null);

  return {
    icon: '📊',
    title: 'Active Today — Check-ins',
    stats: [
      { value: logged.length, label: 'Logged Today', color: 'var(--safe)' },
      { value: notLogged.length, label: 'Not Yet Logged', color: 'var(--warning)' },
      { value: caseload.length, label: 'Total Patients' },
    ],
    patients: logged.map((r, idx) => ({
      id: r.patient_id,
      name: `${r.last_name}, ${r.first_name}`,
      initials: initials(r.first_name, r.last_name),
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] ?? '#4a5568',
      meta: `${r.mrn} · ${r.risk_level ?? 'unknown'} risk`,
      ...(r.todays_mood ? {
        moodDot: {
          value: Math.round(r.todays_mood),
          color: MOOD_COLORS[Math.round(r.todays_mood) - 1] ?? '#666',
        },
      } : {}),
      ...(r.todays_submitted_at ? { valueSecondary: fmtRelative(r.todays_submitted_at) } : {}),
    })),
  };
}

function buildAvgMoodDrilldown(caseload: CaseloadRow[]): DrilldownConfig {
  const logged = caseload.filter((r) => r.todays_mood !== null);
  const sorted = [...logged].sort((a, b) => (a.todays_mood ?? 0) - (b.todays_mood ?? 0));

  const lowMood = logged.filter((r) => (r.todays_mood ?? 0) <= 4);
  const midMood = logged.filter((r) => (r.todays_mood ?? 0) > 4 && (r.todays_mood ?? 0) <= 7);
  const highMood = logged.filter((r) => (r.todays_mood ?? 0) > 7);

  const avgMood = logged.length > 0
    ? (logged.reduce((s, r) => s + (r.todays_mood ?? 0), 0) / logged.length).toFixed(1)
    : '—';

  return {
    icon: '😊',
    title: `Average Mood — ${avgMood}`,
    stats: [
      { value: lowMood.length, label: 'Low (1-4)', color: 'var(--critical)' },
      { value: midMood.length, label: 'Mid (5-7)', color: 'var(--warning)' },
      { value: highMood.length, label: 'High (8-10)', color: 'var(--safe)' },
    ],
    patients: sorted.map((r, idx) => {
      const mood = r.todays_mood ?? 0;
      return {
        id: r.patient_id,
        name: `${r.last_name}, ${r.first_name}`,
        initials: initials(r.first_name, r.last_name),
        avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] ?? '#4a5568',
        ...(r.risk_level ? { meta: `${r.risk_level} risk` } : {}),
        moodDot: {
          value: Math.round(mood),
          color: MOOD_COLORS[Math.round(mood) - 1] ?? '#666',
        },
        valueSecondary: mood <= 4 ? 'Needs attention' : mood > 7 ? 'Doing well' : 'Moderate',
      };
    }),
  };
}

function buildAvgSleepDrilldown(caseload: CaseloadRow[]): DrilldownConfig {
  // Filter patients with sleep data
  const withSleep = caseload
    .filter((r) => r.todays_sleep_minutes != null)
    .map((r) => ({
      ...r,
      sleepHrs: (r.todays_sleep_minutes ?? 0) / 60,
    }))
    .sort((a, b) => a.sleepHrs - b.sleepHrs);

  const avgSleep = withSleep.length > 0
    ? (withSleep.reduce((s, r) => s + r.sleepHrs, 0) / withSleep.length).toFixed(1)
    : '—';

  const poor = withSleep.filter((r) => r.sleepHrs < 6);
  const ok = withSleep.filter((r) => r.sleepHrs >= 6 && r.sleepHrs < 8);
  const good = withSleep.filter((r) => r.sleepHrs >= 8);

  return {
    icon: '😴',
    title: `Average Sleep — ${avgSleep}h`,
    stats: [
      { value: poor.length, label: '< 6 hours', color: 'var(--critical)' },
      { value: ok.length, label: '6-8 hours', color: 'var(--warning)' },
      { value: good.length, label: '8+ hours', color: 'var(--safe)' },
    ],
    patients: withSleep.map((r, idx) => ({
      id: r.patient_id,
      name: `${r.last_name}, ${r.first_name}`,
      initials: initials(r.first_name, r.last_name),
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] ?? '#4a5568',
      ...(r.risk_level ? { meta: `${r.risk_level} risk` } : {}),
      value: `${r.sleepHrs.toFixed(1)}h`,
      valueColor: r.sleepHrs < 6 ? 'var(--critical)' : r.sleepHrs >= 8 ? 'var(--safe)' : 'var(--warning)',
      valueSecondary: r.sleepHrs < 6 ? 'Below target' : r.sleepHrs >= 8 ? 'Optimal' : 'Adequate',
    })),
    emptyMessage: 'No sleep data available. Extended snapshot required.',
  };
}

function buildCheckInRateDrilldown(caseload: CaseloadRow[]): DrilldownConfig {
  const logged = caseload.filter((r) => r.todays_submitted_at !== null);
  const notLogged = caseload.filter((r) => r.todays_submitted_at === null);
  const rate = caseload.length > 0 ? Math.round((logged.length / caseload.length) * 100) : 0;

  // Show not-logged patients first (they need attention)
  const sortedNotLogged = [...notLogged].sort((a, b) => {
    // Sort by risk level (crisis/critical first)
    const riskOrder: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
    return (riskOrder[a.risk_level ?? 'low'] ?? 4) - (riskOrder[b.risk_level ?? 'low'] ?? 4);
  });

  return {
    icon: '📈',
    title: `Check-In Rate — ${rate}%`,
    stats: [
      { value: logged.length, label: 'Checked In', color: 'var(--safe)' },
      { value: notLogged.length, label: 'Not Logged', color: 'var(--warning)' },
      { value: `${rate}%`, label: 'Rate' },
    ],
    patients: sortedNotLogged.map((r, idx) => ({
      id: r.patient_id,
      name: `${r.last_name}, ${r.first_name}`,
      initials: initials(r.first_name, r.last_name),
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] ?? '#4a5568',
      meta: `${r.mrn} · ${r.tracking_streak}d streak`,
      value: 'Not logged',
      valueColor: 'var(--warning)',
      ...(r.risk_level ? { valueSecondary: `${r.risk_level} risk` } : {}),
    })),
    emptyMessage: 'All patients have checked in today!',
  };
}

function buildMoodBucketDrilldown(
  caseload: CaseloadRow[],
  bucket: { label: string; min: number; max: number; color: string }
): DrilldownConfig {
  const logged = caseload.filter((r) => r.todays_mood !== null);
  const inBucket = logged.filter(
    (r) => (r.todays_mood ?? 0) >= bucket.min && (r.todays_mood ?? 0) <= bucket.max
  );
  const sorted = [...inBucket].sort((a, b) => (a.todays_mood ?? 0) - (b.todays_mood ?? 0));

  // Determine icon based on bucket
  const iconMap: Record<string, string> = {
    'High (8–10)': '😊',
    'Good (6–7)': '🙂',
    'Moderate (4–5)': '😐',
    'Low (1–3)': '😟',
  };

  return {
    icon: iconMap[bucket.label] ?? '📊',
    title: `${bucket.label} Mood — ${inBucket.length} patients`,
    stats: [
      { value: inBucket.length, label: 'In Range' },
      { value: logged.length, label: 'Total Logged' },
      {
        value: logged.length > 0 ? `${Math.round((inBucket.length / logged.length) * 100)}%` : '—',
        label: 'Of Logged',
      },
    ],
    patients: sorted.map((r, idx) => {
      const mood = r.todays_mood ?? 0;
      return {
        id: r.patient_id,
        name: `${r.last_name}, ${r.first_name}`,
        initials: initials(r.first_name, r.last_name),
        avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] ?? '#4a5568',
        ...(r.risk_level ? { meta: `${r.risk_level} risk` } : {}),
        moodDot: {
          value: Math.round(mood),
          color: MOOD_COLORS[Math.round(mood) - 1] ?? '#666',
        },
        ...(r.todays_submitted_at ? { valueSecondary: fmtRelative(r.todays_submitted_at) } : {}),
      };
    }),
    emptyMessage: `No patients with mood in ${bucket.label} range today.`,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label, value, valueClass, delta, deltaDir, variant, onClick,
}: {
  label: string;
  value: string;
  valueClass?: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
  variant?: 'critical' | 'warning';
  onClick?: () => void;
}) {
  return (
    <div
      className={`metric-card${variant ? ` ${variant}` : ''}${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      data-testid={`metric-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="metric-label">{label}</div>
      <div className={`metric-value${valueClass ? ` ${valueClass}` : ''}`}>{value}</div>
      {delta && <div className={`metric-delta${deltaDir ? ` ${deltaDir}` : ''}`}>{delta}</div>}
    </div>
  );
}

function CaseloadMoodPanel({ caseload }: { caseload: CaseloadRow[] }) {
  const navigate = useNavigate();
  const sorted = [...caseload].sort((a, b) => {
    const ord: Record<string, number> = { crisis: 0, active: 1, inactive: 2, discharged: 3 };
    return (ord[a.status] ?? 4) - (ord[b.status] ?? 4);
  });

  return (
    <div className="panel anim anim-d2" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Today's Mood — Caseload</div>
          <div className="panel-sub">One cell per patient · Border = crisis</div>
        </div>
        <div className="panel-action" onClick={() => navigate('/patients')}>All patients →</div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sorted.map((row, idx) => (
            <div
              key={`${row.patient_id}-${idx}`}
              title={`${row.last_name}, ${row.first_name} — Mood: ${row.todays_mood ?? 'not logged'}`}
              onClick={() => navigate(`/patients/${row.patient_id}`)}
              style={{
                width: 18, height: 18, borderRadius: 3,
                background: moodVar(row.todays_mood),
                border: row.status === 'crisis' ? '1px solid var(--critical)' : '1px solid transparent',
                cursor: 'pointer', flexShrink: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          {[1,3,5,7,9].map((m) => (
            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: moodVar(m) }} />
              <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{m}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
            <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Not logged</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOOD_BUCKETS = [
  { label: 'High (8–10)', min: 8, max: 10, color: 'var(--m9)' },
  { label: 'Good (6–7)', min: 6, max: 7, color: 'var(--m7)' },
  { label: 'Moderate (4–5)', min: 4, max: 5, color: 'var(--m4)' },
  { label: 'Low (1–3)', min: 1, max: 3, color: 'var(--m2)' },
];

function MoodDistributionPanel({
  caseload,
  onBucketClick,
}: {
  caseload: CaseloadRow[];
  onBucketClick?: (bucket: typeof MOOD_BUCKETS[number]) => void;
}) {
  const logged = caseload.filter((r) => r.todays_mood !== null);
  const maxCount = Math.max(...MOOD_BUCKETS.map((b) =>
    logged.filter((r) => (r.todays_mood ?? 0) >= b.min && (r.todays_mood ?? 0) <= b.max).length
  ), 1);

  return (
    <div className="panel anim anim-d3" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div className="panel-title">Mood Distribution — Today</div>
        <div className="panel-sub">Reported by {logged.length} patients</div>
      </div>
      <div style={{ padding: '8px 0' }}>
        {MOOD_BUCKETS.map((b) => {
          const count = logged.filter((r) =>
            (r.todays_mood ?? 0) >= b.min && (r.todays_mood ?? 0) <= b.max
          ).length;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div
              key={b.label}
              className={`mini-bar-row${onBucketClick ? ' clickable' : ''}`}
              onClick={() => onBucketClick?.(b)}
              style={onBucketClick ? { cursor: 'pointer' } : undefined}
            >
              <div className="mini-bar-label">{b.label}</div>
              <div className="mini-bar-track">
                <div className="mini-bar-fill" style={{ width: `${pct}%`, background: b.color }} />
              </div>
              <div className="mini-bar-val">{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveAlertsPanel({ token, onViewAll }: { token: string | null; onViewAll: () => void }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    void api.get<{ items: AlertItem[] }>('/alerts?limit=5&status=new', token)
      .then((res) => setAlerts(res.items ?? []))
      .catch(() => {});
  }, [token]);

  const severityIcon: Record<string, string> = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };

  return (
    <div className="panel anim anim-d2" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Active Alerts</div>
          <div className="panel-sub">Requires your attention</div>
        </div>
        <div className="panel-action" onClick={onViewAll}>All →</div>
      </div>
      {alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <div className="empty-state-title">No open alerts</div>
          All patients are stable
        </div>
      ) : (
        alerts.map((a, idx) => (
          <div
            key={`${a.id}-${idx}`}
            className="alert-item"
            onClick={() => navigate(`/patients/${a.patient_id}`)}
          >
            <div className={`alert-item-icon ${a.severity}`}>
              {severityIcon[a.severity] ?? '📋'}
            </div>
            <div className="alert-item-content">
              <div className="alert-item-title">{a.title}</div>
              {a.patient_name && <div className="alert-item-body">{a.patient_name}</div>}
              <div className="alert-item-footer">{a.rule_key} · {fmtRelative(a.created_at)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CheckInActivityPanel({ caseload }: { caseload: CaseloadRow[] }) {
  const navigate = useNavigate();
  const loggedIn = caseload.filter((r) => r.todays_submitted_at !== null).slice(0, 8);
  const notLogged = caseload.filter((r) => r.todays_submitted_at === null).length;

  return (
    <div className="panel anim anim-d3">
      <div className="panel-header">
        <div className="panel-title">Check-In Activity</div>
        <div className="panel-sub">{loggedIn.length} logged · {notLogged} pending</div>
      </div>
      {loggedIn.length === 0 ? (
        <div className="empty-state">No check-ins yet today</div>
      ) : (
        <div style={{ paddingBottom: 8 }}>
          {loggedIn.map((row, idx) => (
            <div
              key={`${row.patient_id}-${idx}`}
              className="checkin-item"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/patients/${row.patient_id}`)}
            >
              <div
                className="checkin-avatar"
                style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
              >
                {initials(row.first_name, row.last_name)}
              </div>
              <div className="checkin-name">{row.last_name}, {row.first_name}</div>
              {row.todays_mood != null && (
                <div
                  className="mood-dot"
                  style={{ background: moodVar(row.todays_mood) }}
                  title={`Mood: ${row.todays_mood}`}
                />
              )}
              <div className="checkin-time">
                {row.todays_submitted_at ? fmtRelative(row.todays_submitted_at) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [caseload, setCaseload] = useState<CaseloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [topCritical, setTopCritical] = useState<AlertItem | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownConfig | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [snap, caseRes] = await Promise.all([
        api.get<Snapshot>('/clinicians/snapshot', token),
        api.get<{ success: boolean; data: CaseloadRow[] } | CaseloadRow[]>('/clinicians/caseload', token),
      ]);
      setSnapshot(snap);
      // Handle both { data: [...] } and plain array response shapes
      const rows = Array.isArray(caseRes)
        ? caseRes
        : ((caseRes as { data?: CaseloadRow[] }).data ?? []);
      setCaseload(rows);
    } catch (e) {
      console.error('[dashboard] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch top critical alert for the alert strip
  const fetchTopCritical = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<{ items: AlertItem[] }>('/alerts?limit=1&severity=critical&status=new', token);
      setTopCritical(res.items?.[0] ?? null);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { void fetchData(); void fetchTopCritical(); }, [fetchData, fetchTopCritical]);

  useAlertSocket({ token, onAlert: () => { void fetchData(); void fetchTopCritical(); } });

  // Derived KPIs
  const criticalAlerts = snapshot?.critical_alerts_count ?? 0;
  const checkedInToday = caseload.filter((r) => r.todays_submitted_at !== null).length;
  const avgMood = (() => {
    if (snapshot?.avg_mood_x10 != null) return (snapshot.avg_mood_x10 / 10).toFixed(1);
    const moods = caseload.map((r) => r.todays_mood).filter((m): m is number => m !== null);
    return moods.length > 0 ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : '—';
  })();

  return (
    <div className="view-pad" data-testid="dashboard-page">
      {/* ── 5 Metric cards ── */}
      <div className="metric-row anim" data-testid="metric-row">
        <MetricCard
          label="Critical Alerts"
          value={loading ? '…' : String(criticalAlerts)}
          {...(criticalAlerts > 0 ? { valueClass: 'critical', variant: 'critical' as const } : {})}
          delta={criticalAlerts > 0 ? 'Requires review' : 'All stable'}
          deltaDir={criticalAlerts > 0 ? 'down' : 'up'}
          onClick={() => navigate('/alerts')}
        />
        <MetricCard
          label="Active Today"
          value={loading ? '…' : `${checkedInToday} / ${caseload.length}`}
          delta={`of ${caseload.length} patients logged`}
          deltaDir={checkedInToday < caseload.length * 0.6 ? 'down' : 'flat'}
          {...(!loading && checkedInToday < caseload.length * 0.6 ? { variant: 'warning' as const } : {})}
          onClick={() => !loading && setDrilldown(buildActiveTodayDrilldown(caseload))}
        />
        <MetricCard
          label="Avg Mood"
          value={loading ? '…' : avgMood}
          {...(avgMood !== '—' && Number(avgMood) < 5
            ? { valueClass: 'critical' }
            : avgMood !== '—' && Number(avgMood) >= 7
            ? { valueClass: 'safe' }
            : {})}
          delta="Today's caseload"
          deltaDir="flat"
          onClick={() => !loading && setDrilldown(buildAvgMoodDrilldown(caseload))}
        />
        <MetricCard
          label="Avg Sleep"
          value="—"
          delta="Click for sleep data"
          deltaDir="flat"
          onClick={() => !loading && setDrilldown(buildAvgSleepDrilldown(caseload))}
        />
        <MetricCard
          label="Check-In Rate"
          value={loading ? '…' : (snapshot?.checkin_rate_pct != null ? `${Math.round(snapshot.checkin_rate_pct)}%` : `${caseload.length > 0 ? Math.round((checkedInToday / caseload.length) * 100) : 0}%`)}
          valueClass="safe"
          delta="Today"
          deltaDir="flat"
          onClick={() => !loading && setDrilldown(buildCheckInRateDrilldown(caseload))}
        />
      </div>

      {/* ── Safety alert strip (top critical alert) ── */}
      {topCritical && (
        <div
          className="alert-strip anim anim-d1"
          onClick={() => navigate(`/patients/${topCritical.patient_id}`)}
        >
          <div className="alert-strip-icon">⚠️</div>
          <div className="alert-strip-text">
            <div className="alert-strip-title">{topCritical.title}</div>
            <div className="alert-strip-body">
              {topCritical.rule_key} · {fmtRelative(topCritical.created_at)}
              {topCritical.patient_name ? ` · ${topCritical.patient_name}` : ''}
            </div>
          </div>
          <div className="alert-strip-action">Review Now →</div>
        </div>
      )}

      {/* ── Two-column layout ── */}
      {loading ? (
        <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 48 }}>
          Loading caseload…
        </div>
      ) : caseload.length === 0 ? (
        <div className="panel anim" style={{ marginTop: 8 }}>
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">No patients in your caseload</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, maxWidth: 340, margin: '0 auto' }}>
              Patients will appear here once they are enrolled and assigned to your care team.
            </div>
          </div>
        </div>
      ) : (
        <div className="two-col">
          {/* LEFT: Mood cells + Distribution */}
          <div>
            <CaseloadMoodPanel caseload={caseload} />
            <MoodDistributionPanel
              caseload={caseload}
              onBucketClick={(bucket) => setDrilldown(buildMoodBucketDrilldown(caseload, bucket))}
            />
          </div>
          {/* RIGHT: Active alerts + Check-in activity */}
          <div>
            <ActiveAlertsPanel token={token} onViewAll={() => navigate('/alerts')} />
            <CheckInActivityPanel caseload={caseload} />
          </div>
        </div>
      )}

      {/* Snapshot age footnote */}
      {snapshot && !snapshot.is_live && snapshot.snapshot_date && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-ghost)', textAlign: 'right' }}>
          KPI figures from nightly snapshot ({snapshot.snapshot_date}). Alert counts are live.
        </div>
      )}

      {/* KPI Drilldown Modal */}
      {drilldown && (
        <DrilldownModal
          config={drilldown}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
