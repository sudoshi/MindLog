// =============================================================================
// MindLog Web — All Patients page (new — matches prototype patients list view)
// Filter chips + sortable table with risk badges, mood, streak, last check-in.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { InvitePatientModal } from '../components/InvitePatientModal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingInvite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
  resend_count: number;
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
  todays_submitted_at: string | null;
  unacknowledged_alert_count: number;
  highest_alert_severity: 'critical' | 'warning' | 'info' | null;
  last_checkin_at?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function moodVar(v: number | null): string {
  if (!v) return 'rgba(255,255,255,0.08)';
  return `var(--m${Math.max(1, Math.min(10, Math.round(v)))})`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  const days = Math.floor(d / 86400);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };

type FilterType = 'all' | 'crisis' | 'high' | 'not-logged' | 'streak';
type SortType = 'risk' | 'mood' | 'streak' | 'last-checkin' | 'name';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterChip({
  label, active, variant, onClick, testId,
}: {
  label: string;
  active: boolean;
  variant?: 'critical';
  onClick: () => void;
  testId?: string;
}) {
  return (
    <div
      className={`filter-chip${active ? ' active' : ''}${variant ? ` ${variant}` : ''}`}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </div>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span style={{ color: 'var(--ink-soft)' }}>—</span>;
  const cls = `badge badge-risk-${level}`;
  return <span className={cls}>{level}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls = `badge badge-${status}`;
  return <span className={cls}>{status}</span>;
}

function AlertBadge({ count, severity }: { count: number; severity: string | null }) {
  if (count === 0) return <span style={{ color: 'var(--ink-soft)' }}>—</span>;
  const color =
    severity === 'critical' ? 'var(--critical)' :
    severity === 'warning'  ? 'var(--warning)'  : 'var(--info)';
  const bg =
    severity === 'critical' ? 'var(--critical-bg)' :
    severity === 'warning'  ? 'var(--warning-bg)'  : 'var(--info-bg)';
  return (
    <span style={{
      background: bg, color, borderRadius: 'var(--r-xs)',
      padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {count}
    </span>
  );
}

function InviteActions({
  invite, token, onResent, onCancelled,
}: {
  invite: PendingInvite;
  token: string;
  onResent: () => void;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'resend' | 'cancel' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleResend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('resend');
    try {
      await api.post(`/invites/${invite.id}/resend`, {}, token);
      onResent();
    } catch { /* ignore */ }
    setLoading(null);
    setOpen(false);
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('cancel');
    try {
      await api.delete(`/invites/${invite.id}`, token);
      onCancelled();
    } catch { /* ignore */ }
    setLoading(null);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: 'rgba(255,190,50,0.12)', color: 'var(--warning)',
          borderRadius: 'var(--r-xs)', padding: '2px 8px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(255,190,50,0.3)',
        }}
      >
        ⏳ Pending
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          zIndex: 200, minWidth: 140, overflow: 'hidden',
        }}>
          <button
            onClick={(e) => void handleResend(e)}
            disabled={loading !== null || invite.resend_count >= 3}
            style={{
              display: 'block', width: '100%', padding: '9px 14px',
              background: 'none', border: 'none', textAlign: 'left',
              color: invite.resend_count >= 3 ? 'var(--ink-ghost)' : 'var(--ink)',
              fontSize: 13, cursor: invite.resend_count >= 3 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading === 'resend' ? 'Sending…' : `Resend (${invite.resend_count}/3)`}
          </button>
          <button
            onClick={(e) => void handleCancel(e)}
            disabled={loading !== null}
            style={{
              display: 'block', width: '100%', padding: '9px 14px',
              background: 'none', border: 'none', textAlign: 'left',
              borderTop: '1px solid var(--border)',
              color: 'var(--critical)', fontSize: 13, cursor: 'pointer',
            }}
          >
            {loading === 'cancel' ? 'Cancelling…' : 'Cancel Invite'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PatientsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('q') ?? '';

  const [rows, setRows] = useState<CaseloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('risk');
  const [search, setSearch] = useState(initialSearch);

  // Invite state
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteToast, setInviteToast] = useState('');

  // Sync URL ?q= param to search state (topbar search navigates here without remount)
  useEffect(() => {
    setSearch(searchParams.get('q') ?? '');
  }, [searchParams]);

  const fetchCaseload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: CaseloadRow[] } | CaseloadRow[]>(
        '/clinicians/caseload', token,
      );
      const data = Array.isArray(res) ? res : ((res as { data?: CaseloadRow[] }).data ?? []);
      setRows(data);
    } catch (e) {
      console.error('[patients] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchInvites = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<{ success: boolean; data: PendingInvite[] }>(
        '/invites', token,
      );
      const data = (res as { data?: PendingInvite[] }).data ?? [];
      setPendingInvites(data.filter((i) => i.status === 'pending'));
    } catch {
      // non-critical
    }
  }, [token]);

  useEffect(() => { void fetchCaseload(); }, [fetchCaseload]);
  useEffect(() => { void fetchInvites(); }, [fetchInvites]);

  // Compute filter counts
  const crisisCount = rows.filter((r) => r.status === 'crisis').length;
  const highCount = rows.filter((r) => r.risk_level === 'high').length;
  const notLoggedCount = rows.filter((r) => r.todays_submitted_at === null).length;
  const streakCount = rows.filter((r) => r.tracking_streak >= 7).length;

  // Apply filter
  const filtered = rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.first_name.toLowerCase().includes(q) &&
        !r.last_name.toLowerCase().includes(q) &&
        !r.mrn.toLowerCase().includes(q)
      ) return false;
    }
    if (filter === 'crisis') return r.status === 'crisis';
    if (filter === 'high') return r.risk_level === 'high' || r.risk_level === 'critical';
    if (filter === 'not-logged') return r.todays_submitted_at === null;
    if (filter === 'streak') return r.tracking_streak >= 7;
    return true;
  });

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'risk') {
      const ra = RISK_ORDER[a.risk_level ?? 'low'] ?? 4;
      const rb = RISK_ORDER[b.risk_level ?? 'low'] ?? 4;
      if (ra !== rb) return ra - rb;
      // Secondary: crisis status
      if (a.status === 'crisis' && b.status !== 'crisis') return -1;
      if (b.status === 'crisis' && a.status !== 'crisis') return 1;
      return b.unacknowledged_alert_count - a.unacknowledged_alert_count;
    }
    if (sort === 'mood') {
      // Worst mood first (null = not logged → bottom)
      if (a.todays_mood === null && b.todays_mood !== null) return 1;
      if (b.todays_mood === null && a.todays_mood !== null) return -1;
      return (a.todays_mood ?? 0) - (b.todays_mood ?? 0);
    }
    if (sort === 'streak') return b.tracking_streak - a.tracking_streak;
    if (sort === 'last-checkin') {
      const da = a.todays_submitted_at ? new Date(a.todays_submitted_at).getTime() : 0;
      const db = b.todays_submitted_at ? new Date(b.todays_submitted_at).getTime() : 0;
      return db - da;
    }
    if (sort === 'name') {
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    }
    return 0;
  });

  return (
    <div className="view" data-testid="patients-page">
      {/* Invite toast */}
      {inviteToast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 999,
          background: 'var(--safe)', color: '#0a0e1a',
          borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {inviteToast}
        </div>
      )}

      {/* Invite Patient Modal */}
      {showInviteModal && token && (
        <InvitePatientModal
          token={token}
          onClose={() => setShowInviteModal(false)}
          onSuccess={(email) => {
            setShowInviteModal(false);
            setInviteToast(`Invite sent to ${email}`);
            setTimeout(() => setInviteToast(''), 3500);
            void fetchInvites();
          }}
        />
      )}

      {/* Page header */}
      <div style={{ padding: '0 24px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }} data-testid="patient-count">
          {rows.length} patients on your caseload
          {pendingInvites.length > 0 && (
            <span style={{ marginLeft: 10, color: 'var(--warning)' }}>
              · {pendingInvites.length} pending invite{pendingInvites.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          data-testid="invite-patient-btn"
          style={{
            background: 'var(--safe)', color: '#0a0e1a',
            border: 'none', borderRadius: 8, padding: '7px 16px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Invite Patient
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '0 24px' }}>
        <div className="filter-bar" data-testid="filter-bar">
          <FilterChip
            label={`All (${rows.length})`}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            testId="filter-all"
          />
          <FilterChip
            label={`⚠ Crisis (${crisisCount})`}
            variant="critical"
            active={filter === 'crisis'}
            onClick={() => setFilter(filter === 'crisis' ? 'all' : 'crisis')}
            testId="filter-crisis"
          />
          <FilterChip
            label={`High risk (${highCount})`}
            active={filter === 'high'}
            onClick={() => setFilter(filter === 'high' ? 'all' : 'high')}
            testId="filter-high"
          />
          <FilterChip
            label={`Not logged (${notLoggedCount})`}
            active={filter === 'not-logged'}
            onClick={() => setFilter(filter === 'not-logged' ? 'all' : 'not-logged')}
            testId="filter-not-logged"
          />
          <FilterChip
            label={`🔥 Streak 7d+ (${streakCount})`}
            active={filter === 'streak'}
            onClick={() => setFilter(filter === 'streak' ? 'all' : 'streak')}
            testId="filter-streak"
          />
          <div className="filter-spacer" />
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name or MRN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ width: 200, fontSize: 12, padding: '5px 10px' }}
            data-testid="patient-search"
          />
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortType)}
            data-testid="patient-sort"
          >
            <option value="risk">Sort: Risk level</option>
            <option value="mood">Sort: Mood (worst first)</option>
            <option value="streak">Sort: Streak</option>
            <option value="last-checkin">Sort: Last check-in</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </div>

      {/* Pending invites table */}
      {pendingInvites.length > 0 && (
        <div style={{ padding: '0 24px 8px' }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 10 }}>
              ⏳ Pending Invites
            </div>
            <table className="patient-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Sent</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => (
                  <tr key={inv.id} onClick={(e) => e.stopPropagation()}>
                    <td style={{ fontSize: 13, color: 'var(--ink)' }}>{inv.email}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {new Date(inv.expires_at) < new Date()
                        ? <span style={{ color: 'var(--critical)' }}>Expired</span>
                        : fmtDate(inv.expires_at)}
                    </td>
                    <td>
                      {token && (
                        <InviteActions
                          invite={inv}
                          token={token}
                          onResent={() => {
                            setInviteToast(`Invite resent to ${inv.email}`);
                            setTimeout(() => setInviteToast(''), 3000);
                            void fetchInvites();
                          }}
                          onCancelled={() => void fetchInvites()}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        {loading ? (
          <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 48 }}>
            Loading patients…
          </div>
        ) : sorted.length === 0 ? (
          <div className="panel">
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">No patients match</div>
              Try a different filter or search term.
            </div>
          </div>
        ) : (
          <table className="patient-table" data-testid="patient-table">
            <thead>
              <tr>
                <th onClick={() => setSort('name')}>Patient {sort === 'name' ? '↕' : ''}</th>
                <th onClick={() => setSort('risk')}>Risk {sort === 'risk' ? '↕' : ''}</th>
                <th>Status</th>
                <th onClick={() => setSort('mood')}>Today's Mood {sort === 'mood' ? '↕' : ''}</th>
                <th onClick={() => setSort('streak')}>Streak {sort === 'streak' ? '↕' : ''}</th>
                <th onClick={() => setSort('last-checkin')}>Last Check-in {sort === 'last-checkin' ? '↕' : ''}</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => (
                <tr
                  key={`${row.patient_id}-${idx}`}
                  className={row.status === 'crisis' ? 'crisis-row' : ''}
                  onClick={() => navigate(`/patients/${row.patient_id}`)}
                  data-testid={`patient-row-${row.patient_id}`}
                >
                  {/* Patient name + MRN */}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                      {row.last_name}, {row.first_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {row.mrn}
                    </div>
                  </td>

                  {/* Risk badge */}
                  <td><RiskBadge level={row.risk_level} /></td>

                  {/* Status badge */}
                  <td><StatusBadge status={row.status} /></td>

                  {/* Today's mood */}
                  <td>
                    {row.todays_mood != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          className="mood-dot"
                          style={{ background: moodVar(row.todays_mood), width: 12, height: 12 }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 15, color: moodVar(row.todays_mood) }}>
                          {row.todays_mood}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>—</span>
                    )}
                  </td>

                  {/* Streak */}
                  <td style={{ fontSize: 13, color: row.tracking_streak >= 7 ? 'var(--warning)' : 'var(--ink-soft)' }}>
                    {row.tracking_streak > 0 ? `🔥 ${row.tracking_streak}d` : '—'}
                  </td>

                  {/* Last check-in */}
                  <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {row.todays_submitted_at
                      ? fmtDate(row.todays_submitted_at)
                      : (row.last_checkin_at ? fmtDate(row.last_checkin_at) : '—')}
                  </td>

                  {/* Alert count */}
                  <td>
                    <AlertBadge
                      count={row.unacknowledged_alert_count}
                      severity={row.highest_alert_severity}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Showing count */}
        {!loading && sorted.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
            Showing {sorted.length} of {rows.length} patients
          </div>
        )}
      </div>
    </div>
  );
}
