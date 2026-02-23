// =============================================================================
// MindLog API — Patient routes (clinician-facing)
// GET    /api/v1/patients              — list caseload
// GET    /api/v1/patients/:id          — patient detail
// PATCH  /api/v1/patients/:id          — update profile/status
// GET    /api/v1/patients/:id/caseload — today's caseload row (dashboard view)
// GET    /api/v1/patients/:id/mood-heatmap — 30-day heatmap
// POST   /api/v1/patients/:id/care-team    — add clinician to care team
// DELETE /api/v1/patients/:id/care-team/:clinicianId — remove from care team
//
// Patient self-management routes (patient-role) registered at /patients/me:
// GET/PATCH /patients/me, and /me/symptoms, /me/triggers, /me/strategies
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { PatientFilterSchema, UpdatePatientProfileSchema, UuidSchema } from '@mindlog/shared';
import { auditLog } from '../../middleware/audit.js';
import { publishPatientStatusChange } from '../../plugins/websocket.js';
import patientMeRoutes from './me.js';

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // Helper to check if current user is an admin (can access all patients)
  async function isAdminUser(userId: string): Promise<boolean> {
    const [clinician] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
    `;
    return clinician?.role === 'admin';
  }

  // Register /me sub-routes first — static prefix takes priority over /:id
  await fastify.register(patientMeRoutes, { prefix: '/me' });

  // ---------------------------------------------------------------------------
  // GET /patients — list clinician's caseload
  // ---------------------------------------------------------------------------
  fastify.get('/', auth, async (request, reply) => {
    const query = PatientFilterSchema.parse(request.query);
    const { org_id } = request.user;
    const limit = query.limit;
    const offset = (query.page - 1) * limit;

    const statusFilter = query.status ?? null;
    const searchFilter = query.search ? `%${query.search}%` : null;

    const patients = await sql<{
      id: string; first_name: string; last_name: string; mrn: string;
      status: string; risk_level: string; tracking_streak: number;
      last_checkin_at: string | null; primary_clinician_id: string | null;
    }[]>`
      SELECT p.id, p.first_name, p.last_name, p.mrn, p.status,
             p.risk_level, p.tracking_streak, p.last_checkin_at,
             (SELECT ctm2.clinician_id FROM care_team_members ctm2
              WHERE ctm2.patient_id = p.id AND ctm2.role = 'primary' AND ctm2.unassigned_at IS NULL
              LIMIT 1) AS primary_clinician_id
      FROM patients p
      JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
      WHERE p.organisation_id = ${org_id}
        AND p.is_active = TRUE
        AND ctm.clinician_id = ${request.user.sub}
        AND (${statusFilter}::TEXT IS NULL OR p.status = ${statusFilter})
        AND (${searchFilter}::TEXT IS NULL
             OR (p.first_name || ' ' || p.last_name) ILIKE ${searchFilter})
      ORDER BY
        CASE p.status WHEN 'crisis' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        p.last_name, p.first_name
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count
      FROM patients p
      JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
      WHERE p.organisation_id = ${org_id}
        AND p.is_active = TRUE
        AND ctm.clinician_id = ${request.user.sub}
        AND (${statusFilter}::TEXT IS NULL OR p.status = ${statusFilter})
        AND (${searchFilter}::TEXT IS NULL
             OR (p.first_name || ' ' || p.last_name) ILIKE ${searchFilter})
    `;

    const total = Number(count);
    return reply.send({
      success: true,
      data: {
        items: patients,
        total,
        page: query.page,
        limit,
        has_next: offset + patients.length < total,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /patients/:id — Admin can access any patient
  // ---------------------------------------------------------------------------
  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const isAdmin = await isAdminUser(request.user.sub);

    let patient;
    if (isAdmin) {
      // Admin can access any patient
      [patient] = await sql<{
        id: string; first_name: string; last_name: string; preferred_name: string | null;
        mrn: string; email: string | null; phone: string | null; date_of_birth: string;
        gender: string | null; status: string; risk_level: string; risk_reviewed_at: string | null;
        tracking_streak: number; longest_streak: number; last_checkin_at: string | null;
        onboarding_complete: boolean; app_installed: boolean; created_at: string;
      }[]>`
        SELECT p.id, p.first_name, p.last_name, p.preferred_name, p.mrn, p.email,
               p.phone, p.date_of_birth, p.gender, p.status, p.risk_level,
               p.risk_reviewed_at, p.tracking_streak, p.longest_streak,
               p.last_checkin_at, p.onboarding_complete, p.app_installed, p.created_at
        FROM patients p
        WHERE p.id = ${id}
          AND p.is_active = TRUE
        LIMIT 1
      `;
    } else {
      // Regular clinician - must be on care team
      [patient] = await sql<{
        id: string; first_name: string; last_name: string; preferred_name: string | null;
        mrn: string; email: string | null; phone: string | null; date_of_birth: string;
        gender: string | null; status: string; risk_level: string; risk_reviewed_at: string | null;
        tracking_streak: number; longest_streak: number; last_checkin_at: string | null;
        onboarding_complete: boolean; app_installed: boolean; created_at: string;
      }[]>`
        SELECT p.id, p.first_name, p.last_name, p.preferred_name, p.mrn, p.email,
               p.phone, p.date_of_birth, p.gender, p.status, p.risk_level,
               p.risk_reviewed_at, p.tracking_streak, p.longest_streak,
               p.last_checkin_at, p.onboarding_complete, p.app_installed, p.created_at
        FROM patients p
        JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
        WHERE p.id = ${id}
          AND p.organisation_id = ${request.user.org_id}
          AND p.is_active = TRUE
          AND ctm.clinician_id = ${request.user.sub}
        LIMIT 1
      `;
    }

    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    await auditLog({
      actor: request.user,
      action: 'read',
      resourceType: 'patients',
      resourceId: id,
      patientId: id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: patient });
  });

  // ---------------------------------------------------------------------------
  // PATCH /patients/:id — Admin can update any patient
  // ---------------------------------------------------------------------------
  fastify.patch('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const updates = UpdatePatientProfileSchema.parse(request.body);
    const isAdmin = await isAdminUser(request.user.sub);

    // Verify access - admin can access any, others need care team membership
    let hasAccess = false;
    if (isAdmin) {
      const [patient] = await sql<{ id: string }[]>`
        SELECT id FROM patients WHERE id = ${id} AND is_active = TRUE
      `;
      hasAccess = !!patient;
    } else {
      const [membership] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        JOIN patients p ON p.id = ctm.patient_id
        WHERE ctm.patient_id = ${id}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
          AND p.organisation_id = ${request.user.org_id}
          AND p.is_active = TRUE
      `;
      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    const [updated] = await sql<{
      id: string; first_name: string; last_name: string; status: string; risk_level: string;
    }[]>`
      UPDATE patients SET
        first_name       = COALESCE(${updates.first_name  ?? null}, first_name),
        last_name        = COALESCE(${updates.last_name   ?? null}, last_name),
        mrn              = COALESCE(${updates.mrn         ?? null}, mrn),
        status           = COALESCE(${updates.status      ?? null}, status),
        risk_level       = COALESCE(${updates.risk_level  ?? null}, risk_level),
        -- stamp reviewed_at whenever risk_level is explicitly supplied
        risk_reviewed_at = CASE WHEN ${updates.risk_level ?? null}::TEXT IS NOT NULL
                             THEN NOW() ELSE risk_reviewed_at END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, first_name, last_name, status, risk_level
    `;

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'patients',
      resourceId: id,
      patientId: id,
      newValues: updates as Record<string, unknown>,
      ipAddress: request.ip,
    });

    // Broadcast status change so other clinician sessions update live
    if (updates.status && updated) {
      void publishPatientStatusChange(id, request.user.org_id, updated.status);
    }

    return reply.send({ success: true, data: updated });
  });

  // ---------------------------------------------------------------------------
  // GET /patients/:id/caseload — today's caseload view row (admin sees any)
  // ---------------------------------------------------------------------------
  fastify.get('/:id/caseload', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const isAdmin = await isAdminUser(request.user.sub);

    let row;
    if (isAdmin) {
      [row] = await sql`
        SELECT * FROM v_caseload_today
        WHERE patient_id = ${id}
        LIMIT 1
      `;
    } else {
      [row] = await sql`
        SELECT * FROM v_caseload_today
        WHERE patient_id = ${id}
          AND clinician_id = ${request.user.sub}
        LIMIT 1
      `;
    }

    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found in your caseload' } });
    }

    return reply.send({ success: true, data: row });
  });

  // ---------------------------------------------------------------------------
  // GET /patients/:id/mood-heatmap — 30-day heatmap (admin sees any)
  // ---------------------------------------------------------------------------
  fastify.get('/:id/mood-heatmap', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const isAdmin = await isAdminUser(request.user.sub);

    // Verify access - admin can access any, others need care team membership
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        WHERE ctm.patient_id = ${id}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;

      if (!access) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      }
    }

    const rows = await sql`
      SELECT entry_date, mood, completion_pct, has_safety_flag
      FROM v_mood_heatmap_30d
      WHERE patient_id = ${id}
      ORDER BY entry_date ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /patients/:id/care-team — list active care team members
  // ---------------------------------------------------------------------------
  fastify.get('/:id/care-team', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);

    // Verify requester is on the care team or admin
    const [access] = await sql<{ id: string }[]>`
      SELECT ctm.id FROM care_team_members ctm
      WHERE ctm.patient_id   = ${id}
        AND ctm.clinician_id = ${request.user.sub}
        AND ctm.unassigned_at IS NULL
    `;
    if (!access && request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: "Not on this patient's care team" } });
    }

    const members = await sql<{
      clinician_id: string;
      first_name: string;
      last_name: string;
      title: string | null;
      clinician_role: string;
      care_team_role: string;
      email: string;
      assigned_at: string;
    }[]>`
      SELECT
        c.id         AS clinician_id,
        c.first_name, c.last_name, c.title,
        c.role       AS clinician_role,
        ctm.role     AS care_team_role,
        c.email,
        ctm.assigned_at
      FROM care_team_members ctm
      JOIN clinicians c ON c.id = ctm.clinician_id
      WHERE ctm.patient_id = ${id}
        AND ctm.unassigned_at IS NULL
      ORDER BY
        CASE ctm.role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,
        ctm.assigned_at ASC
    `;

    return reply.send({ success: true, data: members });
  });

  // ---------------------------------------------------------------------------
  // POST /patients/:id/care-team — add clinician to care team
  // ---------------------------------------------------------------------------
  fastify.post('/:id/care-team', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const body = z.object({
      clinician_id: UuidSchema,
      role: z.enum(['primary', 'secondary', 'covering', 'supervisor', 'researcher']),
    }).parse(request.body);

    // Verify patient is in the requester's org
    const [patient] = await sql<{ id: string }[]>`
      SELECT id FROM patients WHERE id = ${id} AND organisation_id = ${request.user.org_id} AND is_active = TRUE
    `;
    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    const [member] = await sql<{ id: string }[]>`
      INSERT INTO care_team_members (patient_id, clinician_id, role)
      VALUES (${id}, ${body.clinician_id}, ${body.role})
      ON CONFLICT (patient_id, clinician_id, role) DO UPDATE SET unassigned_at = NULL
      RETURNING id
    `;

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'care_team_members',
      resourceId: member?.id,
      patientId: id,
      newValues: body as Record<string, unknown>,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ success: true, data: { id: member?.id } });
  });

  // ---------------------------------------------------------------------------
  // DELETE /patients/:id/care-team/:clinicianId
  // ---------------------------------------------------------------------------
  fastify.delete('/:id/care-team/:clinicianId', auth, async (request, reply) => {
    const { id, clinicianId } = z.object({ id: UuidSchema, clinicianId: UuidSchema }).parse(request.params);

    await sql`
      UPDATE care_team_members SET unassigned_at = NOW()
      WHERE patient_id = ${id} AND clinician_id = ${clinicianId} AND unassigned_at IS NULL
    `;

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'care_team_members',
      patientId: id,
      newValues: { removed_clinician_id: clinicianId },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { message: 'Removed from care team' } });
  });
}
