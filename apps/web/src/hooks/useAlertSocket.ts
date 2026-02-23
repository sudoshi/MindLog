// =============================================================================
// MindLog Web — WebSocket hook for real-time alert feed
// Connects to GET /ws (upgraded to WebSocket by Fastify).
// Auto-reconnects with exponential backoff on disconnect.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_EVENTS } from '@mindlog/shared';

export interface LiveAlert {
  alertId: string;
  patientId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  ruleKey: string;
  ts: number; // client receipt timestamp
}

type OnAlertFn = (alert: LiveAlert) => void;
type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseAlertSocketOptions {
  token: string | null;
  onAlert?: OnAlertFn;
  enabled?: boolean;
}

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000';
const MAX_BACKOFF_MS = 30_000;

export function useAlertSocket({ token, onAlert, enabled = true }: UseAlertSocketOptions) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Store the callback in a ref so that updating onAlert never causes a
  // reconnect. The connect() useCallback only depends on token + enabled.
  const onAlertRef = useRef<OnAlertFn | undefined>(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  const connect = useCallback(() => {
    if (!token || !enabled || !mountedRef.current) return;

    setStatus('connecting');
    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setStatus('connected');
      backoffRef.current = 1000; // reset backoff on successful connection
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          data: Record<string, unknown>;
        };

        if (msg.type === WS_EVENTS.ALERT_CREATED) {
          const alert: LiveAlert = {
            alertId:   msg.data['alertId']   as string,
            patientId: msg.data['patientId'] as string,
            severity:  msg.data['severity']  as LiveAlert['severity'],
            title:     msg.data['title']     as string,
            ruleKey:   msg.data['ruleKey']   as string,
            ts: Date.now(),
          };
          setLiveAlerts((prev) => [alert, ...prev].slice(0, 50)); // keep last 50
          onAlertRef.current?.(alert); // read from ref — never stale, never reconnects
        }
        // PONG handled silently
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffRef.current);
    };

    ws.onerror = () => {
      setStatus('error');
      ws.close(); // triggers onclose → reconnect
    };
  }, [token, enabled]); // onAlert intentionally omitted — accessed via ref

  useEffect(() => {
    mountedRef.current = true;
    // Small delay to avoid React StrictMode double-mount race condition
    const connectTimer = setTimeout(() => {
      if (mountedRef.current) connect();
    }, 100);
    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      // Close silently — readyState 0 = CONNECTING, 1 = OPEN
      const ws = wsRef.current;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
        ws.onclose = null; // Prevent reconnect attempts during cleanup
        ws.onerror = null; // Suppress error logging during cleanup
        ws.close();
      }
    };
  }, [connect]);

  const clearAlerts = useCallback(() => setLiveAlerts([]), []);

  return { status, liveAlerts, clearAlerts };
}
