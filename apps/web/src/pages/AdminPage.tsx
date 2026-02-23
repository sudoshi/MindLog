// =============================================================================
// MindLog Web — Admin Panel
// HIPAA-compliant administration console with FHIR endpoints, user management,
// LDAP import, RBAC, audit log, consent management, security & system config.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

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

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  lastLogin: string | null;
  mfaEnabled: boolean;
  source: 'ldap' | 'manual';
  patientsAssigned: number;
  department: string;
}

interface AuditEntry {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  detail: string;
  status: 'success' | 'error' | 'warning' | 'critical';
  ip: string;
  ehrTarget: string | null;
}

interface RoleConfig {
  id: string;
  label: string;
  color: string;
  permissions: string[];
  description: string;
}

// ---------------------------------------------------------------------------
// Mock Data (until API endpoints are implemented)
// ---------------------------------------------------------------------------

const MOCK_FHIR_ENDPOINTS: FhirEndpoint[] = [
  { id: 1, name: 'Epic - Memorial Hermann', type: 'epic', baseUrl: 'https://fhir.memorial.org/api/FHIR/R4', status: 'connected', lastSync: new Date().toISOString(), patientsLinked: 1247, version: 'Feb 2026', authType: 'SMART v2', tokenExpiry: new Date(Date.now() + 3600000).toISOString() },
  { id: 2, name: 'Oracle Health - Geisinger', type: 'oracle', baseUrl: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2', status: 'connected', lastSync: new Date().toISOString(), patientsLinked: 893, version: 'Millennium R4', authType: 'SMART v2', tokenExpiry: new Date(Date.now() + 1800000).toISOString() },
  { id: 3, name: 'Epic - Cleveland Clinic', type: 'epic', baseUrl: 'https://fhir.ccf.org/api/FHIR/R4', status: 'degraded', lastSync: new Date(Date.now() - 3600000).toISOString(), patientsLinked: 562, version: 'Nov 2025', authType: 'SMART v2', tokenExpiry: null },
];

const MOCK_USERS: AdminUser[] = [
  { id: '1', name: 'Dr. Sarah Chen', email: 'schen@memorial.org', role: 'psychiatrist', status: 'active', lastLogin: new Date().toISOString(), mfaEnabled: true, source: 'ldap', patientsAssigned: 48, department: 'Behavioral Health' },
  { id: '2', name: 'Dr. James Okafor', email: 'jokafor@geisinger.edu', role: 'psychiatrist', status: 'active', lastLogin: new Date().toISOString(), mfaEnabled: true, source: 'ldap', patientsAssigned: 35, department: 'Psychiatry' },
  { id: '3', name: 'Maria Torres, LCSW', email: 'mtorres@memorial.org', role: 'nurse', status: 'active', lastLogin: new Date(Date.now() - 86400000).toISOString(), mfaEnabled: true, source: 'ldap', patientsAssigned: 62, department: 'Social Work' },
  { id: '4', name: 'Dr. Rachel Kim', email: 'rkim@ccf.org', role: 'admin', status: 'active', lastLogin: new Date().toISOString(), mfaEnabled: true, source: 'manual', patientsAssigned: 0, department: 'IT - Clinical Informatics' },
  { id: '5', name: 'Tom Bradford, RN', email: 'tbradford@memorial.org', role: 'nurse', status: 'active', lastLogin: new Date(Date.now() - 172800000).toISOString(), mfaEnabled: false, source: 'ldap', patientsAssigned: 120, department: 'Outpatient Psych' },
];

const MOCK_AUDIT_LOG: AuditEntry[] = [
  { id: 1, timestamp: new Date().toISOString(), user: 'svc-mindlog@mindlog.health', action: 'fhir_sync', resource: 'Observation', detail: 'Batch write 47 observations to Epic Memorial Hermann', status: 'success', ip: '10.0.1.50', ehrTarget: 'Epic - Memorial Hermann' },
  { id: 2, timestamp: new Date(Date.now() - 300000).toISOString(), user: 'svc-mindlog@mindlog.health', action: 'fhir_sync', resource: 'QuestionnaireResponse', detail: 'Write 12 PHQ-9 responses to Oracle Health Geisinger', status: 'success', ip: '10.0.1.50', ehrTarget: 'Oracle Health - Geisinger' },
  { id: 3, timestamp: new Date(Date.now() - 600000).toISOString(), user: 'svc-mindlog@mindlog.health', action: 'fhir_sync', resource: 'Observation', detail: 'Token refresh failed - Epic Cleveland Clinic', status: 'error', ip: '10.0.1.50', ehrTarget: 'Epic - Cleveland Clinic' },
  { id: 4, timestamp: new Date(Date.now() - 1200000).toISOString(), user: 'rkim@ccf.org', action: 'user_login', resource: 'Session', detail: 'Admin login via SSO + MFA', status: 'success', ip: '172.16.4.88', ehrTarget: null },
  { id: 5, timestamp: new Date(Date.now() - 2400000).toISOString(), user: 'schen@memorial.org', action: 'phi_access', resource: 'Patient/1247', detail: 'Viewed patient mood trend report (30-day)', status: 'success', ip: '172.16.2.15', ehrTarget: null },
  { id: 6, timestamp: new Date(Date.now() - 3600000).toISOString(), user: 'svc-mindlog@mindlog.health', action: 'safety_alert', resource: 'Observation/C-SSRS', detail: 'Positive C-SSRS screen - Patient ID 892 - Alert sent to care team', status: 'critical', ip: '10.0.1.50', ehrTarget: 'Epic - Memorial Hermann' },
];

const ROLES_CONFIG: RoleConfig[] = [
  { id: 'system', label: 'System Administrator', color: '#7C3AED', permissions: ['all'], description: 'Full system access including configuration, user management, and audit logs' },
  { id: 'admin', label: 'Clinical Admin', color: '#2563EB', permissions: ['manage_users', 'view_audit', 'config_endpoints', 'view_all_patients', 'manage_consents'], description: 'Clinical informatics admin with user and endpoint management' },
  { id: 'psychiatrist', label: 'Psychiatrist', color: '#059669', permissions: ['view_assigned_patients', 'view_phi', 'write_orders', 'view_alerts', 'manage_care_plans'], description: 'Prescribing physician with full clinical access to assigned patients' },
  { id: 'psychologist', label: 'Psychologist', color: '#0891B2', permissions: ['view_assigned_patients', 'view_phi', 'view_alerts'], description: 'Psychology provider with read access to assigned patient data' },
  { id: 'nurse', label: 'RN / Care Coordinator', color: '#DC2626', permissions: ['view_assigned_patients', 'view_phi', 'view_alerts', 'triage_alerts'], description: 'Nursing staff with triage capability for safety alerts' },
  { id: 'readonly', label: 'Read-Only / Auditor', color: '#6B7280', permissions: ['view_audit', 'view_reports'], description: 'Compliance or audit staff with read-only access to logs and reports' },
];

const SYNC_QUEUE_STATS = { pending: 23, inProgress: 4, completed: 1847, failed: 3, retry: 2 };

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
    connected: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'Connected' },
    active: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'Active' },
    success: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'Success' },
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

