// =============================================================================
// MindLog API — WebSocket plugin
// Provides real-time alert delivery to clinician dashboard clients.
//
// Architecture:
//   - Each authenticated clinician WS connection subscribes to their org channel
//   - Rules engine publishes alert events to Redis pub/sub
//   - This plugin subscribes to Redis and fans out to all matching WS connections
//
// Channel naming:
//   mindlog:alerts:{orgId}          — all alerts for an org
//   mindlog:alerts:{orgId}:{userId} — targeted to a specific clinician
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { WS_EVENTS } from '@mindlog/shared';

// ---------------------------------------------------------------------------
// Redis clients — one for publish, one for subscribe
// (ioredis subscribers cannot issue other commands on the same connection)
// ---------------------------------------------------------------------------

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

const redisOpts = {
  host: new URL(config.redisUrl).hostname,
  port: Number(new URL(config.redisUrl).port || 6379),
  lazyConnect: true,
  maxRetriesPerRequest: null,
};

export function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(redisOpts);
  }
  return publisher;
}

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(redisOpts);
  }
  return subscriber;
}

// ---------------------------------------------------------------------------
// Alert publish helper — called by the rules engine and alert routes
// ---------------------------------------------------------------------------

export interface AlertEvent {
  alertId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  ruleKey: string;
  patientId?: string;
}

export async function publishAlert(
  patientId: string,
  orgId: string,
  event: AlertEvent,
): Promise<void> {
  const pub = getPublisher();
  const payload = JSON.stringify({ type: WS_EVENTS.ALERT_CREATED, data: { ...event, patientId } });
  await pub.publish(`mindlog:alerts:${orgId}`, payload);
}

export async function publishPatientStatusChange(
  patientId: string,
  orgId: string,
  status: string,
): Promise<void> {
  const pub = getPublisher();
  const payload = JSON.stringify({ type: WS_EVENTS.PATIENT_STATUS_CHANGED, data: { patientId, status } });
  await pub.publish(`mindlog:alerts:${orgId}`, payload);
}

// ---------------------------------------------------------------------------
// In-process connection registry
// Maps orgId → Set of active WebSocket connections
// ---------------------------------------------------------------------------

type WsConnection = {
  socket: import('ws').WebSocket;
  userId: string;
  orgId: string;
};

const connections = new Map<string, Set<WsConnection>>();

function addConnection(conn: WsConnection): void {
  let set = connections.get(conn.orgId);
  if (!set) {
    set = new Set();
    connections.set(conn.orgId, set);
  }
  set.add(conn);
}

function removeConnection(conn: WsConnection): void {
  connections.get(conn.orgId)?.delete(conn);
}

function broadcast(orgId: string, message: string): void {
  const set = connections.get(orgId);
  if (!set) return;
  for (const conn of set) {
    if (conn.socket.readyState === 1 /* OPEN */) {
      conn.socket.send(message);
    }
  }
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

async function websocketPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyWebSocket, {
    options: { maxPayload: 4096 },
  });

  // -----------------------------------------------------------------------
  // Subscribe to Redis and fan-out to WebSocket connections
  // -----------------------------------------------------------------------
  const sub = getSubscriber();
  await sub.connect();

  // Pattern subscribe to all org channels
  sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    // channel = mindlog:alerts:{orgId}
    const parts = channel.split(':');
    const orgId = parts[2];
    if (orgId) broadcast(orgId, message);
  });

  await sub.psubscribe('mindlog:alerts:*');

  // Connect publisher lazily
  await getPublisher().connect();

  // -----------------------------------------------------------------------
  // GET /ws — WebSocket upgrade endpoint (clinicians only)
  // -----------------------------------------------------------------------
  // Auth reads the JWT via extractToken (in auth.ts) which checks both the
  // Authorization: Bearer header and the ?token= query param — the latter is
  // required because browsers cannot set custom headers on WS upgrade requests.
  fastify.get(
    '/ws',
    { websocket: true, preHandler: [fastify.authenticate] },
    (socket, request) => {
      const user = request.user;

      // Only clinicians and admins get a real-time feed
      if (user.role === 'patient') {
        socket.close(1008, 'Patients do not receive real-time alerts');
        return;
      }

      const conn: WsConnection = { socket, userId: user.sub, orgId: user.org_id };
      addConnection(conn);

      fastify.log.info(`[ws] Clinician ${user.sub} connected (org ${user.org_id})`);

      // Acknowledge connection
      socket.send(JSON.stringify({ type: WS_EVENTS.PONG, data: { ts: Date.now() } }));

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string };
          if (msg.type === WS_EVENTS.PING) {
            socket.send(JSON.stringify({ type: WS_EVENTS.PONG, data: { ts: Date.now() } }));
          }
        } catch {
          // ignore malformed frames
        }
      });

      socket.on('close', () => {
        removeConnection(conn);
        fastify.log.info(`[ws] Clinician ${user.sub} disconnected`);
      });

      socket.on('error', (err) => {
        fastify.log.warn({ err }, '[ws] Socket error');
        removeConnection(conn);
      });
    },
  );

  // -----------------------------------------------------------------------
  // Graceful shutdown — close Redis connections
  // -----------------------------------------------------------------------
  fastify.addHook('onClose', async () => {
    await sub.punsubscribe();
    sub.disconnect();
    publisher?.disconnect();
  });
}

export default fp(websocketPlugin, { name: 'websocket-plugin' });
