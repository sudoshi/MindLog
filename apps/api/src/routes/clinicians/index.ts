// =============================================================================
// MindLog API — Clinician routes
// GET  /api/v1/clinicians/caseload      — today's full caseload view
// GET  /api/v1/clinicians/snapshot      — population snapshot (dashboard KPIs)
// POST /api/v1/clinicians/notes/:patientId      — create note on patient
// GET  /api/v1/clinicians/notes/:patientId      — list notes on patient
// GET  /api/v1/clinicians               — list all clinicians in org (admin)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { CreateClinicianNoteSchema, UuidSchema, PaginationSchema } from '@mindlog/shared';
import { auditLog } from '../../middleware/audit.js';

export default async function clinicianRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ---------------------------------------------------------------------------
  // GET /clinicians/caseload — full caseload for today (from pre-aggregated view)
  // ---------------------------------------------------------------------------
  fastify.get('/caseload', clinicianOnly, async (request, reply) => {
    const rows = await sql`
      SELECT *
      FROM v_caseload_today
      WHERE clinician_id = ${request.user.sub}
      ORDER BY
        CASE status WHEN 'crisis' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        unacknowledged_alert_count DESC,
        last_name, first_name
    `;

    return reply.send({ success: true, data: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians/snapshot — population KPI snapshot for the dashboard
  // ---------------------------------------------------------------------------
  fastify.get('/snapshot', clinicianOnly, async (request, reply) => {
    // Try clinician-specific snapshot first (OQ-010), fall back to org-wide
    const [snapshot] = await sql`
      SELECT *
      FROM population_snapshots
      WHERE clinician_id = ${request.user.sub}::UUID
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    if (!snapshot) {
      // Return live counts if no snapshot exists yet
      const [live] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE p.status = 'active')  AS active_patients,
          COUNT(*) FILTER (WHERE p.status = 'crisis')  AS crisis_patients,
          COUNT(*) AS total_patients
        FROM patients p
        JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
        WHERE p.organisation_id = ${request.user.org_id}
          AND p.is_active = TRUE
          AND ctm.clinician_id = ${request.user.sub}
      `;
      return reply.send({ success: true, data: { ...live, snapshot_date: null, is_live: true } });
    }

    return reply.send({ success: true, data: { ...snapshot, is_live: false } });
  });

  // ---------------------------------------------------------------------------
  // POST /clinicians/notes/:patientId — create a clinical note
  // ---------------------------------------------------------------------------
  fastify.post('/notes/:patientId', clinicianOnly, async (request, reply) => {
    const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
    const body = CreateClinicianNoteSchema.parse(request.body);
    const noteType = (request.body as { note_type?: string }).note_type ?? 'observation';

    // Verify care team access
    const [access] = await sql<{ id: string }[]>`
      SELECT ctm.id FROM care_team_members ctm
      WHERE ctm.patient_id = ${patientId}
        AND ctm.clinician_id = ${request.user.sub}
        AND ctm.unassigned_at IS NULL
    `;
    if (!access) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
    }

    const validNoteType = ['observation', 'intervention', 'appointment_summary', 'risk_assessment', 'handover', 'custom'].includes(noteType)
      ? noteType
      : 'observation';

    const [note] = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, is_private)
      VALUES (${patientId}, ${request.user.sub}, ${validNoteType}, ${body.body}, ${body.is_private ?? false})
      RETURNING id, created_at
    `;

    await auditLog({
      actor: request.user,
      action: 'create',
      resourceType: 'clinician_notes',
      resourceId: note?.id,
      patientId,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ success: true, data: note });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians/notes/:patientId — list notes on a patient
  // ---------------------------------------------------------------------------
  fastify.get('/notes/:patientId', clinicianOnly, async (request, reply) => {
    const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
    const query = PaginationSchema.parse(request.query);
    const limit = query.limit;
    const offset = (query.page - 1) * limit;

    // Verify care team access
    const [access] = await sql<{ id: string }[]>`
      SELECT ctm.id FROM care_team_members ctm
      WHERE ctm.patient_id = ${patientId}
        AND ctm.clinician_id = ${request.user.sub}
        AND ctm.unassigned_at IS NULL
    `;
    if (!access) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
    }

    const notes = await sql<{
      id: string; note_type: string; body: string; is_private: boolean;
      clinician_id: string; created_at: string;
    }[]>`
      SELECT cn.id, cn.note_type, cn.body, cn.is_private, cn.clinician_id,
             c.first_name AS clinician_first_name, c.last_name AS clinician_last_name,
             cn.created_at
      FROM clinician_notes cn
      JOIN clinicians c ON c.id = cn.clinician_id
      WHERE cn.patient_id = ${patientId}
        AND cn.deleted_at IS NULL
        AND (cn.is_private = FALSE OR cn.clinician_id = ${request.user.sub}::UUID)
      ORDER BY cn.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM clinician_notes
      WHERE patient_id = ${patientId}
        AND deleted_at IS NULL
        AND (is_private = FALSE OR clinician_id = ${request.user.sub}::UUID)
    `;

    await auditLog({
      actor: request.user,
      action: 'read',
      resourceType: 'clinician_notes',
      patientId,
      ipAddress: request.ip,
    });

    const total = Number(count);
    return reply.send({
      success: true,
      data: { items: notes, total, page: query.page, limit, has_next: offset + notes.length < total },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians — list org clinicians (admin only)
  // ---------------------------------------------------------------------------
  fastify.get('/', { preHandler: [fastify.requireRole(['admin'])] }, async (request, reply) => {
    const clinicians = await sql`
      SELECT id, first_name, last_name, title, role, npi, email, is_active, last_login_at
      FROM clinicians
      WHERE organisation_id = ${request.user.org_id}
      ORDER BY last_name, first_name
    `;
    return reply.send({ success: true, data: clinicians });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians/me — alias (same as /auth/me but under this prefix)
  // ---------------------------------------------------------------------------
  fastify.get('/me', auth, async (request, reply) => {
    const [clinician] = await sql`
      SELECT id, first_name, last_name, title, role, npi, email, mfa_enabled, last_login_at
      FROM clinicians
      WHERE email = ${request.user.email} AND is_active = TRUE
      LIMIT 1
    `;

    if (!clinician) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Clinician not found' } });
    }

    return reply.send({ success: true, data: clinician });
  });
}
