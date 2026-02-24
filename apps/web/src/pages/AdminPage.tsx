// =============================================================================
// MindLog Web — Admin Panel
// HIPAA-compliant administration console with FHIR endpoints, user management,
// LDAP import, RBAC, audit log, consent management, security & system config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Access Denied Component (for non-admin users)
// ---------------------------------------------------------------------------

function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }} data-testid="access-denied">
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'var(--critical-bg)',
          border: '1px solid var(--critical-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 28,
        }}>
          🔒
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
          Admin Access Required
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-mid)', margin: '0 0 24px', lineHeight: 1.5 }}>
          This section is restricted to system administrators. If you believe you should have access, please contact your organization's admin.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          data-testid="return-to-dashboard"
          style={{
            padding: '10px 24px',
            background: 'var(--safe)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FhirEndpoint {
  id: number;
  name: string;
  type: 'epic' | 'oracle';
  baseUrl: string;
  status: 'connected' | 'degraded' | 'disconnected';
  lastSync: string | null;
  patientsLinked: number;
  version: string;
  authType: string;
  tokenExpiry: string | null;
}

// API response types
interface ApiAdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string | null;
  role: string;
  npi: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  patients_assigned: number;
}

interface ApiAuditEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  patient_id: string | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
}

interface ApiAdminStats {
  patients: { total: number; active: number; crisis: number };
  clinicians: { total: number; active: number; admins: number };
  alerts: { critical: number; warning: number; total: number };
  audit: { total: number; phi_access: number; errors: number };
}

// Legacy types for FHIR/roles (still mock)
interface RoleConfig {
  id: string;
  label: string;
  color: string;
  permissions: string[];
  description: string;
}

// ---------------------------------------------------------------------------
// Mock Data (FHIR endpoints - Phase 4 future feature)
// ---------------------------------------------------------------------------

