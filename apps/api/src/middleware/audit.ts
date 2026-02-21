// =============================================================================
// MindLog API — Audit logging middleware
// Call auditLog() inside route handlers for HIPAA audit trail.
// =============================================================================

import { sql } from '@mindlog/db';
import type { JwtPayload } from '../plugins/auth.js';

export type AuditAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'share'
  | 'acknowledge'
  | 'login'
  | 'logout'
  | 'consent_granted'
  | 'consent_revoked';

interface AuditLogParams {
  actor: JwtPayload;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  success?: boolean;
  failureReason?: string;
}

/**
 * Write an entry to the HIPAA audit_log table.
 * Fire-and-forget — errors are swallowed to avoid disrupting the primary operation.
 * Critical failures should be caught by log monitoring (Pino → CloudWatch/Datadog).
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_log (
        organisation_id, actor_type, actor_id,
        action, resource_type, resource_id, patient_id,
        ip_address, user_agent,
        old_values, new_values,
        success, failure_reason
      ) VALUES (
        ${params.actor.org_id},
        ${params.actor.role === 'admin' ? 'admin' : params.actor.role},
        ${params.actor.sub},
        ${params.action},
        ${params.resourceType},
        ${params.resourceId ?? null},
        ${params.patientId ?? null},
        ${params.ipAddress ?? null},
        ${params.userAgent ?? null},
        ${params.oldValues ? JSON.stringify(params.oldValues) : null},
        ${params.newValues ? JSON.stringify(params.newValues) : null},
        ${params.success ?? true},
        ${params.failureReason ?? null}
      )
    `;
  } catch {
    // Log failure to pino — do not surface to caller
    console.error('[audit] Failed to write audit log entry');
  }
}
