import { useState, useEffect, useCallback, useRef } from "react";

// ─── MOCK DATA ──────────────────────────────────────────────────────────────

const MOCK_FHIR_ENDPOINTS = [
  { id: 1, name: "Epic - Memorial Hermann", type: "epic", baseUrl: "https://fhir.memorial.org/api/FHIR/R4", status: "connected", lastSync: "2026-02-22T14:32:00Z", patientsLinked: 1247, version: "Feb 2026", authType: "SMART v2", tokenExpiry: "2026-02-22T15:32:00Z" },
  { id: 2, name: "Oracle Health - Geisinger", type: "oracle", baseUrl: "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d", status: "connected", lastSync: "2026-02-22T14:28:00Z", patientsLinked: 893, version: "Millennium R4", authType: "SMART v2", tokenExpiry: "2026-02-22T14:37:30Z" },
  { id: 3, name: "Epic - Cleveland Clinic", type: "epic", baseUrl: "https://fhir.ccf.org/api/FHIR/R4", status: "degraded", lastSync: "2026-02-22T13:15:00Z", patientsLinked: 562, version: "Nov 2025", authType: "SMART v2", tokenExpiry: "2026-02-22T14:15:00Z" },
  { id: 4, name: "Epic Sandbox (Dev)", type: "epic", baseUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4", status: "connected", lastSync: "2026-02-22T14:30:00Z", patientsLinked: 15, version: "Feb 2026", authType: "SMART v2", tokenExpiry: "2026-02-22T15:30:00Z" },
  { id: 5, name: "Oracle Health Sandbox (Dev)", type: "oracle", baseUrl: "https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d", status: "disconnected", lastSync: "2026-02-21T09:00:00Z", patientsLinked: 8, version: "Millennium R4", authType: "Open (No Auth)", tokenExpiry: null },
];

const MOCK_USERS = [
  { id: 1, name: "Dr. Sarah Chen", email: "schen@memorial.org", role: "psychiatrist", status: "active", lastLogin: "2026-02-22T13:45:00Z", mfaEnabled: true, source: "ldap", patientsAssigned: 48, department: "Behavioral Health" },
  { id: 2, name: "Dr. James Okafor", email: "jokafor@geisinger.edu", role: "psychiatrist", status: "active", lastLogin: "2026-02-22T10:22:00Z", mfaEnabled: true, source: "ldap", patientsAssigned: 35, department: "Psychiatry" },
  { id: 3, name: "Maria Torres, LCSW", email: "mtorres@memorial.org", role: "therapist", status: "active", lastLogin: "2026-02-21T16:30:00Z", mfaEnabled: true, source: "ldap", patientsAssigned: 62, department: "Social Work" },
  { id: 4, name: "Dr. Rachel Kim", email: "rkim@ccf.org", role: "admin", status: "active", lastLogin: "2026-02-22T14:10:00Z", mfaEnabled: true, source: "manual", patientsAssigned: 0, department: "IT - Clinical Informatics" },
  { id: 5, name: "Tom Bradford, RN", email: "tbradford@memorial.org", role: "nurse", status: "active", lastLogin: "2026-02-20T08:15:00Z", mfaEnabled: false, source: "ldap", patientsAssigned: 120, department: "Outpatient Psych" },
  { id: 6, name: "Dr. Anthony Russo", email: "arusso@memorial.org", role: "pcp", status: "suspended", lastLogin: "2026-02-10T11:00:00Z", mfaEnabled: true, source: "ldap", patientsAssigned: 15, department: "Internal Medicine" },
  { id: 7, name: "System Admin (Service)", email: "svc-mindlog@mindlog.health", role: "system", status: "active", lastLogin: "2026-02-22T14:32:00Z", mfaEnabled: true, source: "manual", patientsAssigned: 0, department: "System" },
];

const MOCK_AUDIT_LOG = [
  { id: 1, timestamp: "2026-02-22T14:32:01Z", user: "svc-mindlog@mindlog.health", action: "fhir_sync", resource: "Observation", detail: "Batch write 47 observations to Epic Memorial Hermann", status: "success", ip: "10.0.1.50", ehrTarget: "Epic - Memorial Hermann" },
  { id: 2, timestamp: "2026-02-22T14:28:15Z", user: "svc-mindlog@mindlog.health", action: "fhir_sync", resource: "QuestionnaireResponse", detail: "Write 12 PHQ-9 responses to Oracle Health Geisinger", status: "success", ip: "10.0.1.50", ehrTarget: "Oracle Health - Geisinger" },
  { id: 3, timestamp: "2026-02-22T14:15:03Z", user: "svc-mindlog@mindlog.health", action: "fhir_sync", resource: "Observation", detail: "Token refresh failed - Epic Cleveland Clinic", status: "error", ip: "10.0.1.50", ehrTarget: "Epic - Cleveland Clinic" },
  { id: 4, timestamp: "2026-02-22T14:10:22Z", user: "rkim@ccf.org", action: "user_login", resource: "Session", detail: "Admin login via SSO + MFA", status: "success", ip: "172.16.4.88", ehrTarget: null },
  { id: 5, timestamp: "2026-02-22T13:55:00Z", user: "schen@memorial.org", action: "phi_access", resource: "Patient/1247", detail: "Viewed patient mood trend report (30-day)", status: "success", ip: "172.16.2.15", ehrTarget: null },
  { id: 6, timestamp: "2026-02-22T13:45:11Z", user: "schen@memorial.org", action: "user_login", resource: "Session", detail: "Clinician login via LDAP + MFA", status: "success", ip: "172.16.2.15", ehrTarget: null },
  { id: 7, timestamp: "2026-02-22T13:30:00Z", user: "svc-mindlog@mindlog.health", action: "safety_alert", resource: "Observation/C-SSRS", detail: "Positive C-SSRS screen - Patient ID 892 - Alert sent to care team", status: "critical", ip: "10.0.1.50", ehrTarget: "Epic - Memorial Hermann" },
  { id: 8, timestamp: "2026-02-22T12:00:00Z", user: "rkim@ccf.org", action: "config_change", resource: "FHIR Endpoint", detail: "Updated token refresh interval for Epic Cleveland Clinic endpoint", status: "success", ip: "172.16.4.88", ehrTarget: "Epic - Cleveland Clinic" },
  { id: 9, timestamp: "2026-02-22T10:22:05Z", user: "jokafor@geisinger.edu", action: "user_login", resource: "Session", detail: "Clinician login via LDAP + MFA", status: "success", ip: "10.5.12.30", ehrTarget: null },
  { id: 10, timestamp: "2026-02-22T09:00:00Z", user: "system", action: "ldap_sync", resource: "User Directory", detail: "LDAP sync completed - 3 new users imported, 1 deactivated", status: "success", ip: "10.0.1.50", ehrTarget: null },
  { id: 11, timestamp: "2026-02-22T08:00:00Z", user: "system", action: "backup", resource: "Database", detail: "Automated daily backup completed - 2.4GB encrypted", status: "success", ip: "10.0.1.50", ehrTarget: null },
  { id: 12, timestamp: "2026-02-21T23:55:00Z", user: "tbradford@memorial.org", action: "failed_login", resource: "Session", detail: "Failed login attempt - incorrect MFA code (attempt 2/5)", status: "warning", ip: "192.168.1.45", ehrTarget: null },
];

const MOCK_LDAP_RESULTS = [
  { dn: "CN=Lisa Park,OU=Psychiatry,OU=Medical Staff,DC=memorial,DC=org", cn: "Lisa Park, MD", mail: "lpark@memorial.org", title: "Attending Psychiatrist", department: "Psychiatry", employeeType: "Physician", selected: false },
  { dn: "CN=Marcus Webb,OU=Psychology,OU=Medical Staff,DC=memorial,DC=org", cn: "Marcus Webb, PsyD", mail: "mwebb@memorial.org", title: "Clinical Psychologist", department: "Psychology", employeeType: "Allied Health", selected: false },
  { dn: "CN=Anita Sharma,OU=Social Work,OU=Medical Staff,DC=memorial,DC=org", cn: "Anita Sharma, LCSW", mail: "asharma@memorial.org", title: "Licensed Clinical Social Worker", department: "Behavioral Health", employeeType: "Allied Health", selected: false },
  { dn: "CN=David Liu,OU=Nursing,OU=Medical Staff,DC=memorial,DC=org", cn: "David Liu, RN-BC", mail: "dliu@memorial.org", title: "Psychiatric Nurse", department: "Inpatient Psychiatry", employeeType: "Nursing", selected: false },
  { dn: "CN=Priya Nair,OU=Psychiatry,OU=Medical Staff,DC=memorial,DC=org", cn: "Priya Nair, MD", mail: "pnair@memorial.org", title: "Psychiatry Resident PGY-3", department: "Psychiatry", employeeType: "Resident", selected: false },
];

const SYNC_QUEUE_STATS = { pending: 23, inProgress: 4, completed: 1847, failed: 3, retry: 2 };

const ROLES_CONFIG = [
  { id: "system", label: "System Administrator", color: "#7C3AED", permissions: ["all"], description: "Full system access including configuration, user management, and audit logs" },
  { id: "admin", label: "Clinical Admin", color: "#2563EB", permissions: ["manage_users", "view_audit", "config_endpoints", "view_all_patients", "manage_consents"], description: "Clinical informatics admin with user and endpoint management" },
  { id: "psychiatrist", label: "Psychiatrist", color: "#059669", permissions: ["view_assigned_patients", "view_phi", "write_orders", "view_alerts", "manage_care_plans"], description: "Prescribing physician with full clinical access to assigned patients" },
  { id: "pcp", label: "Primary Care", color: "#0891B2", permissions: ["view_assigned_patients", "view_phi", "view_alerts"], description: "PCP with read access to assigned patient mental health data" },
  { id: "therapist", label: "Therapist / LCSW", color: "#D97706", permissions: ["view_assigned_patients", "view_phi", "write_notes", "view_alerts"], description: "Therapy provider with access to assigned patient data and note writing" },
  { id: "nurse", label: "RN / Care Coordinator", color: "#DC2626", permissions: ["view_assigned_patients", "view_phi", "view_alerts", "triage_alerts"], description: "Nursing staff with triage capability for safety alerts" },
  { id: "readonly", label: "Read-Only / Auditor", color: "#6B7280", permissions: ["view_audit", "view_reports"], description: "Compliance or audit staff with read-only access to logs and reports" },
];

// ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── ICONS (inline SVG) ─────────────────────────────────────────────────────

const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const icons = {
    dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>,
    fhir: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>,
    users: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>,
    ldap: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>,
    audit: <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>,
    security: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>,
    settings: <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>,
    sync: <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>,
    alert: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>,
    check: <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>,
    close: <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>,
    search: <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>,
    key: <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>,
    queue: <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>,
    consent: <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>,
    chevron: <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>,
    warning: <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      {icons[name] || icons.settings}
    </svg>
  );
};

