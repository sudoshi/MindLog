// =============================================================================
// MindLog API — Health check route
// GET /health  →  200 { status: 'ok', ... }
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@mindlog/db';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', { logLevel: 'silent' }, async (_request, reply) => {
    // Check DB connectivity
    let dbOk = false;
    try {
      await sql`SELECT 1`;
      dbOk = true;
    } catch {
      fastify.log.warn('Health check: DB unreachable');
    }

    const status = dbOk ? 'ok' : 'degraded';
    const httpStatus = dbOk ? 200 : 503;

    return reply.status(httpStatus).send({
      status,
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      db: dbOk ? 'connected' : 'unreachable',
    });
  });
}
