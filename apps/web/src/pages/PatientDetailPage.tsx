// =============================================================================
// MindLog Web — Patient Detail Page
// 5 tabs: Overview · Mood Trends · Journal · Notes · Alerts
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { format, parseISO, differenceInYears } from 'date-fns';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

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

type Tab = 'overview' | 'trends' | 'journal' | 'notes' | 'alerts';

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

const BG = '#0c0f18';
const CARD = '#161a27';
const BORDER = '#1e2535';
const TEXT = '#e2e8f0';
const SUB = '#8b9cb0';
const PRIMARY = DESIGN_TOKENS.COLOR_PRIMARY;

const RISK_COLOR: Record<string, string> = {
  critical: '#d62828', high: '#faa307', moderate: '#e9c46a', low: '#6a994e',
};
const STATUS_COLOR: Record<string, string> = {
  crisis: '#d62828', active: '#2a9d8f', inactive: '#4a5568', discharged: '#4a5568',
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: '#d62828', warning: '#faa307', info: '#2a9d8f',
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
): Array<{ date: string; mood: number | null; has_safety_flag: boolean }> {
  const map = new Map(data.map((e) => [e.entry_date, e]));
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const dateStr = d.toISOString().split('T')[0]!;
    const entry = map.get(dateStr);
    return { date: dateStr, mood: entry?.mood ?? null, has_safety_flag: entry?.has_safety_flag ?? false };
  });
}

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
  patient, careTeam, patientId, navigate,
}: {
  patient: Patient;
  careTeam: CareTeamMember[];
  patientId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const age = differenceInYears(new Date(), parseISO(patient.date_of_birth));
  const statusColor = STATUS_COLOR[patient.status] ?? '#4a5568';
  const riskColor = RISK_COLOR[patient.risk_level] ?? SUB;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Demographics */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Patient Information
        </h3>
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
          {patient.onboarding_complete && <Badge label="Onboarded" color="#6a994e" />}
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Tracking Stats
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: BG, borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: PRIMARY }}>{patient.tracking_streak}</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Current Streak (days)</div>
          </div>
          <div style={{ background: BG, borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#e9c46a' }}>{patient.longest_streak}</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Longest Streak (days)</div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: SUB }}>
          Last check-in:{' '}
          <span style={{ color: patient.last_checkin_at ? '#6a994e' : '#4a5568' }}>
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

      {/* Care team — full width */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, gridColumn: '1 / -1' }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Care Team ({careTeam.length})
        </h3>
        {careTeam.length === 0 ? (
          <p style={{ color: SUB, fontSize: 13, margin: 0 }}>No care team members assigned.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {careTeam.map((m) => (
              <div key={m.clinician_id} style={{ background: BG, borderRadius: 8, padding: 14 }}>
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
// Tab: Mood Trends
// ---------------------------------------------------------------------------

function MoodTrendsTab({ heatmap, loading }: { heatmap: HeatmapEntry[]; loading: boolean }) {
  if (loading) {
    return <div style={{ color: SUB, textAlign: 'center', padding: 60 }}>Loading mood data…</div>;
  }

  const days = buildHeatmapDays(heatmap);
  const chartData = days
    .filter((d) => d.mood !== null)
    .map((d) => ({ date: d.date, mood: d.mood! }));

  return (
    <div>
      {/* Line chart */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Mood Score — Last 30 Days
        </h3>
        {chartData.length < 2 ? (
          <div style={{ color: SUB, textAlign: 'center', padding: 40 }}>
            Not enough data to display trend chart (need at least 2 check-ins).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
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
                type="monotone"
                dataKey="mood"
                stroke={PRIMARY}
                strokeWidth={2}
                dot={{ r: 4, fill: PRIMARY, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: PRIMARY }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 30-day heatmap grid */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          30-Day Activity Grid
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.date}${d.mood !== null ? `: Mood ${d.mood}` : ': No entry'}${d.has_safety_flag ? ' ⚠️' : ''}`}
              style={{
                aspectRatio: '1',
                borderRadius: 4,
                background: d.mood !== null ? moodColor(d.mood) : '#1e2535',
                border: d.has_safety_flag ? '2px solid #d62828' : '1px solid transparent',
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: SUB }}>
          <span>Low</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 3, 5, 7, 9, 10].map((v) => (
              <div key={v} style={{ width: 14, height: 14, borderRadius: 2, background: moodColor(v) }} />
            ))}
          </div>
          <span>High</span>
          <span style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 14, borderRadius: 2, background: '#1e2535', border: '1px solid #4a5568', display: 'inline-block' }} />
            No entry
          </span>
          <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 14, borderRadius: 2, background: '#1e2535', border: '2px solid #d62828', display: 'inline-block' }} />
            Safety flag
          </span>
        </div>
      </div>
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
    return <div style={{ color: SUB, textAlign: 'center', padding: 60 }}>Loading journal entries…</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📓</div>
        <div style={{ color: TEXT, fontWeight: 600 }}>No shared journal entries</div>
        <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>
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
          <div
            key={e.id}
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 12 }}
          >
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
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, color: SUB, fontWeight: 600, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Add Clinical Note
        </h3>
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
        <div style={{ color: SUB, textAlign: 'center', padding: 40 }}>Loading notes…</div>
      ) : notes.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ color: TEXT, fontWeight: 600 }}>No clinical notes yet</div>
          <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>Add the first note above.</div>
        </div>
      ) : (
        <>
          {notes.map((n) => (
            <div key={n.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
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
    return <div style={{ color: SUB, textAlign: 'center', padding: 60 }}>Loading alerts…</div>;
  }

  if (alerts.length === 0) {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <div style={{ color: TEXT, fontWeight: 600 }}>No alerts</div>
        <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>This patient has no clinical alerts.</div>
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
                  <ActionBtn label="Resolve" color="#6a994e" disabled={isBusy} onClick={() => void act(a.id, 'resolve')} />
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

  // -- Load patient + care team
  const fetchPatient = useCallback(async () => {
    if (!token || !patientId) return;
    setPatientLoading(true);
    try {
      const [p, ct] = await Promise.all([
        api.get<Patient>(`/patients/${patientId}`, token),
        api.get<CareTeamMember[]>(`/patients/${patientId}/care-team`, token),
      ]);
      setPatient(p);
      setCareTeam(ct);
    } catch (e) {
      console.error('[patient-detail] load error', e);
    } finally {
      setPatientLoading(false);
    }
  }, [token, patientId]);

  useEffect(() => { void fetchPatient(); }, [fetchPatient]);

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

  // Load tab data when tab is active (also re-fires when page deps change)
  useEffect(() => { if (tab === 'trends') void fetchHeatmap(); }, [tab, fetchHeatmap]);
  useEffect(() => { if (tab === 'journal') void fetchJournal(); }, [tab, fetchJournal]);
  useEffect(() => { if (tab === 'notes') void fetchNotes(); }, [tab, fetchNotes]);
  useEffect(() => { if (tab === 'alerts') void fetchAlerts(); }, [tab, fetchAlerts]);

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

  const name = patient ? `${patient.first_name} ${patient.last_name}` : '…';
  const statusColor = patient ? (STATUS_COLOR[patient.status] ?? '#4a5568') : SUB;

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'trends', label: 'Mood Trends' },
    { key: 'journal', label: 'Journal' },
    { key: 'notes', label: 'Notes' },
    { key: 'alerts', label: alertsTotal > 0 ? `Alerts (${alertsTotal})` : 'Alerts' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'Figtree, system-ui, sans-serif' }}>
      {/* Global header */}
      <header style={{ background: CARD, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${BORDER}` }}>
        <h1
          onClick={() => navigate('/dashboard')}
          style={{ fontFamily: 'Fraunces, serif', color: PRIMARY, fontSize: 22, margin: 0, cursor: 'pointer' }}
        >
          MindLog
        </h1>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
          <a href="/dashboard" style={{ color: SUB, textDecoration: 'none', fontSize: 14 }}>Dashboard</a>
          <a href="/alerts" style={{ color: SUB, textDecoration: 'none', fontSize: 14 }}>Alerts</a>
        </nav>
      </header>

      {/* Patient sub-header */}
      <div style={{ background: CARD, padding: '16px 32px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: SUB, cursor: 'pointer', fontSize: 13, padding: 0 }}
          >
            ← Back
          </button>
          {patientLoading ? (
            <span style={{ color: SUB }}>Loading…</span>
          ) : patient ? (
            <>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>
                {name}
                {patient.preferred_name && patient.preferred_name !== patient.first_name && (
                  <span style={{ color: SUB, fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                    "{patient.preferred_name}"
                  </span>
                )}
              </h2>
              <span style={{ fontSize: 12, color: SUB }}>MRN {patient.mrn}</span>
              <Badge label={patient.status} color={statusColor} />
              {patient.risk_level && (
                <Badge label={`${patient.risk_level} risk`} color={RISK_COLOR[patient.risk_level] ?? SUB} />
              )}
            </>
          ) : (
            <span style={{ color: '#d62828' }}>Patient not found</span>
          )}
        </div>
      </div>

      {/* Crisis banner */}
      <div style={{
        background: '#1a0a0a', borderBottom: '1px solid #4a1010',
        padding: '7px 32px', fontSize: 12, color: '#fc8181',
      }}>
        🚨 Patient in crisis? Call 988 · Text HOME to 741741 · Veterans: 988 press 1
      </div>

      {/* Tab bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: 'none', border: 'none', padding: '13px 20px',
                fontSize: 14, fontWeight: tab === key ? 600 : 400,
                color: tab === key ? PRIMARY : SUB,
                borderBottom: `2px solid ${tab === key ? PRIMARY : 'transparent'}`,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <main style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
        {!patient && !patientLoading ? (
          <div style={{ textAlign: 'center', color: SUB, padding: 60 }}>
            Patient not found or you don't have access.
          </div>
        ) : tab === 'overview' && patient ? (
          <OverviewTab
            patient={patient}
            careTeam={careTeam}
            patientId={patientId!}
            navigate={navigate}
          />
        ) : tab === 'trends' ? (
          <MoodTrendsTab heatmap={heatmap} loading={heatmapLoading} />
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
        ) : null}
      </main>
    </div>
  );
}
