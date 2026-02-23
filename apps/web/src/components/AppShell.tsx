// =============================================================================
// MindLog Web — AppShell layout
// 220px sidebar + 56px topbar + scrollable content area.
// Matches prototype: COPEApp-Prototype/mindlog-clinician.html
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAlertSocket } from '../hooks/useAlertSocket.js';
import { useAuthStore, authActions } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { API_PREFIX } from '@mindlog/shared';
import { InvitePatientModal } from './InvitePatientModal.js';
import { GlobalSearch } from './GlobalSearch.js';
import { QuickNotePanel } from './QuickNotePanel.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClinicianProfile {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  clinician_role: string;
  email: string;
}

interface SnapshotCounts {
  critical_alerts_count: number;
  total_patients: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    psychiatrist: 'Psychiatry',
    psychologist: 'Psychology',
    nurse: 'Psychiatric Nursing',
    care_coordinator: 'Care Coordination',
    admin: 'Administration',
  };
  return labels[role] ?? role;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// NavItem sub-component
// ---------------------------------------------------------------------------

function NavItem({
  icon, label, path, badge, badgeVariant, onClick,
}: {
  icon: string;
  label: string;
  path: string;
  badge?: number;
  badgeVariant?: 'critical' | 'warning';
  onClick: () => void;
}) {
  const location = useLocation();
  const isActive = location.pathname === path ||
    (path === '/patients' && location.pathname.startsWith('/patients/'));

  return (
    <div
      className={`nav-item${isActive ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`nav-badge${badgeVariant ? ` ${badgeVariant}` : ''}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AppShell
// ---------------------------------------------------------------------------

export function AppShell() {
  const token = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const tokenExpiresAt = useAuthStore((s) => s.tokenExpiresAt);
  const role = useAuthStore((s) => s.role);
  const navigate = useNavigate();
  const location = useLocation();

  const [clinician, setClinician] = useState<ClinicianProfile | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotCounts | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [criticalCount, setCriticalCount] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteToast, setInviteToast] = useState('');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Fetch clinician profile for sidebar badge
  useEffect(() => {
    if (!token) return;
    void api.get<ClinicianProfile>('/clinicians/me', token)
      .then((res) => setClinician(res))
      .catch(() => { /* silent — sidebar badge will show placeholder */ });
  }, [token]);

  // Fetch snapshot for alert counts in nav badge
  const fetchSnapshot = useCallback(async () => {
    if (!token) return;
    try {
      const snap = await api.get<SnapshotCounts>('/clinicians/snapshot', token);
      setSnapshot(snap);
      setCriticalCount(snap.critical_alerts_count ?? 0);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { void fetchSnapshot(); }, [fetchSnapshot]);

  // Proactive token refresh — schedules a refresh 2 min before the JWT expires.
  // When the access token changes, useAlertSocket reconnects automatically.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!refreshToken || !tokenExpiresAt) return;
    const REFRESH_BEFORE_MS = 2 * 60 * 1000; // 2 min
    const delay = Math.max(0, (tokenExpiresAt * 1000) - Date.now() - REFRESH_BEFORE_MS);
    refreshTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`${API_PREFIX}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (res.ok) {
            const json = (await res.json()) as { data: { access_token: string; refresh_token: string } };
            authActions.setTokens(json.data.access_token, json.data.refresh_token);
          } else {
            // Refresh failed — session is over
            authActions.logout();
            navigate('/login');
          }
        } catch {
          /* network error — leave current token in place, will fail on next use */
        }
      })();
    }, delay);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [refreshToken, tokenExpiresAt, navigate]);

  // WebSocket for live alert counts
  const { status: ws, liveAlerts } = useAlertSocket({
    token,
    onAlert: () => {
      setCriticalCount((n) => n + 1);
      void fetchSnapshot();
    },
  });

  // Increment critical count on incoming live critical alert
  useEffect(() => {
    if (liveAlerts.length > 0) {
      const criticals = liveAlerts.filter((a) => a.severity === 'critical').length;
      if (criticals > 0) setCriticalCount((n) => n + criticals);
    }
  }, [liveAlerts]);

  const patientName = useUiStore((s) => s.patientName);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onOpenSearch: () => setShowGlobalSearch(true),
    onOpenQuickNote: () => setShowQuickNote(true),
    onShowHelp: () => setShowShortcutsHelp(true),
  });

  // Topbar dynamic title based on route
  const topbarConfig: Record<string, { title: string; subtitle: string }> = {
    '/dashboard': { title: 'Population Overview', subtitle: `${formatDate()} · ${snapshot?.total_patients ?? '…'} patients` },
    '/patients': { title: 'All Patients', subtitle: 'Your caseload — filter and sort' },
    '/alerts': { title: 'Clinical Alerts', subtitle: 'Review and action patient alerts' },
    '/trends': { title: 'Population Trends', subtitle: 'Aggregate outcomes across your caseload' },
    '/reports': { title: 'Clinical Reports', subtitle: 'Generate PDF reports for patients' },
    '/admin': { title: 'Admin Panel', subtitle: 'System administration and configuration' },
    '/cohort': { title: 'Cohort Builder', subtitle: 'Build research populations and export de-identified data' },
  };

  const isPatientDetail = location.pathname.startsWith('/patients/') && location.pathname !== '/patients';
  const currentTopbar = isPatientDetail
    ? { title: patientName ?? 'Patient Detail', subtitle: patientName ? 'Clinical overview and entries' : 'Loading…' }
    : (topbarConfig[location.pathname] ?? { title: 'MindLog Clinical', subtitle: '' });

  // Search handler
  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/patients?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  // WS status color
  const wsColor = ws === 'connected' ? 'var(--safe)' : ws === 'connecting' ? 'var(--warning)' : 'var(--critical)';

  return (
    <div className="app" data-testid="app-shell">
      {/* ════════ SIDEBAR ════════ */}
      <aside className="sidebar" data-testid="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-name">Mind<em>Log</em> Clinical</div>
          <div className="brand-role">Population Health Dashboard</div>
        </div>

        {/* Clinician badge */}
        <div className="clinician-badge">
          <div className="clinician-avatar">
            {clinician ? initials(clinician.first_name, clinician.last_name) : '??'}
          </div>
          <div>
            <div className="clinician-name">
              {clinician
                ? `${clinician.title ? clinician.title + ' ' : ''}${clinician.first_name} ${clinician.last_name}`
                : 'Loading…'}
            </div>
            <div className="clinician-dept">
              {clinician ? roleLabel(clinician.clinician_role) : ''}
            </div>
          </div>
        </div>

        {/* Nav: Overview */}
        <div className="nav-section">
          <div className="nav-section-label">Overview</div>
          <NavItem icon="🌐" label="Population" path="/dashboard" onClick={() => navigate('/dashboard')} />
          <NavItem
            icon="👥" label="All Patients" path="/patients"
            badge={snapshot?.total_patients ?? 0}
            badgeVariant="warning"
            onClick={() => navigate('/patients')}
          />
          <NavItem
            icon="🔔" label="Alerts" path="/alerts"
            badge={criticalCount}
            badgeVariant="critical"
            onClick={() => { setCriticalCount(0); navigate('/alerts'); }}
          />
        </div>

        {/* Nav: Clinical Tools */}
        <div className="nav-section">
          <div className="nav-section-label">Clinical Tools</div>
          <NavItem icon="📈" label="Population Trends" path="/trends" onClick={() => navigate('/trends')} />
          <NavItem icon="📄" label="Reports" path="/reports" onClick={() => navigate('/reports')} />
          {role === 'admin' && (
            <NavItem icon="🔬" label="Cohort Builder" path="/cohort" onClick={() => navigate('/cohort')} />
          )}
        </div>

        {/* Nav: Actions */}
        <div className="nav-section">
          <div className="nav-section-label">Actions</div>
          <div
            className="nav-item action-btn"
            onClick={() => setShowInviteModal(true)}
          >
            <span className="nav-icon">➕</span>
            Invite Patient
          </div>
        </div>

        {/* Nav: Admin (only for admin users) */}
        {role === 'admin' && (
          <div className="nav-section">
            <div className="nav-section-label">Administration</div>
            <NavItem
              icon="⚙️"
              label="Admin Panel"
              path="/admin"
              onClick={() => navigate('/admin')}
            />
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-btn" onClick={() => void authActions.logout()}>
            ⏻ Sign Out
          </button>
        </div>
      </aside>

      {/* ════════ MAIN ════════ */}
      <div className="main">
        {/* Top bar */}
        <div className="topbar" data-testid="topbar">
          <div className="topbar-title-group">
            <div className="topbar-title">{currentTopbar.title}</div>
            {currentTopbar.subtitle && (
              <div className="topbar-subtitle">{currentTopbar.subtitle}</div>
            )}
          </div>
          <div className="topbar-spacer" />
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search patients…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
            />
          </div>
          {criticalCount > 0 && (
            <button
              className="topbar-btn primary"
              onClick={() => { setCriticalCount(0); navigate('/alerts'); }}
            >
              <div className="alert-dot" />
              {criticalCount} Critical Alert{criticalCount !== 1 ? 's' : ''}
            </button>
          )}
          <button
            className="topbar-btn"
            title="Quick note (N)"
            onClick={() => setShowQuickNote(true)}
            style={{ cursor: 'pointer' }}
            data-testid="quick-note-btn"
          >
            <span style={{ fontSize: 13 }}>✏ Note</span>
          </button>
          <button
            className="topbar-btn"
            title="Keyboard shortcuts (?)"
            onClick={() => setShowShortcutsHelp(true)}
            style={{ cursor: 'pointer', fontSize: 13 }}
            data-testid="shortcuts-help-btn"
          >
            ?
          </button>
          <div
            className="topbar-btn"
            title={`WebSocket: ${ws}`}
            style={{ gap: 8, cursor: 'default' }}
          >
            <span className="ws-dot" style={{ background: wsColor }} />
            <span style={{ color: wsColor, fontSize: 11 }}>
              {ws === 'connected' ? 'Live' : ws === 'connecting' ? 'Connecting…' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Content area — child route renders here */}
        <div className="content">
          <Outlet />
        </div>
      </div>

      {/* Invite Patient Modal */}
      {showInviteModal && token && (
        <InvitePatientModal
          token={token}
          onClose={() => setShowInviteModal(false)}
          onSuccess={(email) => {
            setShowInviteModal(false);
            setInviteToast(`Invite sent to ${email}`);
            setTimeout(() => setInviteToast(''), 4000);
          }}
        />
      )}

      {/* Invite success toast */}
      {inviteToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--safe-bg)',
          border: '1px solid var(--safe)',
          color: 'var(--safe)',
          padding: '12px 20px',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          zIndex: 1100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          ✓ {inviteToast}
        </div>
      )}

      {/* Global Search overlay */}
      <GlobalSearch
        open={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
      />

      {/* Quick Note panel */}
      <QuickNotePanel
        open={showQuickNote}
        onClose={() => setShowQuickNote(false)}
      />

      {/* Keyboard shortcuts help overlay */}
      {showShortcutsHelp && (
        <>
          <div
            onClick={() => setShowShortcutsHelp(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)', zIndex: 1200,
            }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 'min(420px, 90vw)', zIndex: 1201,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} data-testid="shortcuts-help-overlay">
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Keyboard Shortcuts</div>
              <button
                onClick={() => setShowShortcutsHelp(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '8px 0 16px' }}>
              {([
                ['/', 'Open global search'],
                ['⌘K', 'Open global search'],
                ['N', 'Add quick note'],
                ['A', 'Go to Alerts'],
                ['P', 'Go to Patients'],
                ['?', 'Show this help'],
                ['Esc', 'Close any modal'],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 20px',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-mid)' }}>{desc}</span>
                  <kbd style={{
                    background: 'var(--glass-02)', border: '1px solid var(--border)',
                    borderRadius: 5, padding: '2px 8px', fontSize: 11,
                    fontFamily: 'monospace', color: 'var(--ink)',
                  }}>
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
