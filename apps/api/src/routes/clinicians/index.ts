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
  // Admin users see ALL patients across all organizations.
  // ---------------------------------------------------------------------------
  fastify.get('/caseload', clinicianOnly, async (request, reply) => {
    // Check if user is admin (either from clinicians.role or special admin login)
    const [clinician] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${request.user.sub}::UUID LIMIT 1
    `;
    const isAdmin = clinician?.role === 'admin';

    let rows;
    if (isAdmin) {
      // Admin sees ALL patients across all organizations
      rows = await sql`
        SELECT DISTINCT ON (patient_id)
          v.patient_id, v.mrn, v.first_name, v.last_name, v.date_of_birth,
          v.gender, v.status, v.risk_level, v.tracking_streak, v.last_checkin_at,
          v.clinician_id, v.care_team_role,
          v.todays_entry_id, v.todays_mood, v.todays_coping, v.todays_completion_pct,
          v.todays_submitted_at, v.todays_sleep_minutes, v.todays_exercise_minutes,
          v.unacknowledged_alert_count, v.highest_alert_severity
        FROM v_caseload_today v
        ORDER BY
          patient_id,
          CASE v.status WHEN 'crisis' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
          v.unacknowledged_alert_count DESC,
          v.last_name, v.first_name
      `;
    } else {
      // Regular clinician sees only their assigned patients
      rows = await sql`
        SELECT *
        FROM v_caseload_today
        WHERE clinician_id = ${request.user.sub}
        ORDER BY
          CASE status WHEN 'crisis' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
          unacknowledged_alert_count DESC,
          last_name, first_name
      `;
    }

    return reply.send({ success: true, data: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians/snapshot — population KPI snapshot for the dashboard
  // Admin users see ALL patients across all organizations.
  // ---------------------------------------------------------------------------
  fastify.get('/snapshot', clinicianOnly, async (request, reply) => {
    // Check if user is admin
    const [clinician] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${request.user.sub}::UUID LIMIT 1
    `;
    const isAdmin = clinician?.role === 'admin';

    // Try clinician-specific snapshot first (OQ-010), fall back to org-wide
    const [snapshot] = await sql`
      SELECT *
      FROM population_snapshots
      WHERE clinician_id = ${request.user.sub}::UUID
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    if (!snapshot) {
      // Return live counts if no snapshot exists yet (3 queries in parallel)
      const [[live], [alertCounts], [moodStats]] = await Promise.all([
        isAdmin
          ? sql`
              SELECT
                COUNT(*) FILTER (WHERE p.status = 'active')  AS active_patients,
                COUNT(*) FILTER (WHERE p.status = 'crisis')  AS crisis_patients,
                COUNT(*)                                      AS total_patients
              FROM patients p
              WHERE p.is_active = TRUE
            `
          : sql`
              SELECT
                COUNT(*) FILTER (WHERE p.status = 'active')  AS active_patients,
                COUNT(*) FILTER (WHERE p.status = 'crisis')  AS crisis_patients,
                COUNT(*)                                      AS total_patients
              FROM patients p
              JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
              WHERE p.organisation_id = ${request.user.org_id}
                AND p.is_active = TRUE
                AND ctm.clinician_id = ${request.user.sub}
            `,
        isAdmin
          ? sql`
              SELECT
                COUNT(*) FILTER (WHERE ca.severity = 'critical'
                  AND ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE) AS critical_alerts_count,
                COUNT(*) FILTER (WHERE ca.severity = 'warning'
                  AND ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE) AS warning_alerts_count
              FROM clinical_alerts ca
            `
          : sql`
              SELECT
                COUNT(*) FILTER (WHERE ca.severity = 'critical'
                  AND ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE) AS critical_alerts_count,
                COUNT(*) FILTER (WHERE ca.severity = 'warning'
                  AND ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE) AS warning_alerts_count
              FROM clinical_alerts ca
              JOIN care_team_members ctm ON ctm.patient_id = ca.patient_id AND ctm.unassigned_at IS NULL
              WHERE ca.organisation_id = ${request.user.org_id}
                AND ctm.clinician_id   = ${request.user.sub}
            `,
        isAdmin
          ? sql`
              SELECT
                ROUND(AVG(de.mood) * 10) AS avg_mood_x10,
                ROUND(
                  100.0 * COUNT(de.id) FILTER (WHERE de.mood IS NOT NULL)
                  / NULLIF(COUNT(DISTINCT p.id), 0)
                ) AS checkin_rate_pct
              FROM patients p
              LEFT JOIN daily_entries de
                ON  de.patient_id  = p.id
                AND de.entry_date  = CURRENT_DATE
                AND de.submitted_at IS NOT NULL
              WHERE p.is_active = TRUE
            `
          : sql`
              SELECT
                ROUND(AVG(de.mood) * 10) AS avg_mood_x10,
                ROUND(
                  100.0 * COUNT(de.id) FILTER (WHERE de.mood IS NOT NULL)
                  / NULLIF(COUNT(DISTINCT p.id), 0)
                ) AS checkin_rate_pct
              FROM patients p
              JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
              LEFT JOIN daily_entries de
                ON  de.patient_id  = p.id
                AND de.entry_date  = CURRENT_DATE
                AND de.submitted_at IS NOT NULL
              WHERE p.organisation_id = ${request.user.org_id}
                AND p.is_active       = TRUE
                AND ctm.clinician_id  = ${request.user.sub}
            `,
      ]);
      return reply.send({
        success: true,
        data: {
          ...live,
          critical_alerts_count: Number(alertCounts?.critical_alerts_count ?? 0),
          warning_alerts_count:  Number(alertCounts?.warning_alerts_count  ?? 0),
          avg_mood_x10:          moodStats?.avg_mood_x10     != null ? Number(moodStats.avg_mood_x10)     : null,
          checkin_rate_pct:      moodStats?.checkin_rate_pct  != null ? Number(moodStats.checkin_rate_pct)  : null,
          snapshot_date: null,
          is_live: true,
        },
      });
    }

    return reply.send({ success: true, data: { ...snapshot, is_live: false } });
  });

  // ---------------------------------------------------------------------------
  // GET /clinicians/snapshot-history — last N daily snapshots for trend charts
  // ---------------------------------------------------------------------------
  fastify.get('/snapshot-history', clinicianOnly, async (request, reply) => {
    const { days } = z.object({
      days: z.coerce.number().int().min(7).max(90).default(30),
    }).parse(request.query);

    const history = await sql<{
      snapshot_date: string;
      avg_mood_x10: number | null;
      checkin_rate_pct: number | null;
      critical_alerts_count: number;
      active_patients: number;
      crisis_patients: number;
    }[]>`
      SELECT
        snapshot_date,
        avg_mood_x10,
        checkin_rate_pct,
        critical_alerts_count,
        active_patients,
        crisis_patients
      FROM population_snapshots
      WHERE clinician_id = ${request.user.sub}::UUID
        AND snapshot_date >= CURRENT_DATE - ${days}::INT
      ORDER BY snapshot_date ASC
      LIMIT ${days}
    `;

    return reply.send({ success: true, data: history });
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
  // GET /clinicians/me — current clinician's profile (AppShell badge + auth/me alias)
  // ---------------------------------------------------------------------------
  fastify.get('/me', auth, async (request, reply) => {
    const [clinician] = await sql`
      SELECT id, first_name, last_name, title,
             role, role AS clinician_role,
             npi, email, mfa_enabled, last_login_at
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
