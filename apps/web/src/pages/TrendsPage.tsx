// =============================================================================
// MindLog Web — Population Trends page (new — matches prototype v-trends view)
// Shows aggregate caseload metrics from the snapshot + caseload data.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
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

interface SnapshotHistory {
  snapshot_date: string;
  avg_mood_x10: number | null;
  checkin_rate_pct: number | null;
  critical_alerts_count: number;
  active_patients: number;
  crisis_patients: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HistoricalMoodPanel({ token }: { token: string | null }) {
  const [history, setHistory] = useState<SnapshotHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    void api.get<SnapshotHistory[]>('/clinicians/snapshot-history?days=30', token)
      .then((data) => setHistory(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="panel anim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading historical data…</span>
      </div>
    );
  }

  if (history.length < 2) {
    return (
      <div className="panel anim">
        <div className="panel-header">
          <div className="panel-title">30-Day Mood Trend</div>
          <div className="panel-sub">Population avg from nightly snapshots</div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <div className="empty-state-title">Trend data building…</div>
          Snapshots accumulate nightly. Check back after the first scheduled run at 07:00 UTC.
        </div>
      </div>
    );
  }

  // Normalize check-in rate to 0–10 scale so both series share one Y axis
  const chartData = history.map((s) => ({
    date: s.snapshot_date,
    mood: s.avg_mood_x10 != null ? +(s.avg_mood_x10 / 10).toFixed(1) : null,
    checkin: s.checkin_rate_pct != null ? +(s.checkin_rate_pct / 10).toFixed(1) : null,
    alerts: s.critical_alerts_count,
  }));

  return (
    <div className="panel anim" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">30-Day Mood Trend</div>
          <div className="panel-sub">Population avg from nightly snapshots · {history.length} data points</div>
        </div>
      </div>
      <div style={{ padding: '8px 0 0' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--ink-soft)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tickFormatter={(v: string) => format(parseISO(v), 'MMM d')}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 10]}
              ticks={[2, 4, 6, 8, 10]}
              tick={{ fill: 'var(--ink-soft)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              width={24}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'var(--glass-02)',
                border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 12,
                backdropFilter: 'blur(20px)',
              }}
              labelStyle={{ color: 'var(--ink-soft)' }}
              labelFormatter={(v: string) => format(parseISO(v), 'EEE, MMM d')}
              formatter={(v: number, name: string) => [
                name === 'mood'    ? `${v}/10`         :
                name === 'checkin' ? `${Math.round(v * 10)}%` :
                String(v),
                name === 'mood'    ? 'Avg Mood'        :
                name === 'checkin' ? 'Check-in Rate'   : 'Critical Alerts',
              ]}
            />
            <Line
              type="monotone" dataKey="mood"
              stroke="var(--safe)" strokeWidth={2}
              dot={false} activeDot={{ r: 4, fill: 'var(--safe)' }}
              connectNulls
            />
            <Line
              type="monotone" dataKey="checkin"
              stroke="var(--info)" strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false} activeDot={{ r: 4, fill: 'var(--info)' }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, padding: '4px 16px 12px', fontSize: 11, color: 'var(--ink-soft)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 18, height: 2, background: 'var(--safe)', display: 'inline-block', borderRadius: 1 }} />
            Avg Mood /10
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 18, height: 2, background: 'var(--info)', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed var(--info)' }} />
            Check-in Rate ÷10
          </span>
        </div>
      </div>
    </div>
  );
}

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
// Population Breakdown Types
// ---------------------------------------------------------------------------

interface PopBreakdown {
  days: number;
  moodDistribution: { high: number; good: number; moderate: number; low: number };
  statusBreakdown: Record<string, number>;
  assessmentCompletion: { completed: number; total: number; pct: number | null };
  adherenceRate: { taken: number; total: number; pct: number | null };
}

// ---------------------------------------------------------------------------
// Mood Distribution Histogram (BarChart from population-breakdown)
// ---------------------------------------------------------------------------

