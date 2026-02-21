// =============================================================================
// MindLog Web — Clinical Alerts page
// Real-time alert feed via WebSocket + paginated REST list.
// Clinicians can acknowledge, resolve, and escalate alerts.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { api } from '../services/api.js';
import { useAlertSocket, type LiveAlert } from '../hooks/useAlertSocket.js';
import { useAuthStore } from '../stores/auth.js';

interface Alert {
  id: string;
  patient_id: string;
  patient_name?: string;
  rule_key: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'auto_resolved' | 'escalated';
  title: string;
  detail: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
}

const SEVERITY_COLOR: Record<string, string> = { critical: '#d62828', warning: '#faa307', info: '#2a9d8f' };
const STATUS_LABEL: Record<string, string> = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved', auto_resolved: 'Auto-resolved', escalated: 'Escalated' };

function formatRelative(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function AlertCard({ alert, token, onRefresh }: { alert: Alert; token: string | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const isOpen = alert.status === 'open' || alert.status === 'acknowledged';
  const sc = SEVERITY_COLOR[alert.severity] ?? '#666';

  const act = async (ep: string, body?: object) => {
    setBusy(true);
    try { await api.patch(`/alerts/${alert.id}/${ep}`, body ?? {}, token ?? undefined); onRefresh(); }
    catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: '#161a27', border: `1px solid ${alert.severity === 'critical' ? '#4a1010' : '#1e2535'}`, borderLeft: `4px solid ${sc}`, borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'inline-block', background: `${sc}22`, color: sc, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 8px', borderRadius: 4, marginBottom: 6 }}>{alert.severity}</span>
          <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{alert.title}</div>
          {alert.patient_name && (
            <button onClick={() => navigate(`/patients/${alert.patient_id}`)}
              style={{ background: 'none', border: 'none', padding: 0, color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', marginBottom: 4 }}>
              {alert.patient_name}
            </button>
          )}
          <div style={{ color: '#4a5568', fontSize: 12 }}>{alert.rule_key} · {STATUS_LABEL[alert.status]} · {formatRelative(alert.created_at)}</div>
        </div>
        {isOpen ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {alert.status === 'open' && <Btn label="Acknowledge" color="#3182ce" busy={busy} onClick={() => void act('acknowledge')} />}
            <Btn label="Resolve" color={DESIGN_TOKENS.COLOR_SUCCESS} busy={busy} onClick={() => void act('resolve')} />
            <Btn label="Escalate" color={DESIGN_TOKENS.COLOR_DANGER} busy={busy} onClick={() => void act('escalate', { note: 'Escalated via dashboard' })} />
          </div>
        ) : (
          <div style={{ color: '#4a5568', fontSize: 12 }}>{STATUS_LABEL[alert.status]}</div>
        )}
      </div>
    </div>
  );
}

function Btn({ label, color, busy, onClick }: { label: string; color: string; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{ background: `${color}22`, border: `1px solid ${color}55`, color, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
      {label}
    </button>
  );
}

function LiveToast({ alerts, onDismiss }: { alerts: LiveAlert[]; onDismiss: () => void }) {
  if (alerts.length === 0) return null;
  const latest = alerts[0]!;
  const sc = SEVERITY_COLOR[latest.severity] ?? '#666';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#161a27', border: `1px solid ${sc}`, borderRadius: 12, padding: '16px 20px', zIndex: 1000, maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: sc, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{alerts.length > 1 ? `${alerts.length} new alerts` : 'New alert'}</span>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 14 }}>{latest.title}</div>
      <div style={{ color: '#4a5568', fontSize: 12, marginTop: 4 }}>{latest.ruleKey}</div>
    </div>
  );
}

type FS = 'open' | 'acknowledged' | 'resolved' | 'all';
type FSev = 'critical' | 'warning' | 'info' | 'all';

export function AlertsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState<FS>('open');
  const [fSev, setFSev] = useState<FSev>('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (fStatus !== 'all') p.set('status', fStatus);
      if (fSev !== 'all') p.set('severity', fSev);
      const d = await api.get<{ items: Alert[]; total: number }>(`/alerts?${p.toString()}`, token ?? undefined);
      setAlerts(d.items); setTotal(d.total);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token, fStatus, fSev, page]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  const { status: ws, liveAlerts, clearAlerts } = useAlertSocket({
    token,
    onAlert: () => { if (fStatus === 'open' || fStatus === 'all') void fetch_(); },
  });

  const BG = '#0c0f18'; const CARD = '#161a27'; const BORDER = '#1e2535'; const TEXT = '#e2e8f0'; const SUB = '#8b9cb0';
  const wsc = ws === 'connected' ? '#6a994e' : ws === 'connecting' ? '#faa307' : '#d62828';

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <header style={{ background: CARD, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${BORDER}` }}>
        <h1 onClick={() => navigate('/dashboard')} style={{ fontFamily: 'Fraunces, serif', color: DESIGN_TOKENS.COLOR_PRIMARY, fontSize: 22, margin: 0, cursor: 'pointer' }}>MindLog</h1>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: SUB, textDecoration: 'none', fontSize: 14 }}>Dashboard</a>
          <a href="/alerts" style={{ color: DESIGN_TOKENS.COLOR_PRIMARY, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Alerts</a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: wsc }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsc, display: 'inline-block' }} />
            {ws === 'connected' ? 'Live' : ws}
          </span>
        </nav>
      </header>

      <main style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Clinical Alerts {total > 0 && <span style={{ marginLeft: 10, fontSize: 14, color: SUB, fontWeight: 400 }}>{total} total</span>}
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <Sel value={fStatus} onChange={(v) => { setFStatus(v as FS); setPage(1); }} opts={[{ v: 'open', l: 'Open' }, { v: 'acknowledged', l: 'Acknowledged' }, { v: 'resolved', l: 'Resolved' }, { v: 'all', l: 'All statuses' }]} />
            <Sel value={fSev} onChange={(v) => { setFSev(v as FSev); setPage(1); }} opts={[{ v: 'all', l: 'All severities' }, { v: 'critical', l: '🚨 Critical' }, { v: 'warning', l: '⚠️ Warning' }, { v: 'info', l: 'ℹ️ Info' }]} />
          </div>
        </div>

        <div style={{ background: '#1a0a0a', border: '1px solid #4a1010', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#fc8181' }}>
          🚨 Patient in crisis? Call 988 · Text HOME to 741741 · Veterans: 988 press 1
        </div>

        {loading ? (
          <div style={{ color: SUB, textAlign: 'center', padding: 48 }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ color: TEXT, fontSize: 16, fontWeight: 600 }}>No alerts</div>
            <div style={{ color: SUB, fontSize: 13, marginTop: 4 }}>{fStatus === 'open' ? 'All patients are stable.' : 'No alerts match your filters.'}</div>
          </div>
        ) : (
          <>
            {alerts.map((a) => <AlertCard key={a.id} alert={a} token={token} onRefresh={() => void fetch_()} />)}
            {total > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                <PBtn label="← Prev" disabled={page === 1} onClick={() => setPage((p) => p - 1)} />
                <span style={{ color: SUB, fontSize: 14, alignSelf: 'center' }}>Page {page}</span>
                <PBtn label="Next →" disabled={alerts.length < 20} onClick={() => setPage((p) => p + 1)} />
              </div>
            )}
          </>
        )}
      </main>
      <LiveToast alerts={liveAlerts} onDismiss={clearAlerts} />
    </div>
  );
}

function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: '#161a27', border: '1px solid #1e2535', borderRadius: 8, color: '#e2e8f0', padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function PBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: '#161a27', border: '1px solid #1e2535', borderRadius: 8, color: disabled ? '#4a5568' : '#e2e8f0', padding: '6px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {label}
    </button>
  );
}
