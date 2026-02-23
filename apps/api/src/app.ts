// =============================================================================
// MindLog API — Fastify application factory
// Separated from server.ts to enable testing without starting a server.
// =============================================================================

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import auditPlugin from './plugins/audit.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import websocketPlugin from './plugins/websocket.js';
import notificationsPlugin from './plugins/notifications.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.isDev ? 'debug' : 'info',
      // Pino pretty-print in development
      ...(config.isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {
            // Production: redact PHI fields from structured logs
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.access_token',
                'req.body.refresh_token',
                'req.body.email',
              ],
              censor: '[Redacted]',
            },
          }),
    },
    // Trust X-Forwarded-For in production (behind load balancer)
    trustProxy: config.isProd,
  });

  // ------------------------------------------------------------------
  // Security headers
  // ------------------------------------------------------------------
  await fastify.register(fastifyHelmet, {
    // Enable HSTS in production (1 year, include subdomains)
    hsts: config.isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Prevent MIME type sniffing
    noSniff: true,
    // Deny all framing (clickjacking protection)
    frameguard: { action: 'deny' },
    // Disable X-Powered-By
    hidePoweredBy: true,
    contentSecurityPolicy: false, // CSP applied at nginx / CDN level
    // Referrer policy — no PHI in referer headers
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await fastify.register(fastifyCors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ------------------------------------------------------------------
  // Global rate limiting
  // ------------------------------------------------------------------
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    // Skip rate-limiting for WebSocket upgrade requests — the WS client may
    // retry rapidly on reconnect and the upgrade itself is auth-gated anyway.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowList: (request: any) =>
      (request.headers as Record<string, string>)['upgrade'] === 'websocket',
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Retry after ${String(context.after)}.`,
      },
    }),
  });

  // ------------------------------------------------------------------
  // Plugins
  // ------------------------------------------------------------------
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(auditPlugin);
  await fastify.register(websocketPlugin);
  await fastify.register(notificationsPlugin);

  // ------------------------------------------------------------------
  // Routes
  // ------------------------------------------------------------------
  await registerRoutes(fastify);

  return fastify;
}
