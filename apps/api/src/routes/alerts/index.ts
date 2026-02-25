// =============================================================================
// MindLog API — Clinical alert routes (clinician-facing)
// GET   /api/v1/alerts                     — list org alerts (filtered)
// GET   /api/v1/alerts/:id                 — get single alert
// PATCH /api/v1/alerts/:id/acknowledge     — acknowledge alert
// PATCH /api/v1/alerts/:id/resolve         — resolve alert
// PATCH /api/v1/alerts/:id/escalate        — escalate to another clinician
// GET   /api/v1/alerts/patients/:patientId — alerts for a specific patient
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { AlertFilterSchema, UuidSchema } from '@mindlog/shared';
import { auditLog } from '../../middleware/audit.js';

export default async function alertRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // Helper to check if current user is an admin
  async function isAdminUser(userId: string): Promise<boolean> {
    const [clinician] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
    `;
    return clinician?.role === 'admin';
  }

  // ---------------------------------------------------------------------------
  // GET /alerts — list with filtering (admin sees all)
  // ---------------------------------------------------------------------------
  fastify.get('/', clinicianOnly, async (request, reply) => {
    const query = AlertFilterSchema.parse(request.query);
    const { org_id } = request.user;
    const limit = query.limit;
    const offset = (query.page - 1) * limit;
    const isAdmin = await isAdminUser(request.user.sub);

    const statusFilter = query.status ?? null;
    const severityFilter = query.severity ?? null;
    const patientIdFilter = query.patient_id ?? null;

    let alerts;
    let countResult;

    if (isAdmin) {
      // Admin sees ALL alerts across all organizations
      alerts = await sql<{
        id: string; patient_id: string; alert_type: string; severity: string;
        title: string; body: string; rule_key: string | null;
        created_at: string; acknowledged_at: string | null; resolved_at: string | null;
        patient_first_name: string; patient_last_name: string;
      }[]>`
        SELECT ca.id, ca.patient_id, ca.alert_type, ca.severity, ca.title, ca.body,
               ca.rule_key, ca.rule_context AS detail, ca.created_at, ca.acknowledged_at,
               ca.auto_resolved_at AS resolved_at,
               p.first_name || ' ' || p.last_name AS patient_name,
               p.first_name AS patient_first_name, p.last_name AS patient_last_name,
               CASE
                 WHEN ca.auto_resolved = TRUE THEN 'resolved'
                 WHEN ca.escalated_at IS NOT NULL THEN 'escalated'
                 WHEN ca.acknowledged_at IS NOT NULL THEN 'acknowledged'
                 ELSE 'new'
               END AS status
        FROM clinical_alerts ca
        JOIN patients p ON p.id = ca.patient_id
        WHERE (${statusFilter}::TEXT IS NULL OR (
            CASE ${statusFilter}
              WHEN 'acknowledged' THEN ca.acknowledged_at IS NOT NULL AND ca.auto_resolved = FALSE
              WHEN 'resolved'     THEN ca.auto_resolved = TRUE
              WHEN 'new'          THEN ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE
              ELSE TRUE
            END
          ))
          AND (${statusFilter}::TEXT IS NOT NULL OR ca.auto_resolved = FALSE)
          AND (${severityFilter}::TEXT IS NULL OR ca.severity = ${severityFilter})
          AND (${patientIdFilter}::UUID IS NULL OR ca.patient_id = ${patientIdFilter}::UUID)
        ORDER BY
          CASE ca.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          ca.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      [countResult] = await sql<{ count: string }[]>`
        SELECT COUNT(*) AS count
        FROM clinical_alerts ca
        WHERE (${statusFilter}::TEXT IS NULL OR (
            CASE ${statusFilter}
              WHEN 'acknowledged' THEN ca.acknowledged_at IS NOT NULL AND ca.auto_resolved = FALSE
              WHEN 'resolved'     THEN ca.auto_resolved = TRUE
              WHEN 'new'          THEN ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE
              ELSE TRUE
            END
          ))
          AND (${statusFilter}::TEXT IS NOT NULL OR ca.auto_resolved = FALSE)
          AND (${severityFilter}::TEXT IS NULL OR ca.severity = ${severityFilter})
          AND (${patientIdFilter}::UUID IS NULL OR ca.patient_id = ${patientIdFilter}::UUID)
      `;
    } else {
      // Regular clinician - only see alerts for patients on their care team
      alerts = await sql<{
        id: string; patient_id: string; alert_type: string; severity: string;
        title: string; body: string; rule_key: string | null;
        created_at: string; acknowledged_at: string | null; resolved_at: string | null;
        patient_first_name: string; patient_last_name: string;
      }[]>`
        SELECT ca.id, ca.patient_id, ca.alert_type, ca.severity, ca.title, ca.body,
               ca.rule_key, ca.rule_context AS detail, ca.created_at, ca.acknowledged_at,
               ca.auto_resolved_at AS resolved_at,
               p.first_name || ' ' || p.last_name AS patient_name,
               p.first_name AS patient_first_name, p.last_name AS patient_last_name,
               CASE
                 WHEN ca.auto_resolved = TRUE THEN 'resolved'
                 WHEN ca.escalated_at IS NOT NULL THEN 'escalated'
                 WHEN ca.acknowledged_at IS NOT NULL THEN 'acknowledged'
                 ELSE 'new'
               END AS status
        FROM clinical_alerts ca
        JOIN patients p ON p.id = ca.patient_id
        JOIN care_team_members ctm ON ctm.patient_id = ca.patient_id AND ctm.unassigned_at IS NULL
        WHERE ca.organisation_id = ${org_id}
          AND ctm.clinician_id = ${request.user.sub}
          AND (${statusFilter}::TEXT IS NULL OR (
            CASE ${statusFilter}
              WHEN 'acknowledged' THEN ca.acknowledged_at IS NOT NULL AND ca.auto_resolved = FALSE
              WHEN 'resolved'     THEN ca.auto_resolved = TRUE
              WHEN 'new'          THEN ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE
              ELSE TRUE
            END
          ))
          AND (${statusFilter}::TEXT IS NOT NULL OR ca.auto_resolved = FALSE)
          AND (${severityFilter}::TEXT IS NULL OR ca.severity = ${severityFilter})
          AND (${patientIdFilter}::UUID IS NULL OR ca.patient_id = ${patientIdFilter}::UUID)
        ORDER BY
          CASE ca.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          ca.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      [countResult] = await sql<{ count: string }[]>`
        SELECT COUNT(*) AS count
        FROM clinical_alerts ca
        JOIN care_team_members ctm ON ctm.patient_id = ca.patient_id AND ctm.unassigned_at IS NULL
        WHERE ca.organisation_id = ${org_id}
          AND ctm.clinician_id = ${request.user.sub}
          AND (${statusFilter}::TEXT IS NULL OR (
            CASE ${statusFilter}
              WHEN 'acknowledged' THEN ca.acknowledged_at IS NOT NULL AND ca.auto_resolved = FALSE
              WHEN 'resolved'     THEN ca.auto_resolved = TRUE
              WHEN 'new'          THEN ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE
              ELSE TRUE
            END
          ))
          AND (${statusFilter}::TEXT IS NOT NULL OR ca.auto_resolved = FALSE)
          AND (${severityFilter}::TEXT IS NULL OR ca.severity = ${severityFilter})
          AND (${patientIdFilter}::UUID IS NULL OR ca.patient_id = ${patientIdFilter}::UUID)
      `;
    }

    const total = Number(countResult?.count ?? 0);
    return reply.send({
      success: true,
      data: { items: alerts, total, page: query.page, limit, has_next: offset + alerts.length < total },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /alerts/patients/:patientId — alerts for a specific patient (admin sees any)
  // ---------------------------------------------------------------------------
  fastify.get('/patients/:patientId', clinicianOnly, async (request, reply) => {
    const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
    const query = AlertFilterSchema.parse(request.query);
    const limit = query.limit;
    const offset = (query.page - 1) * limit;
    const isAdmin = await isAdminUser(request.user.sub);

    // Verify access - admin can access any, others need care team membership
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        WHERE ctm.patient_id = ${patientId}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;
      if (!access) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
      }
    }

    const alerts = await sql`
      SELECT id, alert_type, severity, title, body, rule_key,
             created_at, acknowledged_at, acknowledged_by, acknowledgement_note,
             escalated_to, escalated_at, auto_resolved, auto_resolved_at
      FROM clinical_alerts
      WHERE patient_id = ${patientId}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [_countRow] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM clinical_alerts WHERE patient_id = ${patientId}
    `;
    const count = _countRow?.count ?? '0';

    return reply.send({
      success: true,
      data: { items: alerts, total: Number(count), page: query.page, limit, has_next: offset + alerts.length < Number(count) },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /alerts/:id (admin sees any; clinician must be on care team)
  // ---------------------------------------------------------------------------
  fastify.get('/:id', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const isAdmin = await isAdminUser(request.user.sub);

    let alert;
    if (isAdmin) {
      [alert] = await sql`
        SELECT ca.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
               p.mrn AS patient_mrn, p.status AS patient_status
        FROM clinical_alerts ca
        JOIN patients p ON p.id = ca.patient_id
        WHERE ca.id = ${id}
          AND ca.organisation_id = ${request.user.org_id}
        LIMIT 1
      `;
    } else {
      [alert] = await sql`
        SELECT ca.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
               p.mrn AS patient_mrn, p.status AS patient_status
        FROM clinical_alerts ca
        JOIN patients p ON p.id = ca.patient_id
        JOIN care_team_members ctm ON ctm.patient_id = ca.patient_id AND ctm.unassigned_at IS NULL
        WHERE ca.id = ${id}
          AND ca.organisation_id = ${request.user.org_id}
          AND ctm.clinician_id = ${request.user.sub}
        LIMIT 1
      `;
    }

    if (!alert) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    return reply.send({ success: true, data: alert });
  });

  // ---------------------------------------------------------------------------
  // PATCH /alerts/:id/acknowledge (care team check for non-admin)
  // ---------------------------------------------------------------------------
  fastify.patch('/:id/acknowledge', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const { note } = z.object({ note: z.string().max(1000).optional() }).parse(request.body ?? {});

    // Care team pre-check (admin bypasses)
    const isAdmin = await isAdminUser(request.user.sub);
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        JOIN clinical_alerts ca ON ca.patient_id = ctm.patient_id
        WHERE ca.id = ${id}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;
      if (!access) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
      }
    }

    const [alert] = await sql<{ id: string; patient_id: string; acknowledged_at: string | null }[]>`
      UPDATE clinical_alerts
      SET acknowledged_by = ${request.user.sub}::UUID,
          acknowledged_at = COALESCE(acknowledged_at, NOW()),
          acknowledgement_note = COALESCE(${note ?? null}, acknowledgement_note)
      WHERE id = ${id}
        AND organisation_id = ${request.user.org_id}
      RETURNING id, patient_id, acknowledged_at
    `;

    if (!alert) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    await auditLog({
      actor: request.user,
      action: 'acknowledge',
      resourceType: 'clinical_alerts',
      resourceId: id,
      patientId: alert.patient_id,
      newValues: { note },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { id: alert.id, acknowledged_at: alert.acknowledged_at } });
  });

  // ---------------------------------------------------------------------------
  // PATCH /alerts/:id/resolve (care team check for non-admin)
  // ---------------------------------------------------------------------------
  fastify.patch('/:id/resolve', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);

    // Care team pre-check (admin bypasses)
    const isAdmin = await isAdminUser(request.user.sub);
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        JOIN clinical_alerts ca ON ca.patient_id = ctm.patient_id
        WHERE ca.id = ${id}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;
      if (!access) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
      }
    }

    const [alert] = await sql<{ id: string; patient_id: string }[]>`
      UPDATE clinical_alerts
      SET auto_resolved = TRUE,
          auto_resolved_at = NOW(),
          acknowledged_by = COALESCE(acknowledged_by, ${request.user.sub}::UUID),
          acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE id = ${id} AND organisation_id = ${request.user.org_id}
      RETURNING id, patient_id
    `;

    if (!alert) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'clinical_alerts',
      resourceId: id,
      patientId: alert.patient_id,
      newValues: { resolved: true },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { id: alert.id, resolved: true } });
  });

  // ---------------------------------------------------------------------------
  // PATCH /alerts/:id/escalate (care team check for non-admin)
  // ---------------------------------------------------------------------------
  fastify.patch('/:id/escalate', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const { escalate_to_clinician_id } = z.object({ escalate_to_clinician_id: UuidSchema }).parse(request.body);

    // Care team pre-check (admin bypasses)
    const isAdmin = await isAdminUser(request.user.sub);
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        JOIN clinical_alerts ca ON ca.patient_id = ctm.patient_id
        WHERE ca.id = ${id}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;
      if (!access) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
      }
    }

    const [alert] = await sql<{ id: string; patient_id: string }[]>`
      UPDATE clinical_alerts
      SET escalated_to = ${escalate_to_clinician_id}::UUID,
          escalated_at = NOW(),
          acknowledged_by = COALESCE(acknowledged_by, ${request.user.sub}::UUID),
          acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE id = ${id} AND organisation_id = ${request.user.org_id}
      RETURNING id, patient_id
    `;

    if (!alert) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'clinical_alerts',
      resourceId: id,
      patientId: alert.patient_id,
      newValues: { escalated_to: escalate_to_clinician_id },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { id: alert.id, escalated_to: escalate_to_clinician_id } });
  });
}