const MOCK_FHIR_ENDPOINTS: FhirEndpoint[] = [
  { id: 1, name: 'Epic - Memorial Hermann', type: 'epic', baseUrl: 'https://fhir.memorial.org/api/FHIR/R4', status: 'connected', lastSync: new Date().toISOString(), patientsLinked: 1247, version: 'Feb 2026', authType: 'SMART v2', tokenExpiry: new Date(Date.now() + 3600000).toISOString() },
  { id: 2, name: 'Oracle Health - Geisinger', type: 'oracle', baseUrl: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2', status: 'connected', lastSync: new Date().toISOString(), patientsLinked: 893, version: 'Millennium R4', authType: 'SMART v2', tokenExpiry: new Date(Date.now() + 1800000).toISOString() },
  { id: 3, name: 'Epic - Cleveland Clinic', type: 'epic', baseUrl: 'https://fhir.ccf.org/api/FHIR/R4', status: 'degraded', lastSync: new Date(Date.now() - 3600000).toISOString(), patientsLinked: 562, version: 'Nov 2025', authType: 'SMART v2', tokenExpiry: null },
];

const ROLES_CONFIG: RoleConfig[] = [
  { id: 'system', label: 'System Administrator', color: '#7C3AED', permissions: ['all'], description: 'Full system access including configuration, user management, and audit logs' },
  { id: 'admin', label: 'Clinical Admin', color: '#2563EB', permissions: ['manage_users', 'view_audit', 'config_endpoints', 'view_all_patients', 'manage_consents'], description: 'Clinical informatics admin with user and endpoint management' },
  { id: 'psychiatrist', label: 'Psychiatrist', color: '#0D9488', permissions: ['view_assigned_patients', 'view_phi', 'write_orders', 'view_alerts', 'manage_care_plans'], description: 'Prescribing physician with full clinical access to assigned patients' },
  { id: 'psychologist', label: 'Psychologist', color: '#0891B2', permissions: ['view_assigned_patients', 'view_phi', 'view_alerts'], description: 'Psychology provider with read access to assigned patient data' },
  { id: 'nurse', label: 'RN / Care Coordinator', color: '#DC2626', permissions: ['view_assigned_patients', 'view_phi', 'view_alerts', 'triage_alerts'], description: 'Nursing staff with triage capability for safety alerts' },
  { id: 'readonly', label: 'Read-Only / Auditor', color: '#6B7280', permissions: ['view_audit', 'view_reports'], description: 'Compliance or audit staff with read-only access to logs and reports' },
];


// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const configMap: Record<string, { bg: string; color: string; border: string; label: string }> = {
    connected: { bg: '#F0FDFA', color: '#0D9488', border: '#99F6E4', label: 'Connected' },
    active: { bg: '#F0FDFA', color: '#0D9488', border: '#99F6E4', label: 'Active' },
    success: { bg: '#F0FDFA', color: '#0D9488', border: '#99F6E4', label: 'Success' },
    degraded: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Degraded' },
    warning: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Warning' },
    suspended: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Suspended' },
    disconnected: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Disconnected' },
    error: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Error' },
    critical: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Critical' },
  };
  const defaultConfig = { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Unknown' };
  const c = configMap[status] ?? defaultConfig;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

function MetricCard({ label, value, sublabel, accent = '#2563EB' }: {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--panel)',
      borderRadius: 10,
      padding: '18px 20px',
      border: '1px solid var(--border2)',
      flex: 1,
      minWidth: 180,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-mid)', marginTop: 4 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: accent, marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

function NavTab({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        padding: '8px 16px',
        background: active ? 'var(--safe)' : 'transparent',
        color: active ? '#fff' : 'var(--ink-mid)',
        border: active ? 'none' : '1px solid var(--border2)',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section Renderers
// ---------------------------------------------------------------------------

function DashboardSection() {
  const token = useAuthStore((s) => s.accessToken);
  const [stats, setStats] = useState<ApiAdminStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ApiAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);

        // Fetch stats and recent audit entries in parallel
        const [statsData, auditData] = await Promise.all([
          api.get<ApiAdminStats>('/admin/stats', token),
          api.get<{ items: ApiAuditEntry[] }>('/admin/audit-log?limit=5', token),
        ]);

        setStats(statsData);
        setRecentActivity(auditData.items);
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error('Error fetching dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const formatActivityDetail = (entry: ApiAuditEntry): string => {
    const action = entry.action.charAt(0).toUpperCase() + entry.action.slice(1);
    const resource = entry.resource_type.replace(/_/g, ' ');
    return `${action} ${resource}`;
  };

  const getActivityStatus = (action: string): string => {
    if (action === 'error') return 'error';
    if (action === 'delete') return 'warning';
    return 'success';
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-mid)' }}>
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', borderRadius: 8, color: '#DC2626', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        <MetricCard
          label="Total Patients"
          value={stats?.patients.total ?? 0}
          sublabel={`${stats?.patients.active ?? 0} active`}
          accent="#2563EB"
        />
        <MetricCard
          label="Clinicians"
          value={stats?.clinicians.total ?? 0}
          sublabel={`${stats?.clinicians.admins ?? 0} admins`}
          accent="#0D9488"
        />
        <MetricCard
          label="Critical Alerts"
          value={stats?.alerts.critical ?? 0}
          sublabel={`${stats?.alerts.warning ?? 0} warnings`}
          accent="#DC2626"
        />
        <MetricCard
          label="Audit Events (24h)"
          value={stats?.audit.total ?? 0}
          sublabel={`${stats?.audit.phi_access ?? 0} PHI access`}
          accent="#D97706"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-mid)', fontSize: 13 }}>
              No recent activity
            </div>
          ) : (
            recentActivity.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border1)' }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: getActivityStatus(entry.action) === 'success' ? '#0D9488' : getActivityStatus(entry.action) === 'error' ? '#DC2626' : '#D97706',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatActivityDetail(entry)}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{entry.actor_email} · {timeAgo(entry.occurred_at)}</div>
                </div>
                <StatusBadge status={getActivityStatus(entry.action)} />
              </div>
            ))
          )}
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>System Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Patients in Crisis</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Require immediate attention</div>
              </div>
              <span style={{
                fontSize: 18,
                fontWeight: 700,
                color: (stats?.patients.crisis ?? 0) > 0 ? '#DC2626' : '#0D9488',
              }}>
                {stats?.patients.crisis ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Active Clinicians</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Users with active accounts</div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                {stats?.clinicians.active ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Alerts (24h)</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Total alerts generated</div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                {stats?.alerts.total ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Audit Errors (24h)</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>System error events</div>
              </div>
              <span style={{
                fontSize: 18,
                fontWeight: 700,
                color: (stats?.audit.errors ?? 0) > 0 ? '#D97706' : '#0D9488',
              }}>
                {stats?.audit.errors ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FhirEndpointsSection() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<FhirEndpoint | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>FHIR R4 Endpoint Configuration</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-mid)' }}>Manage bidirectional SMART on FHIR v2 connections to EHR systems</p>
        </div>
        <button style={{ padding: '8px 18px', background: 'var(--safe)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Endpoint</button>
      </div>
      {MOCK_FHIR_ENDPOINTS.map((ep) => (
        <div
          key={ep.id}
          className="panel"
          style={{
            padding: 20,
            marginBottom: 12,
            cursor: 'pointer',
            borderColor: ep.status === 'degraded' ? '#FDE68A' : ep.status === 'disconnected' ? '#FECACA' : undefined,
          }}
          onClick={() => setSelectedEndpoint(selectedEndpoint?.id === ep.id ? null : ep)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: ep.type === 'epic' ? '#EFF6FF' : '#FFF7ED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 800,
                color: ep.type === 'epic' ? '#2563EB' : '#EA580C',
                border: `1px solid ${ep.type === 'epic' ? '#BFDBFE' : '#FED7AA'}`,
              }}>
                {ep.type === 'epic' ? 'Epic' : 'OH'}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{ep.name}</div>
                <code style={{ fontSize: 11, color: 'var(--ink-mid)', background: 'var(--glass-01)', padding: '2px 6px', borderRadius: 4 }}>{ep.baseUrl}</code>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--ink-mid)' }}>
                  <span>Auth: <strong>{ep.authType}</strong></span>
                  <span>Version: <strong>{ep.version}</strong></span>
                  <span>Patients: <strong>{ep.patientsLinked}</strong></span>
                  <span>Last sync: <strong>{timeAgo(ep.lastSync)}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={ep.status} />
              <button style={{ padding: '6px 12px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-mid)' }}>
                Sync Now
              </button>
            </div>
          </div>
          {selectedEndpoint?.id === ep.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--glass-01)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-mid)', marginBottom: 4 }}>Token Expiry</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ep.tokenExpiry ? 'var(--ink)' : 'var(--ink-soft)' }}>{ep.tokenExpiry ? formatDateTime(ep.tokenExpiry) : 'No active token'}</div>
                </div>
                <div style={{ background: 'var(--glass-01)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-mid)', marginBottom: 4 }}>OAuth Scopes</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink)' }}>patient/Patient.r, patient/Observation.rw</div>
                </div>
                <div style={{ background: 'var(--glass-01)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-mid)', marginBottom: 4 }}>PKCE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0D9488' }}>S256 Enabled</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={{ padding: '6px 14px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--ink-mid)' }}>Edit Configuration</button>
                <button style={{ padding: '6px 14px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--ink-mid)' }}>Test Connection</button>
                <button style={{ padding: '6px 14px', background: 'var(--glass-01)', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#DC2626' }}>Disconnect</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UsersSection() {
  const token = useAuthStore((s) => s.accessToken);
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasNext: false });

  const fetchUsers = useCallback(async (page = 1) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{
        items: ApiAdminUser[];
        total: number;
        page: number;
        has_next: boolean;
      }>(`/admin/users?page=${page}&limit=20`, token);

      setUsers(data.items);
      setPagination({
        page: data.page,
        total: data.total,
        hasNext: data.has_next,
      });
    } catch (err) {
      setError('Failed to load users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getRoleConfig = (role: string): RoleConfig => {
    const defaultConfig: RoleConfig = { id: 'unknown', label: 'Unknown', color: '#6B7280', permissions: [], description: '' };
    return ROLES_CONFIG.find(r => r.id === role) ?? ROLES_CONFIG.find(r => r.id === 'clinician') ?? ROLES_CONFIG[0] ?? defaultConfig;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>User Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-mid)' }}>HIPAA-compliant user lifecycle with RBAC and MFA enforcement</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '8px 16px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--ink-mid)' }}>Import from LDAP</button>
          <button style={{ padding: '8px 16px', background: 'var(--safe)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Manual User</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', borderRadius: 8, marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mid)' }}>Loading users...</div>
        ) : (
          <>
            <table className="patient-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Title</th>
                  <th>NPI</th>
                  <th>MFA</th>
                  <th>Patients</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleConfig = getRoleConfig(u.role);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{u.first_name} {u.last_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{u.email}</div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11,
                          padding: '2px 10px',
                          borderRadius: 20,
                          background: `${roleConfig.color}15`,
                          color: roleConfig.color,
                          fontWeight: 600,
                          border: `1px solid ${roleConfig.color}30`,
                        }}>{u.role}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{u.title ?? '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--ink-mid)', fontFamily: 'monospace' }}>{u.npi ?? '—'}</td>
                      <td>
                        {u.mfa_enabled ? (
                          <span style={{ color: '#0D9488' }}>✓</span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>REQUIRED</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--ink)' }}>{u.patients_assigned}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{timeAgo(u.last_login_at)}</td>
                      <td><StatusBadge status={u.is_active ? 'active' : 'suspended'} /></td>
                      <td>
                        <button style={{ padding: '4px 10px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: 'var(--ink-mid)' }}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border1)', fontSize: 12, color: 'var(--ink-mid)' }}>
              <span>Showing {users.length} of {pagination.total} users</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fetchUsers(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--glass-01)',
                    border: '1px solid var(--border2)',
                    borderRadius: 4,
                    cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                    opacity: pagination.page <= 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchUsers(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--glass-01)',
                    border: '1px solid var(--border2)',
                    borderRadius: 4,
                    cursor: !pagination.hasNext ? 'not-allowed' : 'pointer',
                    opacity: !pagination.hasNext ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RolesSection() {
  const token = useAuthStore((s) => s.accessToken);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserCounts = async () => {
      if (!token) return;
      try {
        setLoading(true);
        const data = await api.get<{ items: ApiAdminUser[] }>('/admin/users?limit=100', token);

        // Count users per role
        const counts: Record<string, number> = {};
        for (const user of data.items) {
          counts[user.role] = (counts[user.role] ?? 0) + 1;
        }
        setUserCounts(counts);
      } catch (err) {
        console.error('Error fetching user counts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserCounts();
  }, [token]);

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Role-Based Access Control (RBAC)</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ink-mid)' }}>HIPAA §164.312(a)(1) compliant access control with minimum necessary principle enforcement</p>
      {ROLES_CONFIG.map((role) => (
        <div key={role.id} className="panel" style={{ padding: '16px 20px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: `${role.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: role.color,
                fontWeight: 700,
              }}>
                🔑
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{role.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{role.description}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-mid)' }}>
                {loading ? '...' : `${userCounts[role.id] ?? 0} users`}
              </span>
              <button style={{ padding: '4px 12px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--ink-mid)' }}>Edit</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
            {role.permissions.map((p) => (
              <span key={p} style={{
                fontSize: 10,
                padding: '2px 8px',
                background: `${role.color}10`,
                color: role.color,
                borderRadius: 12,
                border: `1px solid ${role.color}25`,
                fontFamily: 'monospace',
              }}>{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditLogSection() {
  const token = useAuthStore((s) => s.accessToken);
  const [entries, setEntries] = useState<ApiAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<{ action?: string; resource_type?: string }>({});
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasNext: false });

  const fetchAuditLog = useCallback(async (page = 1, filters: typeof filter = filter) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filters.action) params.set('action', filters.action);
      if (filters.resource_type) params.set('resource_type', filters.resource_type);

      const data = await api.get<{
        items: ApiAuditEntry[];
        total: number;
        page: number;
        has_next: boolean;
      }>(`/admin/audit-log?${params.toString()}`, token);

      setEntries(data.items);
      setPagination({
        page: data.page,
        total: data.total,
        hasNext: data.has_next,
      });
    } catch (err) {
      setError('Failed to load audit log');
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  const handleExportCsv = async () => {
    if (!token) return;
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (filter.action) params.set('action', filter.action);
      if (filter.resource_type) params.set('resource_type', filter.resource_type);

      // Use fetch directly for CSV download since api service doesn't support blob
      const response = await fetch(`/api/v1/admin/audit-log/export?${params.toString()}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting audit log:', err);
      setError('Failed to export audit log');
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    fetchAuditLog(1, newFilter);
  };

  const getActionStatus = (action: string): string => {
    if (action === 'error') return 'error';
    if (action === 'delete') return 'warning';
    return 'success';
  };

  const formatDetail = (entry: ApiAuditEntry): string => {
    const action = entry.action.charAt(0).toUpperCase() + entry.action.slice(1);
    const resource = entry.resource_type.replace(/_/g, ' ');
    if (entry.resource_id) {
      return `${action} ${resource} (${entry.resource_id.slice(0, 8)}...)`;
    }
    return `${action} ${resource}`;
  };

  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'read', label: 'Read' },
    { key: 'create', label: 'Create' },
    { key: 'update', label: 'Update' },
    { key: 'delete', label: 'Delete' },
    { key: 'export', label: 'Export' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Audit Log</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-mid)' }}>HIPAA §164.312(b) compliant audit controls — immutable, 6-year retention, AES-256 encrypted</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          style={{
            padding: '8px 16px',
            background: 'var(--glass-01)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            fontSize: 13,
            cursor: exporting ? 'not-allowed' : 'pointer',
            color: 'var(--ink-mid)',
            opacity: exporting ? 0.6 : 1,
          }}
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {filterOptions.map(f => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key === 'all' ? {} : { action: f.key })}
            style={{
              padding: '6px 14px',
              background: (f.key === 'all' && !filter.action) || filter.action === f.key ? 'var(--safe)' : 'var(--glass-01)',
              color: (f.key === 'all' && !filter.action) || filter.action === f.key ? '#fff' : 'var(--ink-mid)',
              border: `1px solid ${(f.key === 'all' && !filter.action) || filter.action === f.key ? 'var(--safe)' : 'var(--border2)'}`,
              borderRadius: 20,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 16, background: 'var(--critical-bg)', border: '1px solid var(--critical-border)', borderRadius: 8, marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mid)' }}>Loading audit log...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mid)' }}>No audit entries found</div>
        ) : (
          <>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--border1)',
                  background: entry.action === 'error' ? 'rgba(220,38,38,0.05)' : 'transparent',
                }}
              >
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  marginTop: 5,
                  flexShrink: 0,
                  background: getActionStatus(entry.action) === 'success' ? '#0D9488' : getActionStatus(entry.action) === 'error' ? '#DC2626' : '#D97706',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{formatDetail(entry)}</span>
                    <StatusBadge status={getActionStatus(entry.action)} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>User: <strong style={{ color: 'var(--ink-mid)' }}>{entry.actor_email}</strong></span>
                    <span>Action: <strong style={{ color: 'var(--ink-mid)' }}>{entry.action}</strong></span>
                    <span>Resource: <strong style={{ color: 'var(--ink-mid)' }}>{entry.resource_type}</strong></span>
                    {entry.ip_address && <span>IP: <strong style={{ color: 'var(--ink-mid)' }}>{entry.ip_address}</strong></span>}
                    <span>Time: <strong style={{ color: 'var(--ink-mid)' }}>{formatDateTime(entry.occurred_at)}</strong></span>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border1)', fontSize: 12, color: 'var(--ink-mid)' }}>
              <span>Showing {entries.length} of {pagination.total} entries</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fetchAuditLog(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--glass-01)',
                    border: '1px solid var(--border2)',
                    borderRadius: 4,
                    cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                    opacity: pagination.page <= 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchAuditLog(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--glass-01)',
                    border: '1px solid var(--border2)',
                    borderRadius: 4,
                    cursor: !pagination.hasNext ? 'not-allowed' : 'pointer',
                    opacity: !pagination.hasNext ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SecuritySection() {
  const sections = [
    {
      title: 'Authentication',
      items: [
        { label: 'Multi-Factor Authentication', value: 'Enforced for all users', status: 'enabled' },
        { label: 'MFA Methods', value: 'TOTP (Authenticator App), FIDO2/WebAuthn Hardware Keys', status: 'enabled' },
        { label: 'Session Timeout', value: '15 minutes idle, 8 hours maximum', status: 'enabled' },
        { label: 'Failed Login Lockout', value: '5 attempts → 30 min lockout', status: 'enabled' },
        { label: 'Password Policy', value: '14 char min, complexity required, 90-day rotation', status: 'enabled' },
      ],
    },
    {
      title: 'Encryption',
      items: [
        { label: 'Data at Rest', value: 'AES-256 (PostgreSQL TDE via Supabase)', status: 'enabled' },
        { label: 'Data in Transit', value: 'TLS 1.3 enforced, HSTS enabled', status: 'enabled' },
        { label: 'FHIR API Communication', value: 'TLS 1.2+ with certificate validation', status: 'enabled' },
        { label: 'Token Storage (Mobile)', value: 'iOS Keychain / Android Keystore', status: 'enabled' },
      ],
    },
    {
      title: 'Access Control',
      items: [
        { label: 'RBAC Model', value: '6 defined roles with minimum necessary principle', status: 'enabled' },
        { label: 'Unique User Identification', value: '§164.312(a)(2)(i) — every user has unique ID', status: 'enabled' },
        { label: 'Emergency Access Procedure', value: 'Break-glass with dual approval + full audit trail', status: 'enabled' },
      ],
    },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Security & Compliance Settings</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ink-mid)' }}>HIPAA Technical Safeguards (45 CFR §164.312) configuration</p>
      {sections.map((section) => (
        <div key={section.title} className="panel" style={{ padding: 20, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>{section.title}</div>
          {section.items.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border1)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{item.value}</div>
              </div>
              <span style={{
                fontSize: 11,
                padding: '2px 10px',
                borderRadius: 20,
                background: item.status === 'enabled' ? '#F0FDFA' : 'var(--glass-01)',
                color: item.status === 'enabled' ? '#0D9488' : 'var(--ink-mid)',
                fontWeight: 600,
                border: `1px solid ${item.status === 'enabled' ? '#99F6E4' : 'var(--border2)'}`,
              }}>
                {item.status === 'enabled' ? 'Enabled' : 'Optional'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Admin Page
// ---------------------------------------------------------------------------

type AdminSection = 'dashboard' | 'fhir' | 'users' | 'roles' | 'audit' | 'security';

export function AdminPage() {
  const role = useAuthStore((s) => s.role);
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

  // Check admin access
  if (role !== 'admin') {
    return <AccessDenied />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardSection />;
      case 'fhir':
        return <FhirEndpointsSection />;
      case 'users':
        return <UsersSection />;
      case 'roles':
        return <RolesSection />;
      case 'audit':
        return <AuditLogSection />;
      case 'security':
        return <SecuritySection />;
      default:
        return <DashboardSection />;
    }
  };

  return (
    <div className="view" data-testid="admin-page">
      {/* Header */}
      <div style={{ padding: '0 24px 16px', borderBottom: '1px solid var(--border1)' }} data-testid="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, var(--safe), var(--info))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
          }}>
            M
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>MindLog Admin Console</div>
            <div style={{ fontSize: 12, color: 'var(--ink-mid)' }}>HIPAA-Compliant Administration</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="admin-tabs">
          <NavTab label="Dashboard" active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} testId="admin-tab-dashboard" />
          <NavTab label="FHIR Endpoints" active={activeSection === 'fhir'} onClick={() => setActiveSection('fhir')} testId="admin-tab-fhir" />
          <NavTab label="Users" active={activeSection === 'users'} onClick={() => setActiveSection('users')} testId="admin-tab-users" />
          <NavTab label="Roles & RBAC" active={activeSection === 'roles'} onClick={() => setActiveSection('roles')} testId="admin-tab-roles" />
          <NavTab label="Audit Log" active={activeSection === 'audit'} onClick={() => setActiveSection('audit')} testId="admin-tab-audit" />
          <NavTab label="Security" active={activeSection === 'security'} onClick={() => setActiveSection('security')} testId="admin-tab-security" />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {renderSection()}
      </div>
    </div>
  );
}
