// =============================================================================
// MindLog API — Medications routes
//
// GET    /medications                — list medications (patient: own; clinician: ?patient_id=)
// POST   /medications                — add a medication (patient or clinician)
// PATCH  /medications/:id            — update / discontinue a medication
// GET    /medications/:id/logs       — adherence history for a single medication
// POST   /medications/:id/logs       — log / upsert today's adherence
// GET    /medications/today          — today's meds + adherence status (patient-only shortcut)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import {
  CreatePatientMedicationSchema,
  LogAdherenceSchema,
  DiscontinueMedicationSchema,
  UuidSchema,
  PaginationSchema,
} from '@mindlog/shared';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Resolve the target patient_id from the request, enforcing access control.
 *  - Patients: always their own ID (sub).
 *  - Clinicians / admins: must supply ?patient_id= query param.
 *  Returns the resolved patient UUID or throws a 400/403.
 */
async function resolvePatientId(
  fastify: FastifyInstance,
  request: { user: { sub: string; role: string }; query: Record<string, string | undefined> },
  reply: { status: (code: number) => { send: (body: unknown) => void }; send: (body: unknown) => void },
): Promise<string | null> {
  const role = request.user.role;

  if (role === 'patient') {
    return request.user.sub;
  }

  // Clinician / admin — require explicit patient_id query param
  const qPatientId = request.query['patient_id'];
  if (!qPatientId) {
    reply.status(400).send({
      success: false,
      error: { code: 'MISSING_PARAM', message: '?patient_id= is required for clinician requests' },
    });
    return null;
  }

  const parsed = UuidSchema.safeParse(qPatientId);
  if (!parsed.success) {
    reply.status(400).send({
      success: false,
      error: { code: 'INVALID_PARAM', message: 'patient_id must be a valid UUID' },
    });
    return null;
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function medicationRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // -------------------------------------------------------------------------
  // GET /medications/today — patient shortcut: today's meds + adherence status
  // Must be registered BEFORE /:id to avoid conflict.
  // -------------------------------------------------------------------------
  fastify.get('/today', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'This endpoint is for patients only' },
      });
    }

    const patientId = request.user.sub;
    const today = new Date().toISOString().split('T')[0]!;

    const rows = await sql<{
      id: string;
      medication_name: string;
      dose: number | null;
      dose_unit: string;
      frequency: string;
      frequency_other: string | null;
      instructions: string | null;
      log_id: string | null;
      taken: boolean | null;
      taken_at: string | null;
      log_notes: string | null;
    }[]>`
      SELECT
        pm.id,
        pm.medication_name,
        pm.dose,
        pm.dose_unit,
        pm.frequency,
        pm.frequency_other,
        pm.instructions,
        mal.id        AS log_id,
        mal.taken,
        mal.taken_at,
        mal.notes     AS log_notes
      FROM patient_medications pm
      LEFT JOIN medication_adherence_logs mal
        ON  mal.patient_medication_id = pm.id
        AND mal.entry_date = ${today}
      WHERE pm.patient_id    = ${patientId}
        AND pm.discontinued_at IS NULL
        AND pm.show_in_app   = TRUE
      ORDER BY pm.created_at ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // -------------------------------------------------------------------------
  // GET /medications — list all (active + discontinued) medications
  // -------------------------------------------------------------------------
  fastify.get('/', auth, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const patientId = await resolvePatientId(fastify, { user: request.user, query }, reply);
    if (!patientId) return; // resolvePatientId already sent error

    const includeDiscontinued = query['include_discontinued'] === 'true';

    const rows = await sql<{
      id: string;
      medication_name: string;
      dose: number | null;
      dose_unit: string;
      frequency: string;
      frequency_other: string | null;
      instructions: string | null;
      prescribed_at: string | null;
      discontinued_at: string | null;
      discontinuation_reason: string | null;
      show_in_app: boolean;
      created_at: string;
      // Adherence stats
      total_logged: number;
      taken_count: number;
      last_taken_at: string | null;
    }[]>`
      SELECT
        pm.id,
        pm.medication_name,
        pm.dose,
        pm.dose_unit,
        pm.frequency,
        pm.frequency_other,
        pm.instructions,
        pm.prescribed_at,
        pm.discontinued_at,
        pm.discontinuation_reason,
        pm.show_in_app,
        pm.created_at,
        COUNT(mal.id)::int              AS total_logged,
        COUNT(mal.id) FILTER (WHERE mal.taken = TRUE)::int AS taken_count,
        MAX(mal.taken_at)               AS last_taken_at
      FROM patient_medications pm
      LEFT JOIN medication_adherence_logs mal ON mal.patient_medication_id = pm.id
      WHERE pm.patient_id = ${patientId}
        ${includeDiscontinued ? sql`` : sql`AND pm.discontinued_at IS NULL`}
      GROUP BY pm.id
      ORDER BY pm.discontinued_at IS NOT NULL ASC, pm.created_at ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // -------------------------------------------------------------------------
  // POST /medications — add a medication for a patient
  // -------------------------------------------------------------------------
  fastify.post('/', auth, async (request, reply) => {
    const body = CreatePatientMedicationSchema.parse(request.body);
    const query = request.query as Record<string, string | undefined>;

    const patientId = await resolvePatientId(fastify, { user: request.user, query }, reply);
    if (!patientId) return;

    // Clinicians record themselves as prescriber
    const prescribedBy =
      request.user.role === 'clinician' || request.user.role === 'admin'
        ? request.user.sub
        : null;

    const [med] = await sql<{ id: string; medication_name: string; created_at: string }[]>`
      INSERT INTO patient_medications (
        patient_id,
        medication_name,
        dose,
        dose_unit,
        frequency,
        frequency_other,
        instructions,
        prescribed_by,
        prescribed_at,
        show_in_app
      ) VALUES (
        ${patientId},
        ${body.medication_name},
        ${body.dose ?? null},
        ${body.dose_unit ?? 'mg'},
        ${body.frequency},
        ${body.frequency_other ?? null},
        ${body.instructions ?? null},
        ${prescribedBy},
        ${body.prescribed_at ?? null},
        ${body.show_in_app ?? true}
      )
      RETURNING id, medication_name, created_at
    `;

    if (!med) throw new Error('Failed to create medication');

    return reply.status(201).send({ success: true, data: med });
  });

  // -------------------------------------------------------------------------
  // PATCH /medications/:id — update fields or discontinue
  // -------------------------------------------------------------------------
  fastify.patch('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const query = request.query as Record<string, string | undefined>;

    const patientId = await resolvePatientId(fastify, { user: request.user, query }, reply);
    if (!patientId) return;

    // Verify ownership
    const [existing] = await sql<{ id: string; discontinued_at: string | null }[]>`
      SELECT id, discontinued_at
      FROM patient_medications
      WHERE id = ${id} AND patient_id = ${patientId}
      LIMIT 1
    `;

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Medication not found' },
      });
    }

    // Determine if this is a discontinue or a general update
    const rawBody = request.body as Record<string, unknown>;
    const isDiscontineRequest =
      'discontinued_at' in rawBody || 'discontinuation_reason' in rawBody;

    if (isDiscontineRequest) {
      const body = DiscontinueMedicationSchema.parse(rawBody);
      const discontinuedAt =
        body.discontinued_at ?? new Date().toISOString().split('T')[0]!;

      const [updated] = await sql<{ id: string; discontinued_at: string }[]>`
        UPDATE patient_medications
        SET discontinued_at        = ${discontinuedAt},
            discontinuation_reason = ${body.discontinuation_reason ?? null},
            updated_at             = NOW()
        WHERE id = ${id}
        RETURNING id, discontinued_at
      `;

      return reply.send({ success: true, data: updated });
    }

    // General field update (subset of CreatePatientMedicationSchema)
    const UpdateSchema = CreatePatientMedicationSchema.partial();
    const body = UpdateSchema.parse(rawBody);

    // Build update set dynamically — only set provided fields
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.medication_name !== undefined) updates['medication_name'] = body.medication_name;
    if (body.dose !== undefined) updates['dose'] = body.dose;
    if (body.dose_unit !== undefined) updates['dose_unit'] = body.dose_unit;
    if (body.frequency !== undefined) updates['frequency'] = body.frequency;
    if (body.frequency_other !== undefined) updates['frequency_other'] = body.frequency_other;
    if (body.instructions !== undefined) updates['instructions'] = body.instructions;
    if (body.prescribed_at !== undefined) updates['prescribed_at'] = body.prescribed_at;
    if (body.show_in_app !== undefined) updates['show_in_app'] = body.show_in_app;

    const [updated] = await sql<{ id: string; medication_name: string; updated_at: string }[]>`
      UPDATE patient_medications
      SET
        medication_name  = COALESCE(${body.medication_name ?? null}, medication_name),
        dose             = COALESCE(${body.dose ?? null}, dose),
        dose_unit        = COALESCE(${body.dose_unit ?? null}, dose_unit),
        frequency        = COALESCE(${body.frequency ?? null}, frequency),
        frequency_other  = ${body.frequency_other !== undefined ? body.frequency_other : sql`frequency_other`},
        instructions     = ${body.instructions !== undefined ? body.instructions : sql`instructions`},
        prescribed_at    = ${body.prescribed_at !== undefined ? body.prescribed_at : sql`prescribed_at`},
        show_in_app      = COALESCE(${body.show_in_app ?? null}, show_in_app),
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING id, medication_name, updated_at
    `;

    return reply.send({ success: true, data: updated });
  });

  // -------------------------------------------------------------------------
  // GET /medications/:id/logs — adherence history for a single medication
  // -------------------------------------------------------------------------
  fastify.get('/:id/logs', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const query = request.query as Record<string, string | undefined>;
    const { page, limit } = PaginationSchema.parse(query);

    const patientId = await resolvePatientId(fastify, { user: request.user, query }, reply);
    if (!patientId) return;

    // Verify medication belongs to patient
    const [med] = await sql<{ id: string; medication_name: string }[]>`
      SELECT id, medication_name
      FROM patient_medications
      WHERE id = ${id} AND patient_id = ${patientId}
      LIMIT 1
    `;

    if (!med) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Medication not found' },
      });
    }

    const offset = (page - 1) * limit;

    const [{ total }] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM medication_adherence_logs
      WHERE patient_medication_id = ${id}
    `;

    const logs = await sql<{
      id: string;
      entry_date: string;
      taken: boolean;
      taken_at: string | null;
      notes: string | null;
      created_at: string;
    }[]>`
      SELECT id, entry_date, taken, taken_at, notes, created_at
      FROM medication_adherence_logs
      WHERE patient_medication_id = ${id}
      ORDER BY entry_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return reply.send({
      success: true,
      data: {
        medication: med,
        items: logs,
        total: total ?? 0,
        page,
        limit,
        has_next: offset + logs.length < (total ?? 0),
      },
    });
  });

  // -------------------------------------------------------------------------
  // POST /medications/:id/logs — log or upsert adherence for a given date
  // Only patients may log their own adherence.
  // -------------------------------------------------------------------------
  fastify.post('/:id/logs', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only patients can log medication adherence' },
      });
    }

    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const patientId = request.user.sub;
    const body = LogAdherenceSchema.parse(request.body);

    const entryDate = body.entry_date ?? new Date().toISOString().split('T')[0]!;

    // Verify medication belongs to patient and is active
    const [med] = await sql<{ id: string; medication_name: string }[]>`
      SELECT id, medication_name
      FROM patient_medications
      WHERE id = ${id}
        AND patient_id = ${patientId}
        AND discontinued_at IS NULL
      LIMIT 1
    `;

    if (!med) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Active medication not found' },
      });
    }

    // Upsert using the new UNIQUE(patient_medication_id, entry_date) constraint
    const [log] = await sql<{
      id: string;
      entry_date: string;
      taken: boolean;
      taken_at: string | null;
      notes: string | null;
    }[]>`
      INSERT INTO medication_adherence_logs (
        patient_id,
        patient_medication_id,
        entry_date,
        taken,
        taken_at,
        notes
      ) VALUES (
        ${patientId},
        ${id},
        ${entryDate},
        ${body.taken},
        ${body.taken_at ?? null},
        ${body.notes ?? null}
      )
      ON CONFLICT (patient_medication_id, entry_date) DO UPDATE
        SET taken      = EXCLUDED.taken,
            taken_at   = EXCLUDED.taken_at,
            notes      = EXCLUDED.notes
      RETURNING id, entry_date, taken, taken_at, notes
    `;

    if (!log) throw new Error('Failed to upsert adherence log');

    return reply.status(201).send({ success: true, data: log });
  });
}