function MoodDistributionBarChart({ data }: { data: PopBreakdown['moodDistribution'] }) {
  const chartData = [
    { label: 'High (8–10)', count: data.high,     color: 'var(--safe)' },
    { label: 'Good (6–7)',  count: data.good,     color: 'var(--info)' },
    { label: 'Mod (4–5)',   count: data.moderate, color: '#c9972a' },
    { label: 'Low (1–3)',   count: data.low,      color: 'var(--critical)' },
  ];
  const total = chartData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="panel anim anim-d1" style={{ marginBottom: 14 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Mood Distribution — Today</div>
          <div className="panel-sub">{total} patients with today's check-in</div>
        </div>
      </div>
      {total === 0 ? (
        <div className="empty-state" style={{ padding: '32px 24px' }}>
          <div className="empty-state-title">No check-ins recorded yet today</div>
        </div>
      ) : (
        <div style={{ padding: '8px 0 4px' }}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--ink-soft)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--ink-soft)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <RechartsTooltip
                contentStyle={{ background: 'var(--glass-02)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(v: number) => [v, 'Patients']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medication Adherence Gauge (custom SVG arc)
// ---------------------------------------------------------------------------

function AdherenceGaugePanel({ adherence, days }: { adherence: PopBreakdown['adherenceRate']; days: number }) {
  const pct = adherence.pct ?? 0;
  // SVG arc: radius 50, half-circle
  const R = 50;
  const cx = 70;
  const cy = 70;
  const startAngle = Math.PI;
  const sweep = Math.PI * Math.min(pct, 100) / 100;
  const endAngle = startAngle + sweep;
  const x1 = cx + R * Math.cos(startAngle);
  const y1 = cy + R * Math.sin(startAngle);
  const x2 = cx + R * Math.cos(endAngle);
  const y2 = cy + R * Math.sin(endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  const arcPath = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`;
  const bgPath  = `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy}`;

  const color = pct >= 80 ? 'var(--safe)' : pct >= 60 ? '#c9972a' : 'var(--critical)';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Medication Adherence</div>
        <div className="panel-sub">Last {days} days · {adherence.taken}/{adherence.total} doses taken</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 16px' }}>
        <svg width={140} height={80} viewBox="0 0 140 80">
          <path d={bgPath}  fill="none" stroke="var(--border)" strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={arcPath} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />}
        </svg>
        <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: -8 }}>{pct}%</div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
          {pct >= 80 ? 'Excellent adherence' : pct >= 60 ? 'Moderate adherence' : adherence.total === 0 ? 'No data' : 'Needs attention'}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assessment Completion Panel
// ---------------------------------------------------------------------------

function AssessmentCompletionPanel({ completion, days }: { completion: PopBreakdown['assessmentCompletion']; days: number }) {
  const pct = completion.pct ?? 0;
  const color = pct >= 70 ? 'var(--safe)' : pct >= 40 ? '#c9972a' : 'var(--critical)';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Assessment Completion</div>
        <div className="panel-sub">Last {days} days · {completion.completed}/{completion.total} patients</div>
      </div>
      <div style={{ padding: '12px 18px 16px' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 10 }}>
          {completion.total === 0 ? '—' : `${pct}%`}
        </div>
        <div style={{
          height: 8, borderRadius: 4,
          background: 'var(--border)', overflow: 'hidden',
        }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--ink-soft)' }}>
          <span>{completion.completed} completed</span>
          <span>{completion.total - completion.completed} outstanding</span>
        </div>
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
  const [breakdown, setBreakdown] = useState<PopBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [snap, caseRes, bd] = await Promise.all([
        api.get<Snapshot>('/clinicians/snapshot', token),
        api.get<{ success: boolean; data: CaseloadRow[] } | CaseloadRow[]>('/clinicians/caseload', token),
        api.get<PopBreakdown>(`/clinicians/population-breakdown?days=${days}`, token).catch(() => null),
      ]);
      setSnapshot(snap);
      const rows = Array.isArray(caseRes)
        ? caseRes
        : ((caseRes as { data?: CaseloadRow[] }).data ?? []);
      setCaseload(rows);
      setBreakdown(bd);
    } catch (e) {
      console.error('[trends] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

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
      {/* ── Day range selector ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: days === d ? 'var(--safe)' : 'var(--glass-01)',
              color: days === d ? '#0a0e1a' : 'var(--ink-mid)',
              border: `1px solid ${days === d ? 'var(--safe)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            {d}d
          </button>
        ))}
      </div>

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

      {/* ── Mood distribution histogram + adherence gauge ── */}
      {breakdown && (
        <div className="two-col anim anim-d1">
          <MoodDistributionBarChart data={breakdown.moodDistribution} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <AdherenceGaugePanel adherence={breakdown.adherenceRate} days={days} />
            <AssessmentCompletionPanel completion={breakdown.assessmentCompletion} days={days} />
          </div>
        </div>
      )}

      {/* ── 30-day historical mood trend ── */}
      <HistoricalMoodPanel token={token} />

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
          KPI figures from nightly snapshot ({snapshot.snapshot_date}) · Alert counts are live
        </div>
      )}
    </div>
  );
}
