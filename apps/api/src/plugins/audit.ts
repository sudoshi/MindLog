// =============================================================================
// MindLog API — HIPAA Audit Logging Plugin
//
// Decorates Fastify with:
//   request.auditAccess(patientId, resourceType, resourceId?)
//   request.auditMutation(action, patientId, resourceType, resourceId?)
//
// Also installs an onResponse hook that automatically logs all clinician
// requests touching /patients/:id/* sub-resources.
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { auditLog, type AuditAction } from '../middleware/audit.js';

declare module 'fastify' {
  interface FastifyRequest {
    auditAccess(patientId: string, resourceType: string, resourceId?: string): Promise<void>;
    auditMutation(action: AuditAction, patientId: string | undefined, resourceType: string, resourceId?: string): Promise<void>;
  }
}

function methodToAction(method: string): AuditAction {
  switch (method.toUpperCase()) {
    case 'DELETE': return 'delete';
    case 'PUT': case 'PATCH': return 'update';
    case 'POST': return 'create';
    default: return 'read';
  }
}

async function auditPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('auditAccess', async function (
    this: FastifyRequest,
    patientId: string,
    resourceType: string,
    resourceId?: string,
  ): Promise<void> {
    if (!this.user) return;
    await auditLog({ actor: this.user, action: 'read', resourceType, resourceId, patientId, ipAddress: this.ip, userAgent: this.headers['user-agent'] });
  });

  fastify.decorateRequest('auditMutation', async function (
    this: FastifyRequest,
    action: AuditAction,
    patientId: string | undefined,
    resourceType: string,
    resourceId?: string,
  ): Promise<void> {
    if (!this.user) return;
    await auditLog({ actor: this.user, action, resourceType, resourceId, patientId, ipAddress: this.ip, userAgent: this.headers['user-agent'] });
  });

  // Automatic PHI-access hook for /patients/:id/* endpoints
  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.user?.sub) return;
    if (request.user.role !== 'clinician' && request.user.role !== 'admin') return;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;

    const url = request.url;
    const patientMatch = url.match(/\/patients\/([0-9a-f-]{36})\/?([^?]*)?/i);
    if (!patientMatch) return;

    const patientId   = patientMatch[1]!;
    const subResource = patientMatch[2]?.trim() || 'patient_record';
    const action      = methodToAction(request.method);

    await auditLog({
      actor: request.user, action, resourceType: subResource,
      patientId, ipAddress: request.ip, userAgent: request.headers['user-agent'],
    });
  });
}

export default fp(auditPlugin, { name: 'audit' });
