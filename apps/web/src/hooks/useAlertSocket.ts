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

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseAlertSocketOptions {
  token: string | null;
  onAlert?: (alert: LiveAlert) => void;
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
            alertId: msg.data['alertId'] as string,
            patientId: msg.data['patientId'] as string,
            severity: msg.data['severity'] as LiveAlert['severity'],
            title: msg.data['title'] as string,
            ruleKey: msg.data['ruleKey'] as string,
            ts: Date.now(),
          };
          setLiveAlerts((prev) => [alert, ...prev].slice(0, 50)); // keep last 50
          onAlert?.(alert);
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
  }, [token, enabled, onAlert]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clearAlerts = useCallback(() => setLiveAlerts([]), []);

  return { status, liveAlerts, clearAlerts };
}
