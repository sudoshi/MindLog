// =============================================================================
// MindLog Web — Clinical Alerts page (redesigned to match prototype)
// Filter chips (not dropdowns) + prototype alert item layout + no page header.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAlertSocket, type LiveAlert } from '../hooks/useAlertSocket.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  auto_resolved: 'Auto-resolved',
  escalated: 'Escalated',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

function fmtRelative(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// AlertCard
// ---------------------------------------------------------------------------

function AlertCard({ alert, token, onRefresh }: { alert: Alert; token: string | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const isOpen = alert.status === 'open' || alert.status === 'acknowledged';

  const act = async (ep: string, body?: object) => {
    setBusy(true);
    try {
      await api.patch(`/alerts/${alert.id}/${ep}`, body ?? {}, token ?? undefined);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const borderColor =
    alert.severity === 'critical' ? 'var(--critical)' :
    alert.severity === 'warning'  ? 'var(--warning)'  : 'var(--info)';

  const glowColor =
    alert.severity === 'critical' ? 'var(--critical-glow)' :
    alert.severity === 'warning'  ? 'var(--warning-glow)'  : 'var(--info-glow)';

  const bgColor =
    alert.severity === 'critical' ? 'rgba(255,77,109,0.07)' :
    alert.severity === 'warning'  ? 'rgba(245,158,11,0.05)' : 'var(--glass-01)';

  return (
    <div style={{
      background: bgColor,
      backdropFilter: 'blur(20px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      border: `1px solid ${alert.severity === 'critical' ? 'var(--critical-border)' : 'var(--border)'}`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 'var(--r-lg)',
      padding: '14px 18px',
      marginBottom: 10,
      boxShadow: `0 2px 16px rgba(0,0,0,0.3), 0 0 20px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      transition: 'all 0.15s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Severity badge */}
          <span style={{
            display: 'inline-block',
            background: `${borderColor}1a`,
            color: borderColor,
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1,
            padding: '2px 8px', borderRadius: 'var(--r-xs)', marginBottom: 6,
            border: `1px solid ${borderColor}40`,
          }}>
            {SEVERITY_ICON[alert.severity]} {alert.severity}
          </span>

          {/* Title */}
          <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
            {alert.title}
          </div>

          {/* Patient link */}
          {alert.patient_name && (
            <button
              onClick={() => navigate(`/patients/${alert.patient_id}`)}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--info)', fontSize: 12, cursor: 'pointer',
                textDecoration: 'underline', marginBottom: 4, display: 'block',
              }}
            >
              {alert.patient_name}
            </button>
          )}

          {/* Footer */}
          <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>
            {alert.rule_key} · {STATUS_LABEL[alert.status]} · {fmtRelative(alert.created_at)}
          </div>
        </div>

        {/* Action buttons */}
        {isOpen ? (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {alert.status === 'open' && (
              <button
                className="action-btn acknowledge"
                disabled={busy}
                onClick={() => void act('acknowledge')}
              >
                Acknowledge
              </button>
            )}
            <button
              className="action-btn resolve"
              disabled={busy}
              onClick={() => void act('resolve')}
            >
              Resolve
            </button>
            <button
              className="action-btn escalate"
              disabled={busy}
              onClick={() => void act('escalate', { note: 'Escalated via dashboard' })}
            >
              Escalate
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--ink-soft)', fontSize: 12, flexShrink: 0 }}>
            {STATUS_LABEL[alert.status]}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Toast
// ---------------------------------------------------------------------------

function LiveToast({ alerts, onDismiss }: { alerts: LiveAlert[]; onDismiss: () => void }) {
  if (alerts.length === 0) return null;
  const latest = alerts[0]!;
  const borderColor =
    latest.severity === 'critical' ? 'var(--critical)' :
    latest.severity === 'warning'  ? 'var(--warning)'  : 'var(--info)';

  return (
    <div className="live-toast" style={{ borderColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: borderColor, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
          {alerts.length > 1 ? `${alerts.length} new alerts` : 'New alert'}
        </span>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 18 }}
        >
          ×
        </button>
      </div>
      <div style={{ color: 'var(--ink)', fontSize: 13 }}>{latest.title}</div>
      <div style={{ color: 'var(--ink-soft)', fontSize: 11, marginTop: 4 }}>{latest.ruleKey}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

function FilterChip({
  label, active, variant, onClick,
}: {
  label: string;
  active: boolean;
  variant?: 'critical';
  onClick: () => void;
}) {
  return (
    <div
      className={`filter-chip${active ? ' active' : ''}${variant ? ` ${variant}` : ''}`}
      onClick={onClick}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page filter types
// ---------------------------------------------------------------------------

type FStatus = 'open' | 'acknowledged' | 'resolved' | 'all';
type FSev = 'critical' | 'warning' | 'info' | 'all';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function AlertsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState<FStatus>('open');
  const [fSev, setFSev] = useState<FSev>('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Counts per severity (for badge labels on filter chips)
  const critCount = alerts.filter((a) => a.severity === 'critical').length;
  const warnCount = alerts.filter((a) => a.severity === 'warning').length;
  const infoCount = alerts.filter((a) => a.severity === 'info').length;
  const unackCount = alerts.filter((a) => a.status === 'open').length;

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (fStatus !== 'all') p.set('status', fStatus);
      if (fSev !== 'all') p.set('severity', fSev);
      const d = await api.get<{ items: Alert[]; total: number }>(
        `/alerts?${p.toString()}`,
        token ?? undefined,
      );
      setAlerts(d.items);
      setTotal(d.total);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token, fStatus, fSev, page]);

  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);

  const { liveAlerts, clearAlerts } = useAlertSocket({
    token,
    onAlert: () => {
      if (fStatus === 'open' || fStatus === 'all') void fetchAlerts();
    },
  });

  return (
    <div className="view">
      {/* Filter bar */}
      <div style={{ padding: '0 24px' }}>
        <div className="filter-bar">
          <FilterChip
            label={`All alerts (${total})`}
            active={fStatus === 'all' && fSev === 'all'}
            onClick={() => { setFStatus('all'); setFSev('all'); setPage(1); }}
          />
          <FilterChip
            label={`Critical (${critCount})`}
            variant="critical"
            active={fSev === 'critical'}
            onClick={() => { setFSev(fSev === 'critical' ? 'all' : 'critical'); setPage(1); }}
          />
          <FilterChip
            label={`Warning (${warnCount})`}
            active={fSev === 'warning'}
            onClick={() => { setFSev(fSev === 'warning' ? 'all' : 'warning'); setPage(1); }}
          />
          <FilterChip
            label={`Info (${infoCount})`}
            active={fSev === 'info'}
            onClick={() => { setFSev(fSev === 'info' ? 'all' : 'info'); setPage(1); }}
          />
          <FilterChip
            label={`Unacknowledged (${unackCount})`}
            active={fStatus === 'open' && fSev === 'all'}
            onClick={() => {
              setFStatus(fStatus === 'open' ? 'all' : 'open');
              setFSev('all');
              setPage(1);
            }}
          />
          <FilterChip
            label="Resolved"
            active={fStatus === 'resolved'}
            onClick={() => { setFStatus(fStatus === 'resolved' ? 'all' : 'resolved'); setPage(1); }}
          />
        </div>
      </div>

      {/* Crisis banner */}
      <div style={{
        margin: '0 24px 16px',
        background: 'rgba(255,77,109,.06)',
        border: '1px solid var(--critical-border)',
        borderRadius: 'var(--r-sm)',
        padding: '8px 14px',
        fontSize: 12,
        color: 'var(--critical)',
      }}>
        🚨 Patient in crisis? Call <strong>988</strong> · Text HOME to <strong>741741</strong> · Veterans: 988 press 1
      </div>

      {/* Alert list */}
      <div style={{ padding: '0 24px 40px' }}>
        {loading ? (
          <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 48 }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="panel">
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <div className="empty-state-title">No alerts</div>
              {fStatus === 'open' ? 'All patients are stable.' : 'No alerts match your filters.'}
            </div>
          </div>
        ) : (
          <>
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                token={token}
                onRefresh={() => void fetchAlerts()}
              />
            ))}
            {total > 20 && (
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  ← Prev
                </button>
                <span className="page-info">Page {page} of {Math.ceil(total / 20)}</span>
                <button className="page-btn" disabled={alerts.length < 20} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <LiveToast alerts={liveAlerts} onDismiss={clearAlerts} />
    </div>
  );
}