function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        <MetricCard label="Total Patients Linked" value="2,725" sublabel="+34 this week" accent="#2563EB" />
        <MetricCard label="Active FHIR Endpoints" value="3 / 5" sublabel="1 degraded" accent="#059669" />
        <MetricCard label="Sync Queue" value={SYNC_QUEUE_STATS.pending} sublabel={`${SYNC_QUEUE_STATS.failed} failed`} accent="#D97706" />
        <MetricCard label="Safety Alerts (24h)" value="1" sublabel="C-SSRS positive" accent="#DC2626" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Recent Activity</h3>
          {MOCK_AUDIT_LOG.slice(0, 5).map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border1)' }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: log.status === 'success' ? '#059669' : log.status === 'error' || log.status === 'critical' ? '#DC2626' : '#D97706',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.detail}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{log.user} · {timeAgo(log.timestamp)}</div>
              </div>
              <StatusBadge status={log.status} />
            </div>
          ))}
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>FHIR Endpoint Health</h3>
          {MOCK_FHIR_ENDPOINTS.map((ep) => (
            <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: ep.type === 'epic' ? '#EFF6FF' : '#FFF7ED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: ep.type === 'epic' ? '#2563EB' : '#EA580C',
                border: `1px solid ${ep.type === 'epic' ? '#BFDBFE' : '#FED7AA'}`,
              }}>
                {ep.type === 'epic' ? 'E' : 'OH'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ep.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{ep.patientsLinked} patients · Last sync {timeAgo(ep.lastSync)}</div>
              </div>
              <StatusBadge status={ep.status} />
            </div>
          ))}
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>S256 Enabled</div>
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
      <div className="panel" style={{ overflow: 'hidden' }}>
        <table className="patient-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Source</th>
              <th>Department</th>
              <th>MFA</th>
              <th>Patients</th>
              <th>Last Login</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_USERS.map((u) => {
              const role = ROLES_CONFIG.find(r => r.id === u.role);
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{u.email}</div>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 10px',
                      borderRadius: 20,
                      background: `${role?.color}15`,
                      color: role?.color,
                      fontWeight: 600,
                      border: `1px solid ${role?.color}30`,
                    }}>{role?.label}</span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: u.source === 'ldap' ? '#EFF6FF' : 'var(--glass-01)',
                      color: u.source === 'ldap' ? '#2563EB' : 'var(--ink-mid)',
                    }}>{u.source.toUpperCase()}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{u.department}</td>
                  <td>
                    {u.mfaEnabled ? (
                      <span style={{ color: '#059669' }}>✓</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>REQUIRED</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink)' }}>{u.patientsAssigned}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{timeAgo(u.lastLogin)}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>
                    <button style={{ padding: '4px 10px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: 'var(--ink-mid)' }}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolesSection() {
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
              <span style={{ fontSize: 12, color: 'var(--ink-mid)' }}>{MOCK_USERS.filter(u => u.role === role.id).length} users</span>
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
  const [filter, setFilter] = useState('all');

  const filtered = MOCK_AUDIT_LOG.filter(log => {
    if (filter === 'all') return true;
    return log.status === filter || log.action === filter;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Audit Log</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-mid)' }}>HIPAA §164.312(b) compliant audit controls — immutable, 6-year retention, AES-256 encrypted</p>
        </div>
        <button style={{ padding: '8px 16px', background: 'var(--glass-01)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--ink-mid)' }}>Export CSV</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'phi_access', 'fhir_sync', 'user_login', 'safety_alert', 'error'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              background: filter === f ? 'var(--safe)' : 'var(--glass-01)',
              color: filter === f ? '#fff' : 'var(--ink-mid)',
              border: `1px solid ${filter === f ? 'var(--safe)' : 'var(--border2)'}`,
              borderRadius: 20,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>
      <div className="panel" style={{ overflow: 'hidden' }}>
        {filtered.map((log) => (
          <div
            key={log.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 18px',
              borderBottom: '1px solid var(--border1)',
              background: log.status === 'critical' ? 'rgba(220,38,38,0.05)' : 'transparent',
            }}
          >
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              marginTop: 5,
              flexShrink: 0,
              background: log.status === 'success' ? '#059669' : log.status === 'error' || log.status === 'critical' ? '#DC2626' : '#D97706',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{log.detail}</span>
                <StatusBadge status={log.status} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>User: <strong style={{ color: 'var(--ink-mid)' }}>{log.user}</strong></span>
                <span>Action: <strong style={{ color: 'var(--ink-mid)' }}>{log.action}</strong></span>
                <span>IP: <strong style={{ color: 'var(--ink-mid)' }}>{log.ip}</strong></span>
                {log.ehrTarget && <span>EHR: <strong style={{ color: 'var(--ink-mid)' }}>{log.ehrTarget}</strong></span>}
                <span>Time: <strong style={{ color: 'var(--ink-mid)' }}>{formatDateTime(log.timestamp)}</strong></span>
              </div>
            </div>
          </div>
        ))}
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
                background: item.status === 'enabled' ? '#ECFDF5' : 'var(--glass-01)',
                color: item.status === 'enabled' ? '#059669' : 'var(--ink-mid)',
                fontWeight: 600,
                border: `1px solid ${item.status === 'enabled' ? '#A7F3D0' : 'var(--border2)'}`,
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
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

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
    <div className="view">
      {/* Header */}
      <div style={{ padding: '0 24px 16px', borderBottom: '1px solid var(--border1)' }}>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <NavTab label="Dashboard" active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} />
          <NavTab label="FHIR Endpoints" active={activeSection === 'fhir'} onClick={() => setActiveSection('fhir')} />
          <NavTab label="Users" active={activeSection === 'users'} onClick={() => setActiveSection('users')} />
          <NavTab label="Roles & RBAC" active={activeSection === 'roles'} onClick={() => setActiveSection('roles')} />
          <NavTab label="Audit Log" active={activeSection === 'audit'} onClick={() => setActiveSection('audit')} />
          <NavTab label="Security" active={activeSection === 'security'} onClick={() => setActiveSection('security')} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {renderSection()}
      </div>
    </div>
  );
}