// ─── STATUS BADGE ───────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const config = {
    connected: { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "Connected" },
    active: { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "Active" },
    success: { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "Success" },
    degraded: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Degraded" },
    warning: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Warning" },
    suspended: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Suspended" },
    disconnected: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Disconnected" },
    error: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Error" },
    failed: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Failed" },
    critical: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Critical" },
  };
  const c = config[status] || config.warning;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`, letterSpacing: 0.3 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, animation: status === "connected" || status === "active" ? "pulse 2s infinite" : "none" }} />
      {c.label}
    </span>
  );
};

// ─── METRIC CARD ────────────────────────────────────────────────────────────

const MetricCard = ({ label, value, sublabel, icon, accent = "#2563EB" }) => (
  <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 200 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: `${accent}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={22} color={accent} />
    </div>
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#111827", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: accent, marginTop: 1 }}>{sublabel}</div>}
    </div>
  </div>
);

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function MindLogAdmin() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ldapSearchResults, setLdapSearchResults] = useState([]);
  const [ldapSearching, setLdapSearching] = useState(false);
  const [ldapFilter, setLdapFilter] = useState("(&(objectClass=person)(|(department=Psychiatry)(department=Psychology)(department=Behavioral Health)(department=Social Work)))");
  const [ldapBaseDn, setLdapBaseDn] = useState("OU=Medical Staff,DC=memorial,DC=org");
  const [ldapServer, setLdapServer] = useState("ldaps://ldap.memorial.org:636");
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [auditFilter, setAuditFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [showToast, setShowToast] = useState(null);

  const toast = (msg, type = "success") => {
    setShowToast({ msg, type });
    setTimeout(() => setShowToast(null), 3500);
  };

  const simulateLdapSearch = () => {
    setLdapSearching(true);
    setLdapSearchResults([]);
    setTimeout(() => {
      setLdapSearchResults(MOCK_LDAP_RESULTS.map(r => ({ ...r, selected: false })));
      setLdapSearching(false);
      toast(`Found ${MOCK_LDAP_RESULTS.length} users matching LDAP filter`);
    }, 1800);
  };

  const toggleLdapSelect = (idx) => {
    setLdapSearchResults(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const importSelectedUsers = () => {
    const count = ldapSearchResults.filter(r => r.selected).length;
    if (count === 0) return toast("No users selected for import", "warning");
    toast(`${count} user(s) imported successfully and pending role assignment`);
    setLdapSearchResults(prev => prev.filter(r => !r.selected));
  };

  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "fhir", icon: "fhir", label: "FHIR Endpoints" },
    { id: "sync", icon: "sync", label: "Sync Queue" },
    { id: "users", icon: "users", label: "User Management" },
    { id: "ldap", icon: "ldap", label: "LDAP Import" },
    { id: "roles", icon: "key", label: "Roles & RBAC" },
    { id: "audit", icon: "audit", label: "Audit Log" },
    { id: "consent", icon: "consent", label: "Consent Mgmt" },
    { id: "security", icon: "security", label: "Security" },
    { id: "settings", icon: "settings", label: "System Config" },
  ];

  // ─── RENDER SECTIONS ───────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <MetricCard label="Total Patients Linked" value="2,725" sublabel="+34 this week" icon="users" accent="#2563EB" />
        <MetricCard label="Active FHIR Endpoints" value="3 / 5" sublabel="1 degraded" icon="fhir" accent="#059669" />
        <MetricCard label="Sync Queue" value={SYNC_QUEUE_STATS.pending} sublabel={`${SYNC_QUEUE_STATS.failed} failed`} icon="queue" accent="#D97706" />
        <MetricCard label="Safety Alerts (24h)" value="1" sublabel="C-SSRS positive" icon="alert" accent="#DC2626" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Recent Activity</h3>
          {MOCK_AUDIT_LOG.slice(0, 6).map((log) => (
            <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: log.status === "success" ? "#059669" : log.status === "error" ? "#DC2626" : log.status === "critical" ? "#DC2626" : "#D97706", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.detail}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{log.user} · {timeAgo(log.timestamp)}</div>
              </div>
              <StatusBadge status={log.status} />
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#111827" }}>FHIR Endpoint Health</h3>
          {MOCK_FHIR_ENDPOINTS.map((ep) => (
            <div key={ep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }} onClick={() => { setActiveSection("fhir"); setSelectedEndpoint(ep); }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: ep.type === "epic" ? "#EFF6FF" : "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: ep.type === "epic" ? "#2563EB" : "#EA580C", border: `1px solid ${ep.type === "epic" ? "#BFDBFE" : "#FED7AA"}` }}>
                {ep.type === "epic" ? "E" : "OH"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{ep.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{ep.patientsLinked} patients · Last sync {timeAgo(ep.lastSync)}</div>
              </div>
              <StatusBadge status={ep.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderFhirEndpoints = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>FHIR R4 Endpoint Configuration</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>Manage bidirectional SMART on FHIR v2 connections to EHR systems</p>
        </div>
        <button onClick={() => setShowEndpointModal(true)} style={{ padding: "8px 18px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Endpoint</button>
      </div>
      {MOCK_FHIR_ENDPOINTS.map((ep) => (
        <div key={ep.id} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${ep.status === "degraded" ? "#FDE68A" : ep.status === "disconnected" ? "#FECACA" : "#E5E7EB"}`, padding: 20, marginBottom: 12, cursor: "pointer" }} onClick={() => setSelectedEndpoint(selectedEndpoint?.id === ep.id ? null : ep)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: ep.type === "epic" ? "#EFF6FF" : "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ep.type === "epic" ? "#2563EB" : "#EA580C", border: `1px solid ${ep.type === "epic" ? "#BFDBFE" : "#FED7AA"}` }}>
                {ep.type === "epic" ? "Epic" : "OH"}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{ep.name}</div>
                <code style={{ fontSize: 11, color: "#6B7280", background: "#F9FAFB", padding: "2px 6px", borderRadius: 4 }}>{ep.baseUrl}</code>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                  <span>Auth: <strong>{ep.authType}</strong></span>
                  <span>Version: <strong>{ep.version}</strong></span>
                  <span>Patients: <strong>{ep.patientsLinked}</strong></span>
                  <span>Last sync: <strong>{timeAgo(ep.lastSync)}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status={ep.status} />
              <button onClick={(e) => { e.stopPropagation(); toast(`Sync triggered for ${ep.name}`); }} style={{ padding: "6px 12px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="sync" size={14} color="#6B7280" /> Sync Now
              </button>
            </div>
          </div>
          {selectedEndpoint?.id === ep.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F3F4F6" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ background: "#F9FAFB", padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Token Expiry</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ep.tokenExpiry ? "#111827" : "#9CA3AF" }}>{ep.tokenExpiry ? formatDateTime(ep.tokenExpiry) : "No active token"}</div>
                </div>
                <div style={{ background: "#F9FAFB", padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>OAuth Scopes</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "#111827" }}>patient/Patient.r, patient/Condition.r, patient/Observation.rw, patient/QuestionnaireResponse.rw</div>
                </div>
                <div style={{ background: "#F9FAFB", padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>PKCE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>S256 Enabled</div>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Supported Resources & Operations</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Patient (R)", "Condition (R)", "MedicationRequest (R)", "Observation (R/W)", "QuestionnaireResponse (R/W)", "CarePlan (R)", "CareTeam (R)", "DocumentReference (R/W)", "AllergyIntolerance (R)"].map((r) => (
                  <span key={r} style={{ fontSize: 11, padding: "3px 10px", background: r.includes("W") ? "#EFF6FF" : "#F3F4F6", color: r.includes("W") ? "#2563EB" : "#6B7280", borderRadius: 20, border: `1px solid ${r.includes("W") ? "#BFDBFE" : "#E5E7EB"}` }}>{r}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Edit Configuration</button>
                <button style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Test Connection</button>
                <button style={{ padding: "6px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>View CapabilityStatement</button>
                <button style={{ padding: "6px 14px", background: "#fff", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#DC2626" }}>Disconnect</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {showEndpointModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 560, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Add FHIR R4 Endpoint</h3>
              <button onClick={() => setShowEndpointModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><Icon name="close" size={20} color="#6B7280" /></button>
            </div>
            {[
              { label: "Endpoint Name", placeholder: "e.g., Epic - Johns Hopkins", type: "text" },
              { label: "EHR Platform", placeholder: "", type: "select", options: ["Epic (EpicCare)", "Oracle Health (Millennium)", "Other FHIR R4"] },
              { label: "FHIR Base URL", placeholder: "https://fhir.example.org/api/FHIR/R4", type: "text" },
              { label: "Client ID (OAuth 2.0)", placeholder: "Registered SMART on FHIR client ID", type: "text" },
              { label: "Redirect URI", placeholder: "mindlog://auth/callback", type: "text" },
              { label: "Authorization Endpoint", placeholder: "Auto-discovered from .well-known/smart-configuration", type: "text" },
              { label: "Token Endpoint", placeholder: "Auto-discovered from .well-known/smart-configuration", type: "text" },
            ].map((field) => (
              <div key={field.label} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{field.label}</label>
                {field.type === "select" ? (
                  <select style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#fff" }}>
                    {field.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input placeholder={field.placeholder} style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
                )}
              </div>
            ))}
            <div style={{ padding: 12, background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A", marginBottom: 16, fontSize: 12, color: "#92400E" }}>
              <strong>SMART Discovery:</strong> After entering the FHIR Base URL, the system will auto-discover authorization and token endpoints from <code>.well-known/smart-configuration</code>. PKCE with S256 challenge method will be enforced automatically.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowEndpointModal(false)} style={{ padding: "8px 18px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { setShowEndpointModal(false); toast("Endpoint added — testing connection..."); }} style={{ padding: "8px 18px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add & Test Connection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSyncQueue = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>FHIR Sync Queue</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>Outbound write-back queue status for all EHR endpoints</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Pending", value: SYNC_QUEUE_STATS.pending, color: "#D97706" },
          { label: "In Progress", value: SYNC_QUEUE_STATS.inProgress, color: "#2563EB" },
          { label: "Completed (24h)", value: SYNC_QUEUE_STATS.completed.toLocaleString(), color: "#059669" },
          { label: "Failed", value: SYNC_QUEUE_STATS.failed, color: "#DC2626" },
          { label: "Retry Pending", value: SYNC_QUEUE_STATS.retry, color: "#7C3AED" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: "16px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Queue Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {[
            { label: "Max Retry Attempts", value: "5" },
            { label: "Backoff Strategy", value: "Exponential (30s → 2h)" },
            { label: "Priority Order", value: "Safety Alerts → PROs → Daily Metrics" },
            { label: "Batch Size", value: "50 resources per cycle" },
            { label: "Cycle Interval", value: "30 seconds" },
            { label: "Dead Letter Queue", value: "Enabled (6yr retention)" },
          ].map((c) => (
            <div key={c.label} style={{ background: "#F9FAFB", padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#6B7280" }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginTop: 3 }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>User Management</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>HIPAA-compliant user lifecycle with RBAC and MFA enforcement</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setActiveSection("ldap")} style={{ padding: "8px 16px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Import from LDAP</button>
          <button style={{ padding: "8px 16px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Manual User</button>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                {["User", "Role", "Source", "Department", "MFA", "Patients", "Last Login", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_USERS.map((u) => {
                const role = ROLES_CONFIG.find(r => r.id === u.role);
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u.email}</div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: `${role?.color}15`, color: role?.color, fontWeight: 600, border: `1px solid ${role?.color}30` }}>{role?.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: u.source === "ldap" ? "#EFF6FF" : "#F3F4F6", color: u.source === "ldap" ? "#2563EB" : "#6B7280" }}>{u.source.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{u.department}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {u.mfaEnabled ? <Icon name="check" size={16} color="#059669" /> : <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>REQUIRED</span>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#111827" }}>{u.patientsAssigned}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{timeAgo(u.lastLogin)}</td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={u.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button style={{ padding: "4px 10px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderLdap = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>LDAP / Active Directory User Import</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>Search and import clinical staff from your organization's directory service</p>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>LDAP Connection Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>LDAP Server URI</label>
            <input value={ldapServer} onChange={e => setLdapServer(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Base DN (Search Root)</label>
            <input value={ldapBaseDn} onChange={e => setLdapBaseDn(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>LDAP Search Filter</label>
          <textarea value={ldapFilter} onChange={e => setLdapFilter(e.target.value)} rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
            Common filters: <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 3 }}>(department=Psychiatry)</code> · <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 3 }}>(title=*Psychiatr*)</code> · <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 3 }}>(memberOf=CN=BehavioralHealth,OU=Groups,DC=...)</code>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Bind DN (Service Account)</label>
            <input defaultValue="CN=svc-mindlog,OU=Service Accounts,DC=memorial,DC=org" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Bind Password</label>
            <input type="password" defaultValue="placeholder" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Attribute Mapping: Name</label>
            <input defaultValue="cn" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Attribute Mapping: Email</label>
            <input defaultValue="mail" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Attribute Mapping: Department</label>
            <input defaultValue="department" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={simulateLdapSearch} disabled={ldapSearching} style={{ padding: "8px 20px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: ldapSearching ? "wait" : "pointer", opacity: ldapSearching ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="search" size={16} color="#fff" /> {ldapSearching ? "Searching..." : "Search Directory"}
          </button>
          <button style={{ padding: "8px 18px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Test Connection</button>
        </div>
      </div>

      {ldapSearchResults.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Search Results ({ldapSearchResults.length} users found)</div>
            <button onClick={importSelectedUsers} style={{ padding: "6px 16px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Import Selected ({ldapSearchResults.filter(r => r.selected).length})</button>
          </div>
          {ldapSearchResults.map((r, idx) => (
            <div key={idx} onClick={() => toggleLdapSelect(idx)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 6, background: r.selected ? "#EFF6FF" : "#F9FAFB", border: `1px solid ${r.selected ? "#BFDBFE" : "#E5E7EB"}`, cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${r.selected ? "#2563EB" : "#D1D5DB"}`, display: "flex", alignItems: "center", justifyContent: "center", background: r.selected ? "#2563EB" : "#fff", flexShrink: 0 }}>
                {r.selected && <Icon name="check" size={14} color="#fff" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{r.cn}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{r.mail} · {r.title} · {r.department}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{r.dn}</div>
              </div>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#F3F4F6", color: "#6B7280" }}>{r.employeeType}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: 12, background: "#ECFDF5", borderRadius: 8, border: "1px solid #A7F3D0", fontSize: 12, color: "#065F46" }}>
            <strong>Post-Import:</strong> Imported users will be set to <strong>Pending</strong> status. An admin must assign a role and verify MFA enrollment before the account is activated. Per HIPAA §164.312(d), unique user identification is enforced.
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Automated LDAP Sync Schedule</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Sync Frequency</label>
            <select defaultValue="daily" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily (recommended)</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Auto-Deactivate on LDAP Removal</label>
            <select defaultValue="yes" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              <option value="yes">Yes — immediately suspend access</option>
              <option value="grace">Grace period (48 hours)</option>
              <option value="no">No — manual only</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Role Auto-Assignment Rule</label>
            <select defaultValue="manual" style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              <option value="manual">Manual assignment required</option>
              <option value="department">Map by department OU</option>
              <option value="group">Map by LDAP group membership</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRoles = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Role-Based Access Control (RBAC)</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>HIPAA §164.312(a)(1) compliant access control with minimum necessary principle enforcement</p>
      {ROLES_CONFIG.map((role) => (
        <div key={role.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: "16px 20px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${role.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="key" size={18} color={role.color} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{role.label}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{role.description}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>{MOCK_USERS.filter(u => u.role === role.id).length} users</span>
              <button style={{ padding: "4px 12px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Edit</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {role.permissions.map((p) => (
              <span key={p} style={{ fontSize: 10, padding: "2px 8px", background: `${role.color}10`, color: role.color, borderRadius: 12, border: `1px solid ${role.color}25`, fontFamily: "monospace" }}>{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderAuditLog = () => {
    const filtered = MOCK_AUDIT_LOG.filter(log => {
      if (auditFilter !== "all" && log.status !== auditFilter && log.action !== auditFilter) return false;
      if (auditSearch && !JSON.stringify(log).toLowerCase().includes(auditSearch.toLowerCase())) return false;
      return true;
    });
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Audit Log</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>HIPAA §164.312(b) compliant audit controls — immutable, 6-year retention, AES-256 encrypted</p>
          </div>
          <button style={{ padding: "8px 16px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Export CSV</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Icon name="search" size={16} color="#9CA3AF" />
            <input placeholder="Search audit log (user, action, resource, detail...)" value={auditSearch} onChange={e => setAuditSearch(e.target.value)} style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
          </div>
          {["all", "phi_access", "fhir_sync", "user_login", "safety_alert", "config_change", "error"].map(f => (
            <button key={f} onClick={() => setAuditFilter(f)} style={{ padding: "6px 14px", background: auditFilter === f ? "#2563EB" : "#fff", color: auditFilter === f ? "#fff" : "#6B7280", border: `1px solid ${auditFilter === f ? "#2563EB" : "#E5E7EB"}`, borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
              {f === "all" ? "All" : f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          {filtered.map((log) => (
            <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 18px", borderBottom: "1px solid #F3F4F6", background: log.status === "critical" ? "#FEF2F2" : "transparent" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: log.status === "success" ? "#059669" : log.status === "error" ? "#DC2626" : log.status === "critical" ? "#DC2626" : "#D97706" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{log.detail}</span>
                  <StatusBadge status={log.status} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>User: <strong style={{ color: "#6B7280" }}>{log.user}</strong></span>
                  <span>Action: <strong style={{ color: "#6B7280" }}>{log.action}</strong></span>
                  <span>Resource: <strong style={{ color: "#6B7280" }}>{log.resource}</strong></span>
                  <span>IP: <strong style={{ color: "#6B7280" }}>{log.ip}</strong></span>
                  {log.ehrTarget && <span>EHR: <strong style={{ color: "#6B7280" }}>{log.ehrTarget}</strong></span>}
                  <span>Time: <strong style={{ color: "#6B7280" }}>{formatDateTime(log.timestamp)}</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderConsent = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Patient Consent Management</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>Track and manage patient authorization for EHR data exchange (42 CFR Part 2 compliant for SUD data)</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Active Consents" value="2,614" icon="consent" accent="#059669" />
        <MetricCard label="Pending Review" value="47" icon="alert" accent="#D97706" />
        <MetricCard label="Revoked (30d)" value="12" icon="close" accent="#DC2626" />
        <MetricCard label="Expiring Soon" value="89" sublabel="Within 30 days" icon="warning" accent="#7C3AED" />
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Consent Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "EHR Read Consent", desc: "Patient authorizes MindLog to read clinical data (diagnoses, medications, labs) from their EHR", status: "Required before any inbound sync" },
            { label: "EHR Write-Back Consent", desc: "Patient authorizes MindLog to write PRO data, observations, and reports to their EHR medical record", status: "Required before any outbound sync" },
            { label: "Care Team Sharing Consent", desc: "Patient specifies which care team members can view their MindLog data", status: "Granular per-provider authorization" },
            { label: "Research Data Consent (Optional)", desc: "Patient may opt-in to de-identified data contribution for mental health research", status: "IRB-approved consent form required" },
          ].map((c) => (
            <div key={c.label} style={{ background: "#F9FAFB", padding: 14, borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{c.label}</div>
              <div style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 8px" }}>{c.desc}</div>
              <div style={{ fontSize: 11, padding: "3px 8px", background: "#ECFDF5", color: "#065F46", borderRadius: 4, display: "inline-block" }}>{c.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Security & Compliance Settings</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>HIPAA Technical Safeguards (45 CFR §164.312) configuration</p>
      {[
        { title: "Authentication", icon: "key", items: [
          { label: "Multi-Factor Authentication", value: "Enforced for all users", status: "enabled" },
          { label: "MFA Methods", value: "TOTP (Authenticator App), FIDO2/WebAuthn Hardware Keys", status: "enabled" },
          { label: "Session Timeout", value: "15 minutes idle, 8 hours maximum", status: "enabled" },
          { label: "Failed Login Lockout", value: "5 attempts → 30 min lockout → admin unlock required", status: "enabled" },
          { label: "Password Policy", value: "14 char min, complexity required, 90-day rotation, 12 history", status: "enabled" },
          { label: "SSO Integration", value: "SAML 2.0 / OIDC via organization IdP", status: "enabled" },
        ]},
        { title: "Encryption", icon: "security", items: [
          { label: "Data at Rest", value: "AES-256 (PostgreSQL TDE via Supabase)", status: "enabled" },
          { label: "Data in Transit", value: "TLS 1.3 enforced (1.2 minimum), HSTS enabled", status: "enabled" },
          { label: "FHIR API Communication", value: "TLS 1.2+ with certificate validation", status: "enabled" },
          { label: "Token Storage (Mobile)", value: "iOS Keychain / Android Keystore via expo-secure-store", status: "enabled" },
          { label: "Backup Encryption", value: "AES-256 with separate key management", status: "enabled" },
          { label: "PHI in Logs", value: "Prohibited — resource IDs only, no PHI values", status: "enabled" },
        ]},
        { title: "Access Control", icon: "users", items: [
          { label: "RBAC Model", value: "7 defined roles with minimum necessary principle", status: "enabled" },
          { label: "Unique User Identification", value: "§164.312(a)(2)(i) — every user has unique ID", status: "enabled" },
          { label: "Emergency Access Procedure", value: "Break-glass with dual approval + full audit trail", status: "enabled" },
          { label: "Automatic Logoff", value: "§164.312(a)(2)(iii) — 15 minute inactivity timeout", status: "enabled" },
          { label: "IP Allowlisting", value: "Optional per-endpoint restriction", status: "optional" },
        ]},
        { title: "Audit & Monitoring", icon: "audit", items: [
          { label: "Audit Log Retention", value: "6 years (HIPAA minimum) — WORM storage", status: "enabled" },
          { label: "Log Immutability", value: "Write-once, append-only with SHA-256 checksums", status: "enabled" },
          { label: "Real-time Alerting", value: "SIEM integration for anomaly detection", status: "enabled" },
          { label: "PHI Access Monitoring", value: "All patient record views logged with reason code", status: "enabled" },
          { label: "Compliance Reporting", value: "Automated monthly HIPAA compliance reports", status: "enabled" },
        ]},
      ].map((section) => (
        <div key={section.title} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Icon name={section.icon} size={18} color="#2563EB" />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{section.title}</div>
          </div>
          {section.items.map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{item.value}</div>
              </div>
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: item.status === "enabled" ? "#ECFDF5" : "#F3F4F6", color: item.status === "enabled" ? "#059669" : "#6B7280", fontWeight: 600, border: `1px solid ${item.status === "enabled" ? "#A7F3D0" : "#E5E7EB"}` }}>
                {item.status === "enabled" ? "Enabled" : "Optional"}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderSettings = () => (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>System Configuration</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>Application-wide settings for MindLog platform administration</p>
      {[
        { title: "Survey & Instrument Configuration", items: [
          { label: "PHQ-9 Administration Frequency", value: "Weekly (every 7 days)" },
          { label: "GAD-7 Administration Frequency", value: "Weekly (every 7 days)" },
          { label: "ASRM Administration", value: "Weekly — only for patients with active F31.x diagnosis (auto-triggered by FHIR Condition sync)" },
          { label: "C-SSRS Screening", value: "Weekly + triggered on PHQ-9 Item 9 > 0 or mood score ≤ 2" },
          { label: "Daily Mood Check-in Window", value: "6:00 PM – 10:00 PM local time" },
          { label: "Morning Sleep Check-in Window", value: "6:00 AM – 10:00 AM local time" },
        ]},
        { title: "Safety Alert Configuration", items: [
          { label: "C-SSRS Positive Response", value: "Immediate: In-app crisis resources + EHR Observation write-back + Care team notification (push + secure message)" },
          { label: "PHQ-9 Item 9 (SI Question) > 0", value: "Immediate: Trigger full C-SSRS screening + clinician notification if score ≥ 1" },
          { label: "PHQ-9 Total ≥ 20 (Severe Depression)", value: "Priority notification to assigned psychiatrist within 4 hours" },
          { label: "ASRM ≥ 6 (Probable Mania)", value: "Priority notification to assigned psychiatrist within 4 hours" },
          { label: "Medication Non-Adherence ≥ 3 Consecutive Days", value: "Alert to prescribing provider" },
          { label: "Sleep Duration < 3 Hours for ≥ 2 Nights", value: "Alert to care team (prodromal mania signal for bipolar)" },
        ]},
        { title: "Notification Channels", items: [
          { label: "Clinician Safety Alerts", value: "Push notification + Secure in-app message + EHR inbox (via FHIR Communication)" },
          { label: "Patient Reminders", value: "Push notification + optional SMS (with consent)" },
          { label: "System Admin Alerts", value: "Email + PagerDuty integration for sync failures and security events" },
          { label: "Fallback Escalation", value: "If no clinician acknowledgment within 30 minutes → escalate to department on-call" },
        ]},
        { title: "Data Retention & Backup", items: [
          { label: "Patient Data Retention", value: "Duration of treatment + 7 years post-discharge (per state medical records law)" },
          { label: "Audit Log Retention", value: "6 years (HIPAA minimum) — immutable WORM storage" },
          { label: "Automated Backups", value: "Daily full backup + continuous WAL archiving, AES-256 encrypted, geographically replicated" },
          { label: "Disaster Recovery RTO/RPO", value: "RTO: 4 hours | RPO: 1 hour (WAL-based point-in-time recovery)" },
        ]},
      ].map((section) => (
        <div key={section.title} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 20, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 14 }}>{section.title}</div>
          {section.items.map((item) => (
            <div key={item.label} style={{ padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const sections = {
    dashboard: renderDashboard,
    fhir: renderFhirEndpoints,
    sync: renderSyncQueue,
    users: renderUsers,
    ldap: renderLdap,
    roles: renderRoles,
    audit: renderAuditLog,
    consent: renderConsent,
    security: renderSecurity,
    settings: renderSettings,
  };

  // ─── MAIN LAYOUT ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#F3F4F6", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        button:hover { filter: brightness(0.96); }
        code { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 56 : 230, background: "#111827", display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: sidebarCollapsed ? "16px 10px" : "16px 18px", borderBottom: "1px solid #1F2937", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0 }}>M</div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#F9FAFB", lineHeight: 1.1 }}>MindLog</div>
              <div style={{ fontSize: 10, color: "#6B7280", letterSpacing: 1 }}>ADMIN CONSOLE</div>
            </div>
          )}
        </div>
        <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setActiveSection(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: sidebarCollapsed ? "10px 16px" : "10px 18px", background: activeSection === item.id ? "#1F2937" : "transparent", border: "none", borderLeft: activeSection === item.id ? "3px solid #3B82F6" : "3px solid transparent", color: activeSection === item.id ? "#F9FAFB" : "#9CA3AF", fontSize: 13, fontWeight: activeSection === item.id ? 600 : 400, cursor: "pointer", textAlign: "left", transition: "all 0.15s", whiteSpace: "nowrap" }}>
              <Icon name={item.icon} size={18} color={activeSection === item.id ? "#3B82F6" : "#6B7280"} />
              {!sidebarCollapsed && item.label}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #1F2937", fontSize: 11, color: "#6B7280" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669" }} />
              <span>System Healthy</span>
            </div>
            <div>v2.4.0 · HIPAA Compliant</div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top Bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
              {navItems.find(n => n.id === activeSection)?.label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "#FEF2F2", borderRadius: 20, border: "1px solid #FECACA" }}>
              <Icon name="alert" size={14} color="#DC2626" />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>1 Safety Alert</span>
            </div>
            <div style={{ width: 1, height: 24, background: "#E5E7EB" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#2563EB" }}>RK</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Dr. Rachel Kim</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>Clinical Admin</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {sections[activeSection]?.()}
          </div>
        </div>
      </div>

      {/* Toast */}
      {showToast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", background: showToast.type === "success" ? "#059669" : showToast.type === "warning" ? "#D97706" : "#DC2626", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", animation: "fadeIn 0.3s ease", zIndex: 9999, display: "flex", alignItems: "center", gap: 8, maxWidth: 400 }}>
          <Icon name={showToast.type === "success" ? "check" : "alert"} size={16} color="#fff" />
          {showToast.msg}
        </div>
      )}
    </div>
  );
}
