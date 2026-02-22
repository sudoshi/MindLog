// =============================================================================
// MindLog API — Auth plugin (Supabase JWT verification)
// Registers @fastify/jwt and decorates request with `request.user`.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';
import type { UserRole } from '@mindlog/shared';

// Extract JWT from Authorization: Bearer header OR ?token= query param.
// The query-param fallback is required for WebSocket upgrade requests because
// browsers cannot set custom headers on the WS handshake.
function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth && /^Bearer\s/i.test(auth)) {
    const parts = auth.split(' ');
    return parts.length === 2 ? parts[1] : null;
  }
  const q = request.query as Record<string, string | undefined>;
  return q['token'] ?? null;
}

export interface JwtPayload {
  sub: string; // user UUID
  email: string;
  role: UserRole;
  org_id: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtAccessExpiry,
    },
    // extractToken must live inside `verify` — that is the object @fastify/jwt
    // merges into lookupToken's options. A top-level extractToken is ignored.
    verify: { extractToken },
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify<JwtPayload>();
      } catch {
        await reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        });
      }
    },
  );

  fastify.decorate(
    'requireRole',
    (roles: UserRole[]) =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        await fastify.authenticate(request, reply);
        if (!roles.includes(request.user.role)) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Role '${request.user.role}' is not permitted to access this resource`,
            },
          });
        }
      },
  );
}

export default fp(authPlugin, { name: 'auth' });
