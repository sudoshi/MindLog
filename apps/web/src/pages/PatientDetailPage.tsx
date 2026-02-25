// =============================================================================
// MindLog Web — Patient Detail Page
// 5 tabs: Overview · Mood Trends · Journal · Notes · Alerts
// =============================================================================

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { format, parseISO, differenceInYears, subDays } from 'date-fns';
import { MEDICATION_FREQUENCY_LABELS, type MedicationFrequency } from '@mindlog/shared';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { uiActions } from '../stores/ui.js';
import { AssessmentRequestModal } from '../components/AssessmentRequestModal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  mrn: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string;
  gender: string | null;
  status: string;
  risk_level: string;
  risk_reviewed_at: string | null;
  tracking_streak: number;
  longest_streak: number;
  last_checkin_at: string | null;
  onboarding_complete: boolean;
  app_installed: boolean;
  created_at: string;
  invite_id: string | null;
}

interface PatientInvite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  resend_count: number;
}

interface CareTeamMember {
  clinician_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  clinician_role: string;
  care_team_role: string;
  email: string;
  assigned_at: string;
}

interface HeatmapEntry {
  entry_date: string;
  mood: number | null;
  completion_pct: number | null;
  has_safety_flag: boolean;
}

interface JournalEntry {
  id: string;
  entry_date: string;
  body: string;
  word_count: number;
  shared_at: string;
}

interface ClinicalNote {
  id: string;
  note_type: string;
  body: string;
  is_private: boolean;
  clinician_id: string;
  clinician_first_name: string;
  clinician_last_name: string;
  created_at: string;
}

interface PatientAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  rule_key: string | null;
  created_at: string;
  acknowledged_at: string | null;
  auto_resolved: boolean;
  auto_resolved_at: string | null;
}

interface PatientMedication {
  id: string;
  medication_name: string;
  dose: number | null;
  dose_unit: string;
  frequency: string;
  frequency_other: string | null;
  instructions: string | null;
  prescribed_at: string | null;
  discontinued_at: string | null;
  discontinuation_reason: string | null;
  show_in_app: boolean;
  created_at: string;
  total_logged: number;
  taken_count: number;
  last_taken_at: string | null;
}

interface AssessmentScore {
  id: string;
  scale: string;
  score: number;
  completed_at: string;
  loinc_code: string | null;
  notes: string | null;
}

type Tab = 'overview' | 'trends' | 'journal' | 'notes' | 'alerts' | 'medications' | 'ai';

// AI types
interface StructuredFindings {
  trajectory_rationale?: string;
  domain_findings?: {
    mood?: string;
    sleep?: string;
    anxiety?: string;
    social?: string;
    medications?: string;
  };
  early_warnings?: Array<{ signal: string; urgency: 'routine' | 'elevated' | 'urgent'; domain: string }>;
  treatment_response?: string;
  recommended_focus?: Array<{ area: string; priority: number; rationale: string }>;
  cross_domain_patterns?: string[];
}

interface AiInsight {
  id:                   string;
  insight_type:         string;
  period_start:         string;
  period_end:           string;
  narrative:            string;
  key_findings:         string[];
  risk_delta:           number | null;
  model_id:             string;
  generated_at:         string;
  structured_findings?: StructuredFindings | null;
  clinical_trajectory?: 'improving' | 'stable' | 'declining' | 'acute' | null;
}

interface RiskHistoryPoint {
  score:       number;
  band:        string;
  computed_at: string;
}

type RiskDomain = 'safety' | 'mood' | 'engagement' | 'physical' | 'medication';

interface RiskFactorItem {
  rule:         string;
  label:        string;
  domain:       RiskDomain;
  weight:       number;
  contribution: number;
  fired:        boolean;
  value:        unknown;
  detail:       string;
}

interface AiInsightsData {
  patient_id:            string;
  risk_score:            number | null;
  risk_score_factors:    RiskFactorItem[] | null;
  risk_score_updated_at: string | null;
  insights:              AiInsight[];
  risk_history:          RiskHistoryPoint[];
  disclaimer:            string;
}

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

const BG = 'var(--bg)';
const CARD = 'var(--glass-01)';
const BORDER = 'var(--border)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';
const PRIMARY = 'var(--safe)';

const RISK_COLOR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--warning)', moderate: '#c9972a', low: 'var(--safe)',
};
const STATUS_COLOR: Record<string, string> = {
  crisis: 'var(--critical)', active: 'var(--safe)', inactive: 'var(--ink-soft)', discharged: 'var(--ink-soft)',
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--critical)', warning: 'var(--warning)', info: 'var(--info)',
};
const NOTE_TYPE_LABELS: Record<string, string> = {
  observation: 'Observation',
  intervention: 'Intervention',
  appointment_summary: 'Appt Summary',
  risk_assessment: 'Risk Assessment',
  handover: 'Handover',
  custom: 'Custom',
};
const CARE_TEAM_ROLE_LABELS: Record<string, string> = {
  primary: 'Primary', secondary: 'Secondary', covering: 'Covering',
  supervisor: 'Supervisor', researcher: 'Researcher',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function moodColor(v: number): string {
  const pct = (v - 1) / 9;
  return `hsl(${Math.round(pct * 120)}, 75%, 55%)`;
}

function formatRelative(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function buildHeatmapDays(
  data: HeatmapEntry[],
  numDays = 90,
): Array<{ date: string; mood: number | null; completion_pct: number | null; has_safety_flag: boolean }> {
  const map = new Map(data.map((e) => [e.entry_date.split('T')[0]!, e]));
  const today = new Date();
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (numDays - 1 - i));
    const dateStr = d.toISOString().split('T')[0]!;
    const entry = map.get(dateStr);
    return {
      date: dateStr,
      mood: entry?.mood ?? null,
      completion_pct: entry?.completion_pct ?? null,
      has_safety_flag: entry?.has_safety_flag ?? false,
    };
  });
}

// Clinical cut-off reference lines per scale
const SCALE_CUTOFFS: Record<string, Array<{ score: number; label: string; color: string }>> = {
  'PHQ-9': [
    { score: 5,  label: 'Mild',     color: '#c9972a' },
    { score: 10, label: 'Moderate', color: '#e07a3a' },
    { score: 20, label: 'Severe',   color: 'var(--critical)' },
  ],
  'GAD-7': [
    { score: 5,  label: 'Mild',     color: '#c9972a' },
    { score: 10, label: 'Moderate', color: '#e07a3a' },
    { score: 15, label: 'Severe',   color: 'var(--critical)' },
  ],
  'ASRM': [
    { score: 6, label: 'Elevated mania', color: 'var(--critical)' },
  ],
};

const SCALE_COLORS: Record<string, string> = {
  'PHQ-9': '#4a90e2',
  'GAD-7': '#e07a3a',
  'ASRM':  '#9b59b6',
  'ISI':   '#2DD4BF',
  'C-SSRS':'#e74c3c',
  'WHODAS':'#1abc9c',
};

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: `${color}22`, color, borderRadius: 4, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
    }}>
      {label}
    </span>
  );
}

function ActionBtn({
  label, color, disabled, onClick,
}: { label: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        background: `${color}22`, border: `1px solid ${color}55`, color,
        borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function PaginationBar({
  page, total, perPage, onPage,
}: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
      <button
        onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: page === 1 ? '#4a5568' : TEXT, padding: '6px 12px', fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
      >
        ← Prev
      </button>
      <span style={{ color: SUB, fontSize: 13, alignSelf: 'center' }}>
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)} disabled={page >= totalPages}
        style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: page >= totalPages ? '#4a5568' : TEXT, padding: '6px 12px', fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  patient, careTeam, patientId, navigate, invite, token, onInviteAction,
}: {
  patient: Patient;
  careTeam: CareTeamMember[];
  patientId: string;
  navigate: ReturnType<typeof useNavigate>;
  invite: PatientInvite | null;
  token: string | null;
  onInviteAction: () => void;
}) {
  const age = differenceInYears(new Date(), parseISO(patient.date_of_birth));
  const statusColor = STATUS_COLOR[patient.status] ?? '#4a5568';
  const riskColor = RISK_COLOR[patient.risk_level] ?? SUB;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Demographics */}
      <div className="tab-card">
        <h3 className="tab-section-title">Patient Information</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', margin: 0 }}>
          {([
            ['MRN', patient.mrn],
            ['Date of Birth', `${format(parseISO(patient.date_of_birth), 'MMM d, yyyy')} (age ${age})`],
            ['Gender', patient.gender ?? '—'],
            ['Email', patient.email ?? '—'],
            ['Phone', patient.phone ?? '—'],
            ['Enrolled', format(parseISO(patient.created_at), 'MMM d, yyyy')],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <dt style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>{label}</dt>
              <dd style={{ fontSize: 13, color: TEXT, margin: 0, wordBreak: 'break-all' }}>{value}</dd>
            </div>
          ))}
        </dl>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge label={patient.status} color={statusColor} />
          <Badge label={`${patient.risk_level} risk`} color={riskColor} />
          {patient.app_installed && <Badge label="App Installed" color={PRIMARY} />}
          {patient.onboarding_complete && <Badge label="Onboarded" color="var(--success)" />}
        </div>
      </div>

      {/* Stats */}
      <div className="tab-card">
        <h3 className="tab-section-title">Tracking Stats</h3>
        <div className="tab-stat-grid">
          <div className="tab-stat-cell">
            <div className="tab-stat-value">{patient.tracking_streak}</div>
            <div className="tab-stat-label">Current Streak (days)</div>
          </div>
          <div className="tab-stat-cell">
            <div className="tab-stat-value" style={{ color: '#e9c46a' }}>{patient.longest_streak}</div>
            <div className="tab-stat-label">Longest Streak (days)</div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: SUB }}>
          Last check-in:{' '}
          <span style={{ color: patient.last_checkin_at ? 'var(--success)' : '#4a5568' }}>
            {patient.last_checkin_at ? formatRelative(patient.last_checkin_at) : 'Never'}
          </span>
        </div>
        {patient.risk_reviewed_at && (
          <div style={{ marginTop: 6, fontSize: 13, color: SUB }}>
            Risk reviewed:{' '}
            <span style={{ color: TEXT }}>{format(parseISO(patient.risk_reviewed_at), 'MMM d, yyyy')}</span>
          </div>
        )}
        <button
          onClick={() => navigate(`/reports?patientId=${patientId}`)}
          style={{
            marginTop: 20, width: '100%', background: `${PRIMARY}22`,
            border: `1px solid ${PRIMARY}55`, color: PRIMARY,
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Generate Clinical Report
        </button>
      </div>

      {/* Invite Status card — only shown if invite exists */}
      {invite && (
        <div className="tab-card span-full">
          <h3 className="tab-section-title">Invite Status</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>Status</div>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                background:
                  invite.status === 'accepted' ? 'var(--safe-bg)' :
                  invite.status === 'pending' ? 'var(--warning-bg)' : 'var(--glass-02)',
                color:
                  invite.status === 'accepted' ? 'var(--safe)' :
                  invite.status === 'pending' ? 'var(--warning)' : 'var(--ink-soft)',
              }}>
                {invite.status === 'pending' ? '⏳ Pending' :
                 invite.status === 'accepted' ? '✓ Accepted' :
                 invite.status === 'expired' ? 'Expired' : 'Cancelled'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>Sent to</div>
              <div style={{ fontSize: 13, color: TEXT }}>{invite.email}</div>
            </div>
            {invite.status === 'accepted' && invite.accepted_at ? (
              <div>
                <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>Accepted</div>
                <div style={{ fontSize: 13, color: TEXT }}>
                  {format(parseISO(invite.accepted_at), 'MMM d, yyyy')}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>Expires</div>
                <div style={{ fontSize: 13, color: TEXT }}>
                  {format(parseISO(invite.expires_at), 'MMM d, yyyy')}
                </div>
              </div>
            )}
            {(invite.status === 'pending' || invite.status === 'expired') && (
              <button
                className="detail-actions-btn"
                style={{ marginLeft: 'auto' }}
                onClick={async () => {
                  if (!token) return;
                  try {
                    await api.post(`/invites/${invite.id}/resend`, {}, token);
                    onInviteAction();
                  } catch { /* non-fatal */ }
                }}
              >
                Resend Invite
              </button>
            )}
          </div>
        </div>
      )}

      {/* Care team — full width */}
      <div className="tab-card span-full">
        <h3 className="tab-section-title">Care Team ({careTeam.length})</h3>
        {careTeam.length === 0 ? (
          <p style={{ color: SUB, fontSize: 13, margin: 0 }}>No care team members assigned.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {careTeam.map((m) => (
              <div key={m.clinician_id} className="tab-inner-card">
                <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>
                  {m.title ? `${m.title} ` : ''}{m.first_name} {m.last_name}
                </div>
                <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{m.email}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Badge
                    label={CARE_TEAM_ROLE_LABELS[m.care_team_role] ?? m.care_team_role}
                    color={m.care_team_role === 'primary' ? PRIMARY : SUB}
                  />
                  <Badge label={m.clinician_role} color={SUB} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mood Trends  (enhanced with 90-day heatmap + assessment chart)
// ---------------------------------------------------------------------------

function HeatmapTooltip({
  day, x, y,
}: {
  day: { date: string; mood: number | null; completion_pct: number | null; has_safety_flag: boolean };
  x: number;
  y: number;
}) {
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', zIndex: 900,
      fontSize: 12, color: 'var(--ink)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      pointerEvents: 'none', minWidth: 140,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {format(parseISO(day.date), 'EEE, MMM d')}
      </div>
      {day.mood !== null ? (
        <div>Mood: <span style={{ color: moodColor(day.mood), fontWeight: 700 }}>{day.mood}/10</span></div>
      ) : (
        <div style={{ color: 'var(--ink-ghost)' }}>No check-in</div>
      )}
      {day.completion_pct !== null && (
        <div>Check-in: <span style={{ fontWeight: 600 }}>{Math.round(day.completion_pct)}%</span></div>
      )}
      {day.has_safety_flag && (
        <div style={{ color: 'var(--critical)', fontWeight: 700, marginTop: 4 }}>⚠ Safety flag</div>
      )}
    </div>
  );
}

function MoodTrendsTab({
  heatmap, loading, assessments, assessmentsLoading,
}: {
  heatmap: HeatmapEntry[];
  loading: boolean;
  assessments: AssessmentScore[];
  assessmentsLoading: boolean;
}) {
  const [comparePrev, setComparePrev] = useState(false);
  const [activeScales, setActiveScales] = useState<Set<string>>(new Set(['PHQ-9', 'GAD-7', 'ASRM']));
  const [tooltip, setTooltip] = useState<{ day: ReturnType<typeof buildHeatmapDays>[0]; x: number; y: number } | null>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return <div className="tab-loading">Loading mood data…</div>;
  }

  const days90 = buildHeatmapDays(heatmap, 90);
  const days30 = days90.slice(-30);
  const prev30 = days90.slice(30, 60);

  const chartData = days30
    .filter((d) => d.mood !== null)
    .map((d) => ({ date: d.date, mood: d.mood! }));

  const prevChartData = prev30
    .filter((d) => d.mood !== null)
    .map((d) => ({ date: d.date, mood: d.mood! }));

  // Assessment chart data: merge last 90 days per active scale
  const cutoff = subDays(new Date(), 90).toISOString();
  const assessmentChartData = assessments
    .filter((a) => activeScales.has(a.scale) && a.completed_at >= cutoff)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
    .reduce((acc, a) => {
      const dateKey = a.completed_at.split('T')[0]!;
      const existing = acc.find((r) => r.date === dateKey);
      if (existing) {
        existing[a.scale] = a.score;
      } else {
        const row: Record<string, unknown> = { date: dateKey };
        row[a.scale] = a.score;
        acc.push(row);
      }
      return acc;
    }, [] as Array<Record<string, unknown>>);

  const toggleScale = (scale: string) => {
    setActiveScales((prev) => {
      const next = new Set(prev);
      if (next.has(scale)) { if (next.size > 1) next.delete(scale); }
      else next.add(scale);
      return next;
    });
  };

  const availableScales = [...new Set(assessments.map((a) => a.scale))];

  return (
    <div>
      {/* Mood trend chart */}
      <div className="tab-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 className="tab-section-title" style={{ margin: 0 }}>Mood Score — Last 30 Days</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: SUB, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={comparePrev}
              onChange={(e) => setComparePrev(e.target.checked)}
              style={{ accentColor: PRIMARY }}
            />
            Compare prev. 30 days
          </label>
        </div>
        {chartData.length < 2 ? (
          <div style={{ color: SUB, textAlign: 'center', padding: 40 }}>
            Not enough data to display trend chart (need at least 2 check-ins).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis
                dataKey="date"
                type="category"
                allowDuplicatedCategory={false}
                tick={{ fill: SUB, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: BORDER }}
                tickFormatter={(v: string) => format(parseISO(v), 'MMM d')}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 10]}
                ticks={[2, 4, 6, 8, 10]}
                tick={{ fill: SUB, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: BORDER }}
                width={28}
              />
              <RechartsTooltip
                contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: SUB }}
                itemStyle={{ color: TEXT }}
                labelFormatter={(v: string) => format(parseISO(v), 'EEE, MMM d')}
                formatter={(v: number) => [v, 'Mood']}
              />
              <Line
                data={chartData}
                type="monotone"
                dataKey="mood"
                name="Current period"
                stroke={PRIMARY}
                strokeWidth={2}
                dot={{ r: 4, fill: PRIMARY, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: PRIMARY }}
              />
              {comparePrev && prevChartData.length >= 2 && (
                <Line
                  data={prevChartData}
                  type="monotone"
                  dataKey="mood"
                  name="Previous period"
                  stroke="#4a5568"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Assessment history chart */}
      {!assessmentsLoading && availableScales.length > 0 && (
        <div className="tab-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="tab-section-title" style={{ margin: 0 }}>Assessment Scores — Last 90 Days</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableScales.map((scale) => (
                <button
                  key={scale}
                  onClick={() => toggleScale(scale)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: activeScales.has(scale) ? `${SCALE_COLORS[scale] ?? PRIMARY}22` : 'var(--glass-01)',
                    color: activeScales.has(scale) ? (SCALE_COLORS[scale] ?? PRIMARY) : SUB,
                    border: `1px solid ${activeScales.has(scale) ? (SCALE_COLORS[scale] ?? PRIMARY) : BORDER}`,
                    cursor: 'pointer',
                  }}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>
          {assessmentChartData.length < 2 ? (
            <div style={{ color: SUB, textAlign: 'center', padding: 32, fontSize: 13 }}>
              Not enough assessment data for the selected scales.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={assessmentChartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: SUB, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: BORDER }}
                  tickFormatter={(v: string) => format(parseISO(v), 'MMM d')}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: SUB, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: BORDER }}
                  width={28}
                />
                <RechartsTooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: SUB }}
                  labelFormatter={(v: string) => format(parseISO(v), 'EEE, MMM d')}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: SUB, paddingTop: 8 }}
                />
                {/* Reference lines for clinical cut-offs */}
                {[...activeScales].flatMap((scale) =>
                  (SCALE_CUTOFFS[scale] ?? []).map((cutoff) => (
                    <ReferenceLine
                      key={`${scale}-${cutoff.score}`}
                      y={cutoff.score}
                      stroke={cutoff.color}
                      strokeDasharray="3 3"
                      strokeOpacity={0.6}
                      label={{ value: `${scale} ${cutoff.label}`, fill: cutoff.color, fontSize: 9, position: 'right' }}
                    />
                  ))
                )}
                {[...activeScales].map((scale) => (
                  <Line
                    key={scale}
                    type="monotone"
                    dataKey={scale}
                    name={scale}
                    stroke={SCALE_COLORS[scale] ?? PRIMARY}
                    strokeWidth={2}
                    dot={{ r: 5, fill: SCALE_COLORS[scale] ?? PRIMARY, strokeWidth: 0 }}
                    connectNulls={false}
                    activeDot={{ r: 7 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* 90-day scrollable heatmap grid */}
      <div className="tab-card">
        <h3 className="tab-section-title">90-Day Activity Grid</h3>
        <div
          ref={heatmapRef}
          style={{ overflowX: 'auto', paddingBottom: 8 }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(30, 34px)',
            gridTemplateRows: 'repeat(3, 34px)',
            gap: 5,
            width: 'fit-content',
          }}>
            {days90.map((d) => (
              <div
                key={d.date}
                onMouseEnter={(e) => setTooltip({ day: d, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  width: 34, height: 34,
                  borderRadius: 5,
                  background: d.mood !== null ? moodColor(d.mood) : 'rgba(255,255,255,0.06)',
                  border: d.has_safety_flag ? '2px solid var(--critical)' : '1px solid rgba(255,255,255,0.08)',
                  cursor: 'default',
                  transition: 'transform 0.1s',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: SUB, flexWrap: 'wrap' }}>
          <span>Low mood</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 3, 5, 7, 9, 10].map((v) => (
              <div key={v} style={{ width: 13, height: 13, borderRadius: 2, background: moodColor(v) }} />
            ))}
          </div>
          <span>High mood</span>
          <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: 2, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', display: 'inline-block' }} />
            No entry
          </span>
          <span style={{ marginLeft: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: 2, background: 'rgba(255,255,255,0.06)', border: '2px solid var(--critical)', display: 'inline-block' }} />
            Safety flag
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-ghost)' }}>← scroll to see older days</span>
        </div>
      </div>

      {/* Hover tooltip rendered via portal-style fixed positioning */}
      {tooltip && <HeatmapTooltip day={tooltip.day} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Journal
// ---------------------------------------------------------------------------

function JournalTab({
  entries, loading, total, page, onPage,
}: {
  entries: JournalEntry[];
  loading: boolean;
  total: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return <div className="tab-loading">Loading journal entries…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="tab-empty">
        <div className="empty-state-icon">📓</div>
        <div className="empty-state-title">No shared journal entries</div>
        <div style={{ color: SUB, fontSize: 13 }}>
          The patient hasn't shared any journal entries with the care team.
        </div>
      </div>
    );
  }

  return (
    <div>
      {entries.map((e) => {
        const isOpen = expanded === e.id;
        const preview = e.body.length > 220 ? `${e.body.slice(0, 220)}…` : e.body;
        return (
          <div key={e.id} className="tab-entry-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                  {format(parseISO(e.entry_date), 'EEEE, MMMM d, yyyy')}
                </span>
                <span style={{ fontSize: 11, color: SUB, marginLeft: 10 }}>
                  {e.word_count} words · shared {formatRelative(e.shared_at)}
                </span>
              </div>
              <button
                onClick={() => setExpanded(isOpen ? null : e.id)}
                style={{
                  background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                  color: SUB, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {isOpen ? 'Collapse' : 'Read'}
              </button>
            </div>
            {isOpen ? (
              <div style={{
                fontSize: 14, color: TEXT, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12,
              }}>
                {e.body}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: SUB, marginTop: 8 }}>{preview}</div>
            )}
          </div>
        );
      })}
      <PaginationBar page={page} total={total} perPage={10} onPage={onPage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notes
// ---------------------------------------------------------------------------

function NotesTab({
  notes, loading, total, page, onPage,
  noteBody, setNoteBody, noteType, setNoteType,
  notePrivate, setNotePrivate, noteSubmitting, onSubmit,
}: {
  notes: ClinicalNote[];
  loading: boolean;
  total: number;
  page: number;
  onPage: (p: number) => void;
  noteBody: string;
  setNoteBody: (v: string) => void;
  noteType: string;
  setNoteType: (v: string) => void;
  notePrivate: boolean;
  setNotePrivate: (v: boolean) => void;
  noteSubmitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div>
      {/* Add note form */}
      <div className="tab-card sm mb">
        <h3 className="tab-section-title">Add Clinical Note</h3>
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Write your clinical observation, intervention, or note here…"
          rows={4}
          style={{
            width: '100%', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
            color: TEXT, padding: '10px 12px', fontSize: 13,
            fontFamily: 'Figtree, system-ui, sans-serif', resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            style={{
              background: BG, border: `1px solid ${BORDER}`, borderRadius: 6,
              color: TEXT, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
            }}
          >
            {Object.entries(NOTE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: SUB, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notePrivate}
              onChange={(e) => setNotePrivate(e.target.checked)}
              style={{ accentColor: PRIMARY }}
            />
            Private (only visible to me)
          </label>
          <button
            onClick={onSubmit}
            disabled={noteSubmitting || !noteBody.trim()}
            style={{
              marginLeft: 'auto', background: PRIMARY, border: 'none', borderRadius: 8,
              color: '#fff', padding: '8px 20px', fontSize: 13, fontWeight: 600,
              cursor: noteSubmitting || !noteBody.trim() ? 'not-allowed' : 'pointer',
              opacity: noteSubmitting || !noteBody.trim() ? 0.6 : 1,
            }}
          >
            {noteSubmitting ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="tab-loading" style={{ padding: 40 }}>Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="tab-empty">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No clinical notes yet</div>
          <div style={{ color: SUB, fontSize: 13 }}>Add the first note above.</div>
        </div>
      ) : (
        <>
          {notes.map((n) => (
            <div key={n.id} className="tab-entry-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                    {n.clinician_first_name} {n.clinician_last_name}
                  </span>
                  <span style={{ fontSize: 11, color: SUB, marginLeft: 10 }}>{formatRelative(n.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Badge label={NOTE_TYPE_LABELS[n.note_type] ?? n.note_type} color={PRIMARY} />
                  {n.is_private && <Badge label="Private" color="#faa307" />}
                </div>
              </div>
              <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {n.body}
              </div>
            </div>
          ))}
          <PaginationBar page={page} total={total} perPage={10} onPage={onPage} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Alerts
// ---------------------------------------------------------------------------

function AlertsTab({
  alerts, loading, total, page, onPage, token, onRefresh,
}: {
  alerts: PatientAlert[];
  loading: boolean;
  total: number;
  page: number;
  onPage: (p: number) => void;
  token: string | null;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (alertId: string, ep: string) => {
    setBusy(alertId);
    try {
      await api.patch(`/alerts/${alertId}/${ep}`, {}, token ?? undefined);
      onRefresh();
    } catch (e) {
      console.error('[alerts] action error', e);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="tab-loading">Loading alerts…</div>;
  }

  if (alerts.length === 0) {
    return (
      <div className="tab-empty">
        <div className="empty-state-icon">✓</div>
        <div className="empty-state-title">No alerts</div>
        <div style={{ color: SUB, fontSize: 13 }}>This patient has no clinical alerts.</div>
      </div>
    );
  }

  return (
    <div>
      {alerts.map((a) => {
        const sc = SEVERITY_COLOR[a.severity] ?? '#666';
        const isActionable = !a.acknowledged_at && !a.auto_resolved;
        const isBusy = busy === a.id;
        return (
          <div
            key={a.id}
            style={{
              background: CARD,
              border: `1px solid ${a.severity === 'critical' ? '#4a1010' : BORDER}`,
              borderLeft: `4px solid ${sc}`,
              borderRadius: 12, padding: '16px 20px', marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Badge label={a.severity} color={sc} />
                <div style={{ color: TEXT, fontSize: 15, fontWeight: 600, marginTop: 6, marginBottom: 4 }}>{a.title}</div>
                <div style={{ color: SUB, fontSize: 12 }}>
                  {a.rule_key ?? a.alert_type} · {formatRelative(a.created_at)}
                  {a.acknowledged_at && ` · Ack'd ${formatRelative(a.acknowledged_at)}`}
                  {a.auto_resolved && ' · Resolved'}
                </div>
                {a.body && (
                  <div style={{
                    color: TEXT, fontSize: 13, marginTop: 8,
                    background: BG, borderRadius: 6, padding: '8px 12px',
                  }}>
                    {a.body}
                  </div>
                )}
              </div>
              {isActionable ? (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {!a.acknowledged_at && (
                    <ActionBtn label="Acknowledge" color="#3182ce" disabled={isBusy} onClick={() => void act(a.id, 'acknowledge')} />
                  )}
                  <ActionBtn label="Resolve" color="var(--success)" disabled={isBusy} onClick={() => void act(a.id, 'resolve')} />
                </div>
              ) : (
                <div style={{ color: '#4a5568', fontSize: 12, flexShrink: 0 }}>
                  {a.auto_resolved ? 'Resolved' : 'Acknowledged'}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <PaginationBar page={page} total={total} perPage={10} onPage={onPage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Medications
// ---------------------------------------------------------------------------

function MedicationsTab({
  medications, loading, showDiscontinued, onToggleDiscontinued, onDiscontinue,
}: {
  medications: PatientMedication[];
  loading: boolean;
  showDiscontinued: boolean;
  onToggleDiscontinued: () => void;
  onDiscontinue: (id: string) => void;
}) {

  const adherenceRate = (med: PatientMedication) =>
    med.total_logged === 0
      ? null
      : Math.round((med.taken_count / med.total_logged) * 100);

  return (
    <div>
      {/* Medication list header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Medications ({medications.length})
        </h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: SUB, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDiscontinued}
            onChange={onToggleDiscontinued}
            style={{ accentColor: PRIMARY }}
          />
          Show discontinued
        </label>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: SUB, textAlign: 'center', padding: 40 }}>Loading medications…</div>
      )}

      {/* Empty state */}
      {!loading && medications.length === 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💊</div>
          <div style={{ color: TEXT, fontWeight: 600 }}>No medications on file</div>
          <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>
            Add the patient's first medication above.
          </div>
        </div>
      )}

      {/* Medication rows */}
      {!loading && medications.map((med) => {
        const isDiscontinued = med.discontinued_at !== null;
        const rate = adherenceRate(med);

        return (
          <div
            key={med.id}
            style={{
              background: CARD,
              border: `1px solid ${isDiscontinued ? '#2d3748' : BORDER}`,
              borderRadius: 12, padding: '16px 20px', marginBottom: 12,
              opacity: isDiscontinued ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              {/* Left: med info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>
                    {med.medication_name}
                  </span>
                  {med.dose != null && (
                    <span style={{ fontSize: 12, color: SUB }}>
                      {med.dose} {med.dose_unit}
                    </span>
                  )}
                  <Badge
                    label={(MEDICATION_FREQUENCY_LABELS as Record<string, string>)[med.frequency] ?? med.frequency}
                    color={isDiscontinued ? '#4a5568' : PRIMARY}
                  />
                  {isDiscontinued && <Badge label="Discontinued" color="#d62828" />}
                </div>
                {med.instructions && (
                  <div style={{ fontSize: 12, color: SUB, fontStyle: 'italic', marginBottom: 6 }}>
                    {med.instructions}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: SUB }}>
                  <span>
                    Adherence: {rate !== null ? (
                      <span style={{ color: rate >= 80 ? 'var(--success)' : rate >= 50 ? '#faa307' : '#d62828', fontWeight: 600 }}>
                        {rate}%
                      </span>
                    ) : 'No logs'}
                    {med.total_logged > 0 && ` (${med.taken_count}/${med.total_logged} days)`}
                  </span>
                  {med.last_taken_at && (
                    <span>Last taken: {formatRelative(med.last_taken_at)}</span>
                  )}
                  {med.prescribed_at && (
                    <span>Prescribed: {format(parseISO(med.prescribed_at), 'MMM d, yyyy')}</span>
                  )}
                  {med.discontinued_at && (
                    <span>Discontinued: {format(parseISO(med.discontinued_at), 'MMM d, yyyy')}</span>
                  )}
                </div>
              </div>

              {/* Right: action */}
              {!isDiscontinued && (
                <button
                  onClick={() => {
                    if (window.confirm(`Discontinue ${med.medication_name}?`)) {
                      onDiscontinue(med.id);
                    }
                  }}
                  style={{
                    background: `${'#d62828'}22`, border: `1px solid ${'#d62828'}55`,
                    color: '#d62828', borderRadius: 6, padding: '5px 10px',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Discontinue
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: AI Insights
// ---------------------------------------------------------------------------

const RISK_BAND_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high:     '#e07a3a',
  moderate: 'var(--warning)',
  low:      'var(--safe)',
};

const DOMAIN_META: Record<RiskDomain, { label: string; icon: string; color: string }> = {
  safety:     { label: 'Safety',     icon: '⚠', color: 'var(--critical)' },
  mood:       { label: 'Mood',       icon: '◐', color: '#a78bfa' },
  engagement: { label: 'Engagement', icon: '◉', color: '#60a5fa' },
  physical:   { label: 'Physical',   icon: '♡', color: '#34d399' },
  medication: { label: 'Medication', icon: '⊕', color: '#fbbf24' },
};

const TRAJECTORY_META: Record<string, { label: string; color: string; icon: string }> = {
  improving: { label: 'Improving', color: 'var(--safe)',     icon: '↗' },
  stable:    { label: 'Stable',    color: '#60a5fa',         icon: '→' },
  declining: { label: 'Declining', color: 'var(--warning)',  icon: '↘' },
  acute:     { label: 'Acute',     color: 'var(--critical)', icon: '⚡' },
};

function riskScoreBand(score: number | null): string {
  if (score === null) return 'unknown';
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// ---------------------------------------------------------------------------
// RiskGaugeArc — SVG semicircular arc gauge
// ---------------------------------------------------------------------------
function RiskGaugeArc({ score, delta }: { score: number | null; delta?: number | null }) {
  if (score === null) return <span style={{ color: SUB, fontSize: 13 }}>Not yet computed</span>;

  const band = riskScoreBand(score);
  const color = RISK_BAND_COLOR[band]!;
  const cx = 120, cy = 110, r = 90;
  const startAngle = Math.PI;
  const endAngle = 0;
  const scoreAngle = startAngle - (score / 100) * Math.PI;

  // Arc path helper
  const arcPath = (start: number, end: number, radius: number) => {
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy - radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy - radius * Math.sin(end);
    const large = start - end > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  // Needle position
  const nx = cx + (r - 8) * Math.cos(scoreAngle);
  const ny = cy - (r - 8) * Math.sin(scoreAngle);

  // Color segments: green (0-25), yellow (25-50), orange (50-75), red (75-100)
  const segments = [
    { from: 0, to: 25, color: 'var(--safe)' },
    { from: 25, to: 50, color: 'var(--warning)' },
    { from: 50, to: 75, color: '#e07a3a' },
    { from: 75, to: 100, color: 'var(--critical)' },
  ];

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={240} height={130} viewBox="0 0 240 130">
        {/* Background track */}
        <path d={arcPath(startAngle, endAngle, r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} strokeLinecap="round" />

        {/* Color segments */}
        {segments.map((seg, i) => {
          const a1 = startAngle - (seg.from / 100) * Math.PI;
          const a2 = startAngle - (seg.to / 100) * Math.PI;
          return <path key={i} d={arcPath(a1, a2, r)} fill="none" stroke={seg.color} strokeWidth={14} strokeLinecap="butt" opacity={0.25} />;
        })}

        {/* Active arc up to score */}
        <path d={arcPath(startAngle, scoreAngle, r)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />

        {/* Needle dot */}
        <circle cx={nx} cy={ny} r={6} fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} />

        {/* Score text */}
        <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={36} fontWeight={800} fontFamily="inherit">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={SUB} fontSize={12} fontFamily="inherit">{band.toUpperCase()}</text>

        {/* Delta indicator */}
        {delta != null && delta !== 0 && (
          <text x={cx} y={cy + 28} textAnchor="middle" fill={delta > 0 ? 'var(--critical)' : 'var(--safe)'} fontSize={12} fontWeight={700} fontFamily="inherit">
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} pts
          </text>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RiskFactorBars — Domain-grouped graduated factor bars
// ---------------------------------------------------------------------------
function RiskFactorBars({ factors }: { factors: RiskFactorItem[] | null }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!factors || factors.length === 0) return null;

  // Group by domain
  const grouped = factors.reduce<Record<RiskDomain, RiskFactorItem[]>>((acc, f) => {
    (acc[f.domain] ??= []).push(f);
    return acc;
  }, {} as Record<RiskDomain, RiskFactorItem[]>);

  const domainOrder: RiskDomain[] = ['safety', 'mood', 'engagement', 'physical', 'medication'];

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Risk Factors by Domain
      </div>
      {domainOrder.filter(d => grouped[d]?.length).map((domain) => {
        const items = grouped[domain]!;
        const meta = DOMAIN_META[domain];
        const domainTotal = items.reduce((s, f) => s + f.contribution, 0);
        const domainMax = items.reduce((s, f) => s + f.weight, 0);
        const isCollapsed = collapsed[domain] ?? false;

        return (
          <div key={domain} style={{ marginBottom: 10, background: 'var(--glass-01)', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            {/* Domain header */}
            <button
              onClick={() => setCollapsed(p => ({ ...p, [domain]: !p[domain] }))}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, flex: 1, textAlign: 'left' }}>{meta.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: domainTotal > 0 ? TEXT : SUB }}>
                {domainTotal}/{domainMax}
              </span>
              <span style={{ fontSize: 10, color: SUB, transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {/* Factors */}
            {!isCollapsed && (
              <div style={{ padding: '0 12px 10px' }}>
                {items.map((factor) => {
                  const pct = factor.weight > 0 ? (factor.contribution / factor.weight) * 100 : 0;
                  const barColor = factor.contribution === 0 ? 'rgba(255,255,255,0.06)' : meta.color;

                  return (
                    <div key={factor.rule} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: factor.contribution > 0 ? TEXT : SUB, fontWeight: factor.contribution > 0 ? 600 : 400 }}>
                          {factor.label}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: factor.contribution > 0 ? meta.color : SUB, minWidth: 36, textAlign: 'right' }}>
                          {factor.contribution}/{factor.weight}
                        </span>
                      </div>
                      {/* Bar */}
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s ease', opacity: factor.contribution === 0 ? 0 : 0.8 }} />
                      </div>
                      {/* Detail text */}
                      {factor.contribution > 0 && factor.detail && (
                        <div style={{ fontSize: 11, color: SUB, marginTop: 2, lineHeight: 1.4 }}>{factor.detail}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrajectorySparklines — SVG mini-charts for risk, PHQ-9, GAD-7
// ---------------------------------------------------------------------------
function TrajectorySparklines({ riskHistory, insights }: {
  riskHistory: RiskHistoryPoint[];
  insights: AiInsight[];
}) {
  // Extract PHQ-9 and GAD-7 scores from insights' structured_findings or key_findings
  // For now, use risk_history for the main sparkline and assessment data from insights
  if (riskHistory.length < 2) return null;

  const renderSparkline = (
    label: string,
    data: Array<{ value: number; date: string }>,
    color: string,
    maxVal: number,
  ) => {
    if (data.length < 2) return null;
    const w = 160, h = 40, pad = 4;
    const plotW = w - 2 * pad;
    const plotH = h - 2 * pad;
    const xStep = plotW / (data.length - 1);

    const points = data.map((d, i) => {
      const x = pad + i * xStep;
      const y = pad + plotH - (d.value / maxVal) * plotH;
      return `${x},${y}`;
    }).join(' ');

    const last = data[data.length - 1]!;
    const prev = data.length >= 2 ? data[data.length - 2]! : null;
    const delta = prev ? last.value - prev.value : 0;
    const lastX = pad + (data.length - 1) * xStep;
    const lastY = pad + plotH - (last.value / maxVal) * plotH;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ width: 56, fontSize: 11, color: SUB, fontWeight: 600 }}>{label}</div>
        <svg width={w} height={h} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
          <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
          <circle cx={lastX} cy={lastY} r={3} fill={color} />
        </svg>
        <div style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{last.value}</div>
        {delta !== 0 && (
          <span style={{ fontSize: 11, color: delta > 0 ? 'var(--critical)' : 'var(--safe)', fontWeight: 600 }}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
          </span>
        )}
      </div>
    );
  };

  const riskData = riskHistory.map(p => ({ value: p.score, date: p.computed_at }));

  return (
    <div className="tab-card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Trends
      </div>
      {renderSparkline('Risk', riskData, RISK_BAND_COLOR[riskScoreBand(riskData[riskData.length - 1]?.value ?? 0)]!, 100)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EarlyWarningSignals — Highlighted warning boxes from deep analysis
// ---------------------------------------------------------------------------
function EarlyWarningSignals({ warnings }: {
  warnings: Array<{ signal: string; urgency: 'routine' | 'elevated' | 'urgent'; domain: string }>;
}) {
  if (!warnings || warnings.length === 0) return null;

  // Sort: urgent first, then elevated, then routine
  const sorted = [...warnings].sort((a, b) => {
    const order = { urgent: 0, elevated: 1, routine: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  const urgencyStyle: Record<string, { bg: string; border: string; color: string; icon: string }> = {
    urgent:   { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', color: 'var(--critical)', icon: '🔴' },
    elevated: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', color: 'var(--warning)', icon: '🟡' },
    routine:  { bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.2)', color: '#60a5fa', icon: '🔵' },
  };

  return (
    <div className="tab-card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Early Warning Signals
      </div>
      {sorted.map((w, i) => {
        const s = urgencyStyle[w.urgency] ?? urgencyStyle.routine!;
        return (
          <div key={i} style={{
            background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
            padding: '8px 12px', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: s.color, fontWeight: 600, lineHeight: 1.5 }}>{w.signal}</div>
              <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
                <span style={{
                  display: 'inline-block', background: `${s.color}22`, border: `1px solid ${s.color}33`,
                  borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: s.color,
                  textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 6,
                }}>
                  {w.domain}
                </span>
                {w.urgency}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeepInsightPanel — Structured deep insight display
// ---------------------------------------------------------------------------
function DeepInsightPanel({ insight }: { insight: AiInsight }) {
  const [showNarrative, setShowNarrative] = useState(false);
  const sf = insight.structured_findings as StructuredFindings | null;
  const trajectory = insight.clinical_trajectory;

  // If no structured findings, render legacy view
  if (!sf) {
    return (
      <div className="tab-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="tab-section-title" style={{ margin: 0, fontSize: 13 }}>
            {insight.insight_type === 'weekly_summary' ? 'Weekly Summary' :
             insight.insight_type === 'detect_anomaly' ? 'Anomaly Detection' :
             insight.insight_type === 'nightly_deep_analysis' ? 'Deep Analysis' :
             'Trend Narrative'}
          </h3>
          <span style={{ background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}44`, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: PRIMARY, letterSpacing: 0.5 }}>AI</span>
        </div>
        <div style={{ fontSize: 11, color: SUB, marginBottom: 10 }}>{format(parseISO(insight.generated_at), 'MMM d, yyyy \'at\' h:mm a')}</div>
        {insight.key_findings.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {insight.key_findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, background: PRIMARY, marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowNarrative(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12, fontWeight: 600, padding: 0 }}
        >
          {showNarrative ? '▲ Hide narrative' : '▼ Show full narrative'}
        </button>
        {showNarrative && (
          <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{insight.narrative}</p>
        )}
      </div>
    );
  }

  // Structured deep analysis view
  const trajMeta = trajectory ? TRAJECTORY_META[trajectory] : null;

  return (
    <div className="tab-card" style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="tab-section-title" style={{ margin: 0, fontSize: 14 }}>Deep Analysis</h3>
          {trajMeta && (
            <span style={{
              background: `${trajMeta.color}18`, border: `1px solid ${trajMeta.color}44`,
              borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700,
              color: trajMeta.color, letterSpacing: 0.3,
            }}>
              {trajMeta.icon} {trajMeta.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: SUB }}>{format(parseISO(insight.generated_at), 'MMM d, yyyy \'at\' h:mm a')}</div>
      </div>

      {/* Trajectory rationale */}
      {sf.trajectory_rationale && (
        <div style={{
          background: `${trajMeta?.color ?? PRIMARY}0a`, border: `1px solid ${trajMeta?.color ?? PRIMARY}22`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: TEXT, lineHeight: 1.6,
        }}>
          {sf.trajectory_rationale}
        </div>
      )}

      {/* Key Findings */}
      {insight.key_findings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Key Findings</div>
          {insight.key_findings.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: PRIMARY, marginTop: 6, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Domain Findings */}
      {sf.domain_findings && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Domain Analysis</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.entries(sf.domain_findings) as Array<[string, string | undefined]>).filter(([, v]) => v).map(([domain, text]) => {
              const dKey = domain === 'anxiety' ? 'mood' : domain === 'sleep' ? 'physical' : domain as RiskDomain;
              const meta = DOMAIN_META[dKey] ?? { icon: '•', color: SUB, label: domain };
              return (
                <div key={domain} style={{
                  background: 'var(--glass-01)', border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '10px 12px', borderLeft: `3px solid ${meta.color}`,
                }}>
                  <div style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {meta.icon} {domain}
                  </div>
                  <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{text}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Treatment Response */}
      {sf.treatment_response && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Treatment Response</div>
          <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: 0 }}>{sf.treatment_response}</p>
        </div>
      )}

      {/* Recommended Focus Areas */}
      {sf.recommended_focus && sf.recommended_focus.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Recommended Focus</div>
          {sf.recommended_focus.sort((a, b) => a.priority - b.priority).map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <span style={{
                background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}33`, borderRadius: '50%',
                width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: PRIMARY, flexShrink: 0,
              }}>
                {f.priority}
              </span>
              <div>
                <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{f.area}</div>
                <div style={{ fontSize: 12, color: SUB, lineHeight: 1.4 }}>{f.rationale}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cross-Domain Patterns */}
      {sf.cross_domain_patterns && sf.cross_domain_patterns.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Cross-Domain Patterns</div>
          {sf.cross_domain_patterns.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#a78bfa', fontSize: 12, flexShrink: 0 }}>⟡</span>
              <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable full narrative */}
      <button
        onClick={() => setShowNarrative(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12, fontWeight: 600, padding: 0 }}
      >
        {showNarrative ? '▲ Hide full narrative' : '▼ Show full narrative'}
      </button>
      {showNarrative && (
        <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.7, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{insight.narrative}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Chat types
// ---------------------------------------------------------------------------

interface Discussion {
  id:            string;
  title:         string;
  message_count: number;
  updated_at:    string;
}

interface ChatMsg {
  id:         string;
  role:       'clinician' | 'assistant';
  content:    string;
  created_at: string;
}

function AiInsightsTab({
  patientId, data, loading, unavailable, token, onTrigger,
}: {
  patientId:   string;
  data:        AiInsightsData | null;
  loading:     boolean;
  unavailable: boolean;
  token:       string | null;
  onTrigger:   () => void;
}) {
  // Left panel state
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<'weekly_summary' | 'nightly_deep_analysis'>('nightly_deep_analysis');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  // Chat state
  const [discussions, setDiscussions]               = useState<Discussion[]>([]);
  const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages]             = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]                   = useState('');
  const [chatSending, setChatSending]               = useState(false);
  const [chatError, setChatError]                   = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // Fetch discussions list
  const fetchDiscussions = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api.get<{ discussions: Discussion[] }>(
        `/insights/${patientId}/ai/discussions?limit=20`, token,
      );
      setDiscussions(d.discussions);
    } catch { /* silent */ }
  }, [token, patientId]);

  useEffect(() => { void fetchDiscussions(); }, [fetchDiscussions]);

  // Load discussion messages when active discussion changes
  useEffect(() => {
    if (!activeDiscussionId || !token) {
      setChatMessages([]);
      return;
    }
    (async () => {
      try {
        const d = await api.get<{ messages: ChatMsg[] }>(
          `/insights/${patientId}/ai/discussions/${activeDiscussionId}`, token,
        );
        setChatMessages(d.messages);
      } catch { setChatMessages([]); }
    })();
  }, [activeDiscussionId, token, patientId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatSending]);

  const triggerInsight = async () => {
    if (!token || triggering) return;
    setTriggering(true);
    setTriggerMsg(null);
    try {
      await api.post(`/insights/${patientId}/ai/trigger`, {
        type: triggerType,
        period_days: triggerType === 'nightly_deep_analysis' ? 30 : 7,
      }, token);
      setTriggerMsg('Insight generation queued. Results will appear in ~2 minutes.');
      setTimeout(() => onTrigger(), 5_000);
    } catch (e) {
      const err = e as { message?: string };
      setTriggerMsg(`Failed: ${err.message ?? 'Unknown error'}`);
    } finally {
      setTriggering(false);
    }
  };

  const sendMessage = async () => {
    if (!token || !chatInput.trim() || chatSending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    setChatError(null);

    // Optimistically show clinician message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMsg = {
      id: tempId,
      role: 'clinician',
      content: msg,
      created_at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await api.post<{
        discussion_id: string;
        clinician_message: ChatMsg;
        assistant_message: ChatMsg;
      }>(`/insights/${patientId}/ai/chat`, {
        discussion_id: activeDiscussionId,
        message: msg,
      }, token);

      setChatMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        result.clinician_message,
        result.assistant_message,
      ]);

      if (!activeDiscussionId) {
        setActiveDiscussionId(result.discussion_id);
        void fetchDiscussions();
      }
    } catch (e) {
      const err = e as { message?: string };
      setChatError(err.message ?? 'Failed to send message');
      setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
      setChatInput(msg);
    } finally {
      setChatSending(false);
    }
  };

  const startNewDiscussion = () => {
    setActiveDiscussionId(null);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  if (loading) {
    return <div className="tab-loading">Loading AI insights…</div>;
  }

  if (unavailable) {
    return (
      <div className="tab-card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <h3 style={{ color: TEXT, margin: '0 0 8px' }}>AI Insights Not Available</h3>
        <p style={{ color: SUB, maxWidth: 440, margin: '0 auto 16px', fontSize: 14, lineHeight: 1.6 }}>
          AI-powered clinical insights require either a signed Business Associate Agreement with Anthropic
          or a local Ollama installation, plus <code>AI_INSIGHTS_ENABLED=true</code>. Contact your MindLog
          administrator to enable this feature.
        </p>
      </div>
    );
  }

  const latestInsight = data?.insights[0] ?? null;
  const latestDeep = data?.insights.find(i => i.insight_type === 'nightly_deep_analysis') ?? null;
  const olderInsights = data?.insights.slice(1) ?? [];
  const riskHistory = data?.risk_history ?? [];
  const updatedAt = data?.risk_score_updated_at
    ? format(parseISO(data.risk_score_updated_at), 'MMM d, yyyy \'at\' h:mm a')
    : null;

  // Compute risk delta from history
  const riskDelta = riskHistory.length >= 2
    ? riskHistory[riskHistory.length - 1]!.score - riskHistory[riskHistory.length - 2]!.score
    : null;

  // Extract early warnings from latest deep insight
  const earlyWarnings = (latestDeep?.structured_findings as StructuredFindings | null)?.early_warnings ?? [];

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 500 }}>
      {/* ── Left Panel: Risk & Signals ── */}
      <div style={{ width: 480, flexShrink: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        {/* Risk Score arc gauge */}
        <div className="tab-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <h3 className="tab-section-title" style={{ margin: 0, marginBottom: 4, fontSize: 14 }}>Composite Risk Score</h3>
              {updatedAt && <div style={{ fontSize: 11, color: SUB }}>Last computed {updatedAt}</div>}
            </div>
          </div>
          <RiskGaugeArc score={data?.risk_score ?? null} delta={riskDelta} />
        </div>

        {/* Risk Factor Bars (domain-grouped) */}
        <div className="tab-card" style={{ marginBottom: 16 }}>
          <RiskFactorBars factors={data?.risk_score_factors ?? null} />
          {(!data?.risk_score_factors || data.risk_score_factors.length === 0) && (
            <div style={{ textAlign: 'center', color: SUB, fontSize: 12, padding: 12 }}>No risk factors computed yet</div>
          )}
        </div>

        {/* Trajectory Sparklines */}
        <TrajectorySparklines riskHistory={riskHistory} insights={data?.insights ?? []} />

        {/* Early Warning Signals */}
        <EarlyWarningSignals warnings={earlyWarnings} />

        {/* Generate Insight controls */}
        <div className="tab-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as typeof triggerType)}
              className="sort-select"
              style={{ fontSize: 12, flex: 1 }}
            >
              <option value="nightly_deep_analysis">Deep Analysis (30-day)</option>
              <option value="weekly_summary">Weekly Summary (7-day)</option>
            </select>
          </div>
          <button
            onClick={() => void triggerInsight()}
            disabled={triggering}
            style={{
              width: '100%', background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`,
              color: PRIMARY, borderRadius: 8, padding: '10px 14px',
              fontSize: 13, fontWeight: 600, cursor: triggering ? 'not-allowed' : 'pointer',
              opacity: triggering ? 0.6 : 1,
            }}
          >
            {triggering ? 'Generating…' : '✦ Generate Insight'}
          </button>
          {triggerMsg && (
            <div style={{
              marginTop: 10, borderRadius: 6, padding: '6px 10px', fontSize: 12,
              background: triggerMsg.startsWith('Failed') ? 'var(--critical-bg)' : 'var(--safe-bg)',
              color: triggerMsg.startsWith('Failed') ? 'var(--critical)' : 'var(--safe)',
            }}>
              {triggerMsg}
            </div>
          )}
        </div>

        {/* HIPAA disclaimer */}
        <div style={{ background: 'var(--glass-01)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ fontSize: 11, color: SUB, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
            ⚕ {data?.disclaimer ?? 'AI-generated content is for clinical decision support only. It does not constitute a diagnosis or replace clinical assessment.'}
          </p>
        </div>

        {/* Empty state */}
        {!loading && (!data || data.insights.length === 0) && (
          <div style={{ textAlign: 'center', color: SUB, padding: '24px 0', fontSize: 12 }}>
            No AI insights generated yet. Click "Generate Insight" to create the first analysis.
          </div>
        )}
      </div>

      {/* ── Right Panel: Deep Insight + History + Chat ── */}
      <div style={{ flex: 1, minWidth: 400, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        {/* Latest Deep Insight (structured) or latest insight */}
        {latestInsight && (
          <DeepInsightPanel insight={latestDeep ?? latestInsight} />
        )}

        {/* Insight History Timeline */}
        {olderInsights.length > 0 && (
          <div className="tab-card" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Insight History
            </div>
            {olderInsights.map((insight) => {
              const isExpanded = expandedHistory === insight.id;
              const typeLabel = insight.insight_type === 'weekly_summary' ? 'Weekly Summary' :
                insight.insight_type === 'nightly_deep_analysis' ? 'Deep Analysis' :
                insight.insight_type === 'detect_anomaly' ? 'Anomaly Detection' : 'Trend';
              const traj = insight.clinical_trajectory;
              const trajMeta = traj ? TRAJECTORY_META[traj] : null;

              return (
                <div key={insight.id} style={{
                  borderLeft: `2px solid ${BORDER}`, paddingLeft: 12, marginBottom: 10,
                  marginLeft: 4,
                }}>
                  <button
                    onClick={() => setExpandedHistory(p => p === insight.id ? null : insight.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', background: PRIMARY, marginLeft: -17,
                      border: '2px solid var(--bg)', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{typeLabel}</span>
                    {trajMeta && (
                      <span style={{ fontSize: 11, color: trajMeta.color, fontWeight: 600 }}>{trajMeta.icon} {trajMeta.label}</span>
                    )}
                    <span style={{ fontSize: 11, color: SUB }}>{format(parseISO(insight.generated_at), 'MMM d')}</span>
                    <span style={{ fontSize: 10, color: SUB, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: 8 }}>
                      {insight.key_findings.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          {insight.key_findings.slice(0, 4).map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                              <div style={{ width: 4, height: 4, borderRadius: 2, background: PRIMARY, marginTop: 5, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.4 }}>{f}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: TEXT, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                        {insight.narrative.length > 500 ? insight.narrative.substring(0, 500) + '…' : insight.narrative}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AI Chat */}
        <div style={{
          flex: 1, minHeight: 350, display: 'flex', flexDirection: 'column',
          background: 'var(--glass-01)', border: `1px solid ${BORDER}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Chat header */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, flex: 1 }}>AI Assistant</span>
            <select
              value={activeDiscussionId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') startNewDiscussion();
                else setActiveDiscussionId(val);
              }}
              className="sort-select"
              style={{ maxWidth: 200, fontSize: 12 }}
            >
              <option value="">New Discussion</option>
              {discussions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title.length > 35 ? d.title.substring(0, 32) + '...' : d.title}
                </option>
              ))}
            </select>
            <button
              onClick={startNewDiscussion}
              style={{
                background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}44`,
                borderRadius: 6, padding: '4px 10px', fontSize: 12,
                color: PRIMARY, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + New
            </button>
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
            maxHeight: 'calc(100vh - 520px)', minHeight: 200,
          }}>
            {chatMessages.length === 0 && !chatSending && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', flex: 1, color: SUB, gap: 8, padding: 32,
              }}>
                <span style={{ fontSize: 28, opacity: 0.5 }}>✦</span>
                <span style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                  Ask questions about this patient's clinical data, trends, and trajectory.
                </span>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'clinician' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: msg.role === 'clinician' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: msg.role === 'clinician' ? 'var(--glass-02)' : 'var(--glass-01)',
                  borderLeft: msg.role === 'assistant' ? `3px solid ${PRIMARY}` : 'none',
                  border: msg.role === 'clinician' ? `1px solid ${BORDER}` : `1px solid ${PRIMARY}33`,
                }}>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  <div style={{ fontSize: 10, color: SUB, marginTop: 4, textAlign: msg.role === 'clinician' ? 'right' : 'left' }}>
                    {format(parseISO(msg.created_at), 'h:mm a')}
                  </div>
                </div>
              </div>
            ))}

            {chatSending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '12px 12px 12px 4px',
                  background: 'var(--glass-01)', borderLeft: `3px solid ${PRIMARY}`,
                  border: `1px solid ${PRIMARY}33`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: PRIMARY, fontSize: 13, fontWeight: 600 }}>Thinking</span>
                    <span style={{ color: PRIMARY, fontSize: 18, animation: 'pulse 1.5s ease-in-out infinite' }}>...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div style={{
              margin: '0 16px', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'var(--critical-bg)', color: 'var(--critical)',
            }}>
              {chatError}
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this patient..."
              disabled={chatSending}
              rows={1}
              style={{
                flex: 1, resize: 'none', background: 'var(--glass-02)',
                border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '8px 12px', fontSize: 13, color: TEXT,
                lineHeight: 1.5, maxHeight: 96, overflow: 'auto',
                outline: 'none', fontFamily: 'inherit',
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={chatSending || !chatInput.trim()}
              style={{
                background: chatSending || !chatInput.trim() ? `${PRIMARY}33` : PRIMARY,
                border: 'none', borderRadius: 8, padding: '8px 16px',
                color: chatSending || !chatInput.trim() ? `${PRIMARY}88` : '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </button>
          </div>

          <div style={{ padding: '6px 16px 10px', borderTop: `1px solid ${BORDER}22` }}>
            <p style={{ fontSize: 10, color: SUB, margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
              ⚕ AI-generated · For clinical decision support only · Always apply clinical judgment
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  // Patient + care team (loaded on mount)
  const [patient, setPatient] = useState<Patient | null>(null);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [patientLoading, setPatientLoading] = useState(true);
  const [invite, setInvite] = useState<PatientInvite | null>(null);

  // Tab: Mood Trends
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // Tab: Journal
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalTotal, setJournalTotal] = useState(0);
  const [journalPage, setJournalPage] = useState(1);

  // Tab: Notes
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState('observation');
  const [notePrivate, setNotePrivate] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Tab: Alerts
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [alertsPage, setAlertsPage] = useState(1);

  // Tab: Medications
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [medsLoading, setMedsLoading] = useState(false);
  const [showDiscontinued, setShowDiscontinued] = useState(false);

  // Tab: AI Insights
  const [aiData,        setAiData]        = useState<AiInsightsData | null>(null);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  // Assessment history (used in Trends tab chart)
  const [assessments, setAssessments]             = useState<AssessmentScore[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);

  // Quick actions footer — Assessment Request modal
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [actionToast, setActionToast] = useState('');

  // Header: inline status/risk edit
  const [editStatus, setEditStatus] = useState('');
  const [editRisk, setEditRisk] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // -- Load patient + care team
  // Care team loaded separately so its failure doesn't block patient rendering
  const fetchPatient = useCallback(async () => {
    if (!token || !patientId) return;
    setPatientLoading(true);
    try {
      const p = await api.get<Patient>(`/patients/${patientId}`, token);
      setPatient(p);
    } catch (e) {
      console.error('[patient-detail] load error', e);
    } finally {
      setPatientLoading(false);
    }
    // Care team is non-critical — load independently
    try {
      const ct = await api.get<CareTeamMember[]>(`/patients/${patientId}/care-team`, token);
      setCareTeam(ct);
    } catch { /* care-team endpoint may not be available */ }
  }, [token, patientId]);

  const fetchInvite = useCallback(async (p: Patient) => {
    if (!token || !p.invite_id) return;
    try {
      // Fetch all invites and find the one matching this patient
      const invites = await api.get<PatientInvite[]>('/invites', token);
      const found = invites.find((inv) => inv.id === p.invite_id);
      setInvite(found ?? null);
    } catch { /* non-fatal */ }
  }, [token]);

  useEffect(() => { void fetchPatient(); }, [fetchPatient]);
  useEffect(() => { if (patient) void fetchInvite(patient); }, [patient, fetchInvite]);

  // Sync edit selects whenever the patient object updates
  useEffect(() => {
    if (patient) {
      setEditStatus(patient.status);
      setEditRisk(patient.risk_level);
    }
  }, [patient]);

  // Push patient name + id to UI store so topbar and QuickNotePanel can use it; clear on unmount
  useEffect(() => {
    if (patient) {
      uiActions.setPatientName(`${patient.first_name} ${patient.last_name}`);
      uiActions.setPatientId(patient.id);
    }
    return () => { uiActions.setPatientName(null); uiActions.setPatientId(null); };
  }, [patient]);

  // -- Tab data fetchers
  const fetchHeatmap = useCallback(async () => {
    if (!token || !patientId) return;
    setHeatmapLoading(true);
    try {
      const rows = await api.get<HeatmapEntry[]>(`/patients/${patientId}/mood-heatmap`, token);
      setHeatmap(rows);
    } catch { /* silent */ } finally { setHeatmapLoading(false); }
  }, [token, patientId]);

  const fetchJournal = useCallback(async () => {
    if (!token || !patientId) return;
    setJournalLoading(true);
    try {
      const d = await api.get<{ items: JournalEntry[]; total: number }>(
        `/journal/shared/${patientId}?page=${journalPage}&limit=10`, token,
      );
      setJournal(d.items);
      setJournalTotal(d.total);
    } catch { /* silent */ } finally { setJournalLoading(false); }
  }, [token, patientId, journalPage]);

  const fetchNotes = useCallback(async () => {
    if (!token || !patientId) return;
    setNotesLoading(true);
    try {
      const d = await api.get<{ items: ClinicalNote[]; total: number }>(
        `/clinicians/notes/${patientId}?page=${notesPage}&limit=10`, token,
      );
      setNotes(d.items);
      setNotesTotal(d.total);
    } catch { /* silent */ } finally { setNotesLoading(false); }
  }, [token, patientId, notesPage]);

  const fetchAlerts = useCallback(async () => {
    if (!token || !patientId) return;
    setAlertsLoading(true);
    try {
      const d = await api.get<{ items: PatientAlert[]; total: number }>(
        `/alerts/patients/${patientId}?page=${alertsPage}&limit=10`, token,
      );
      setAlerts(d.items);
      setAlertsTotal(d.total);
    } catch { /* silent */ } finally { setAlertsLoading(false); }
  }, [token, patientId, alertsPage]);

  const fetchMedications = useCallback(async () => {
    if (!token || !patientId) return;
    setMedsLoading(true);
    try {
      const rows = await api.get<PatientMedication[]>(
        `/medications?patient_id=${patientId}&include_discontinued=${showDiscontinued}`, token,
      );
      setMedications(rows);
    } catch { /* silent */ } finally { setMedsLoading(false); }
  }, [token, patientId, showDiscontinued]);

  const fetchAssessments = useCallback(async () => {
    if (!token || !patientId) return;
    setAssessmentsLoading(true);
    try {
      const rows = await api.get<AssessmentScore[]>(`/patients/${patientId}/assessments`, token);
      setAssessments(rows);
    } catch { /* silent — endpoint may not return data yet */ } finally { setAssessmentsLoading(false); }
  }, [token, patientId]);

  const fetchAiInsights = useCallback(async () => {
    if (!token || !patientId) return;
    setAiLoading(true);
    setAiUnavailable(false);
    try {
      const d = await api.get<AiInsightsData>(`/insights/${patientId}/ai?limit=10`, token);
      setAiData(d);
    } catch (e) {
      const err = e as { status?: number };
      if (err.status === 503) setAiUnavailable(true);
      // 403 (not on care team) handled by page-level 404
    } finally {
      setAiLoading(false);
    }
  }, [token, patientId]);

  // Load tab data when tab is active (also re-fires when page deps change)
  useEffect(() => { if (tab === 'trends') { void fetchHeatmap(); void fetchAssessments(); } }, [tab, fetchHeatmap, fetchAssessments]);
  useEffect(() => { if (tab === 'journal') void fetchJournal(); }, [tab, fetchJournal]);
  useEffect(() => { if (tab === 'notes') void fetchNotes(); }, [tab, fetchNotes]);
  useEffect(() => { if (tab === 'alerts') void fetchAlerts(); }, [tab, fetchAlerts]);
  useEffect(() => { if (tab === 'medications') void fetchMedications(); }, [tab, fetchMedications]);
  useEffect(() => { if (tab === 'ai') void fetchAiInsights(); }, [tab, fetchAiInsights]);

  // -- Add note
  const submitNote = useCallback(async () => {
    if (!token || !patientId || !noteBody.trim()) return;
    setNoteSubmitting(true);
    try {
      await api.post(`/clinicians/notes/${patientId}`, {
        body: noteBody.trim(),
        note_type: noteType,
        is_private: notePrivate,
      }, token);
      setNoteBody('');
      setNoteType('observation');
      setNotePrivate(false);
      void fetchNotes();
    } catch (e) {
      console.error('[notes] submit error', e);
    } finally {
      setNoteSubmitting(false);
    }
  }, [token, patientId, noteBody, noteType, notePrivate, fetchNotes]);

  const discontinueMedication = useCallback(async (medId: string) => {
    if (!token) return;
    try {
      await api.patch(`/medications/${medId}?patient_id=${patientId}`, {
        discontinued_at: new Date().toISOString().split('T')[0],
      }, token);
      void fetchMedications();
    } catch (e) {
      console.error('[medications] discontinue error', e);
    }
  }, [token, patientId, fetchMedications]);

  const saveStatusRisk = useCallback(async () => {
    if (!token || !patientId || !patient) return;
    if (editStatus === patient.status && editRisk === patient.risk_level) return;
    setIsSavingStatus(true);
    try {
      const updated = await api.patch<Patient>(`/patients/${patientId}`, {
        ...(editStatus !== patient.status ? { status: editStatus } : {}),
        ...(editRisk !== patient.risk_level ? { risk_level: editRisk } : {}),
      }, token);
      setPatient(updated);
    } catch (e) {
      console.error('[patient-detail] status/risk save error', e);
    } finally {
      setIsSavingStatus(false);
    }
  }, [token, patientId, patient, editStatus, editRisk]);

  const name = patient ? `${patient.first_name} ${patient.last_name}` : '…';
  const statusColor = patient ? (STATUS_COLOR[patient.status] ?? '#4a5568') : SUB;

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'trends', label: 'Mood Trends' },
    { key: 'journal', label: 'Journal' },
    { key: 'notes', label: 'Notes' },
    { key: 'alerts', label: alertsTotal > 0 ? `Alerts (${alertsTotal})` : 'Alerts' },
    { key: 'medications', label: `Medications${medications.length > 0 ? ` (${medications.length})` : ''}` },
    { key: 'ai', label: '✦ AI Insights' },
  ];

  // Avatar color based on name hash
  const avatarColor = (() => {
    const COLORS = ['#2a7ab5','#5A8A8A','#c9972a','#7c6fa0','#2a9d8f','#e05a2a','#2a6db5','#9a5a8a','#3A8A8A','#c04060'];
    const hash = (patient?.first_name ?? 'P').charCodeAt(0) + (patient?.last_name ?? 'P').charCodeAt(0);
    return COLORS[hash % COLORS.length]!;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Patient detail header (prototype style) ── */}
      <div className="patient-detail-header">
        <div className="detail-avatar" style={{ background: avatarColor }}>
          {patient ? `${patient.first_name.charAt(0)}${patient.last_name.charAt(0)}`.toUpperCase() : '??'}
        </div>

        <div className="detail-meta">
          {patientLoading ? (
            <div style={{ color: 'var(--ink-soft)' }}>Loading patient…</div>
          ) : patient ? (
            <>
              <div className="detail-name">
                {name}
                {patient.preferred_name && patient.preferred_name !== patient.first_name && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 400, marginLeft: 8 }}>
                    "{patient.preferred_name}"
                  </span>
                )}
              </div>

              <div className="detail-badges">
                <span className={`badge badge-${patient.status}`}>{patient.status}</span>
                {patient.risk_level && (
                  <span className={`badge badge-risk-${patient.risk_level}`}>{patient.risk_level} risk</span>
                )}
                {alertsTotal > 0 && (
                  <span className="badge badge-risk-critical">{alertsTotal} alerts</span>
                )}
              </div>

              <div className="detail-chips">
                <span className="detail-chip">MRN {patient.mrn}</span>
                {patient.gender && (
                  <span className="detail-chip">{patient.gender}</span>
                )}
                {patient.tracking_streak > 0 && (
                  <span className="detail-chip">🔥 {patient.tracking_streak}d streak</span>
                )}
                {patient.last_checkin_at && (
                  <span className="detail-chip">Last seen {formatRelative(patient.last_checkin_at)}</span>
                )}
              </div>

              <div className="detail-actions">
                <select
                  className="sort-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={isSavingStatus}
                >
                  <option value="active">Active</option>
                  <option value="crisis">Crisis</option>
                  <option value="inactive">Inactive</option>
                  <option value="discharged">Discharged</option>
                </select>
                <select
                  className="sort-select"
                  value={editRisk}
                  onChange={(e) => setEditRisk(e.target.value)}
                  disabled={isSavingStatus}
                >
                  <option value="low">Low Risk</option>
                  <option value="moderate">Moderate Risk</option>
                  <option value="high">High Risk</option>
                  <option value="critical">Critical Risk</option>
                </select>
                {(editStatus !== patient.status || editRisk !== patient.risk_level) && (
                  <button
                    className="detail-actions-btn primary"
                    onClick={() => void saveStatusRisk()}
                    disabled={isSavingStatus}
                  >
                    {isSavingStatus ? 'Saving…' : 'Save'}
                  </button>
                )}
                <button
                  className="detail-actions-btn primary"
                  onClick={() => navigate(`/reports?patientId=${patientId}`)}
                >
                  📋 Generate Report
                </button>
                <button
                  className="detail-actions-btn"
                  onClick={() => navigate('/patients')}
                >
                  ← All Patients
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--critical)' }}>Patient not found or access denied.</div>
          )}
        </div>
      </div>

      {/* ── Tab bar (prototype .detail-tab-bar style) ── */}
      <div className="detail-tab-bar">
        {TABS.map(({ key, label }) => (
          <div
            key={key}
            className={`detail-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: 84 }}>
        {!patient && !patientLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 60 }}>
            Patient not found or you don't have access.
          </div>
        ) : tab === 'overview' && patient ? (
          <OverviewTab
            patient={patient}
            careTeam={careTeam}
            patientId={patientId!}
            navigate={navigate}
            invite={invite}
            token={token}
            onInviteAction={() => void fetchInvite(patient)}
          />
        ) : tab === 'trends' ? (
          <MoodTrendsTab
            heatmap={heatmap}
            loading={heatmapLoading}
            assessments={assessments}
            assessmentsLoading={assessmentsLoading}
          />
        ) : tab === 'journal' ? (
          <JournalTab
            entries={journal} loading={journalLoading} total={journalTotal}
            page={journalPage} onPage={setJournalPage}
          />
        ) : tab === 'notes' ? (
          <NotesTab
            notes={notes} loading={notesLoading} total={notesTotal}
            page={notesPage} onPage={setNotesPage}
            noteBody={noteBody} setNoteBody={setNoteBody}
            noteType={noteType} setNoteType={setNoteType}
            notePrivate={notePrivate} setNotePrivate={setNotePrivate}
            noteSubmitting={noteSubmitting} onSubmit={() => void submitNote()}
          />
        ) : tab === 'alerts' ? (
          <AlertsTab
            alerts={alerts} loading={alertsLoading} total={alertsTotal}
            page={alertsPage} onPage={setAlertsPage}
            token={token} onRefresh={() => void fetchAlerts()}
          />
        ) : tab === 'medications' ? (
          <MedicationsTab
            medications={medications}
            loading={medsLoading}
            showDiscontinued={showDiscontinued}
            onToggleDiscontinued={() => setShowDiscontinued((v) => !v)}
            onDiscontinue={(id) => void discontinueMedication(id)}
          />
        ) : tab === 'ai' ? (
          <AiInsightsTab
            patientId={patientId!}
            data={aiData}
            loading={aiLoading}
            unavailable={aiUnavailable}
            token={token}
            onTrigger={() => void fetchAiInsights()}
          />
        ) : null}
      </div>

      {/* ── Quick Actions sticky footer (only shown when patient loaded) ── */}
      {patient && (
        <div style={{
          position: 'sticky', bottom: 0, left: 0, right: 0,
          background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', gap: 10,
          zIndex: 100,
        }}>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
            Quick Actions
          </span>
          <button
            className="detail-actions-btn"
            onClick={() => setTab('notes')}
            title="Go to Notes tab to add a clinical note"
          >
            ✏ Add Note
          </button>
          <button
            className="detail-actions-btn"
            onClick={() => setShowAssessmentModal(true)}
          >
            📋 Request Assessment
          </button>
          <button
            className="detail-actions-btn primary"
            onClick={() => navigate(`/reports?patientId=${patientId}`)}
          >
            📄 Generate Report
          </button>
          <button
            className="detail-actions-btn"
            style={{ color: 'var(--critical)', borderColor: 'var(--critical)44' }}
            onClick={() => {
              setEditStatus('crisis');
              void (async () => {
                if (!token || !patientId) return;
                try {
                  const updated = await api.patch<Patient>(`/patients/${patientId}`, { status: 'crisis' }, token);
                  setPatient(updated);
                  setActionToast('Patient status escalated to Crisis');
                  setTimeout(() => setActionToast(''), 4000);
                } catch { /* non-fatal */ }
              })();
            }}
          >
            🚨 Escalate Alert
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--ink-ghost)' }}>
            {patient.first_name} {patient.last_name} · MRN {patient.mrn}
          </span>
        </div>
      )}

      {/* Assessment Request Modal */}
      {showAssessmentModal && patient && (
        <AssessmentRequestModal
          patientId={patient.id}
          patientName={`${patient.first_name} ${patient.last_name}`}
          onClose={() => setShowAssessmentModal(false)}
          onSuccess={() => {
            setShowAssessmentModal(false);
            setActionToast('Assessment request sent successfully');
            setTimeout(() => setActionToast(''), 4000);
          }}
        />
      )}

      {/* Action toast */}
      {actionToast && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24,
          background: 'var(--safe-bg)', border: '1px solid var(--safe)',
          color: 'var(--safe)', padding: '10px 18px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          ✓ {actionToast}
        </div>
      )}
    </div>
  );
}
