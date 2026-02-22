// =============================================================================
// MindLog API — Patient self-management routes (patient-role only)
// All routes prefixed at /api/v1/patients/me
//
// GET    /patients/me                         — own profile
// PATCH  /patients/me                         — update preferred_name / timezone
// GET    /patients/me/symptoms                — tracked symptom list
// POST   /patients/me/symptoms                — add symptom to tracking list
// DELETE /patients/me/symptoms/:symptomId     — remove symptom
// GET    /patients/me/triggers                — tracked trigger list
// POST   /patients/me/triggers                — add trigger
// DELETE /patients/me/triggers/:triggerId     — remove trigger
// GET    /patients/me/strategies              — tracked wellness strategies
// POST   /patients/me/strategies              — add strategy
// DELETE /patients/me/strategies/:strategyId  — remove strategy
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UuidSchema } from '@mindlog/shared';

const PatchMeSchema = z.object({
  preferred_name: z.string().max(100).optional(),
  timezone: z.string().max(60).optional(),
}).strict();

const AddItemSchema = z.object({
  id: UuidSchema,  // catalogue item id
});

export default async function patientMeRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes in this plugin require auth — patient role enforced per route
  const auth = { preHandler: [fastify.authenticate] };

  // ---------------------------------------------------------------------------
  // GET /patients/me — own profile
  // ---------------------------------------------------------------------------
  fastify.get('/', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const [patient] = await sql<{
      id: string; first_name: string; last_name: string; preferred_name: string | null;
      email: string | null; date_of_birth: string; status: string; risk_level: string;
      tracking_streak: number; longest_streak: number; last_checkin_at: string | null;
      timezone: string; onboarding_complete: boolean;
    }[]>`
      SELECT id, first_name, last_name, preferred_name, email, date_of_birth,
             status, risk_level, tracking_streak, longest_streak,
             last_checkin_at, timezone, onboarding_complete
      FROM patients
      WHERE id = ${request.user.sub}
        AND is_active = TRUE
      LIMIT 1
    `;

    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    return reply.send({ success: true, data: { ...patient, role: 'patient' } });
  });

  // ---------------------------------------------------------------------------
  // PATCH /patients/me — update preferred_name and/or timezone
  // ---------------------------------------------------------------------------
  fastify.patch('/', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const updates = PatchMeSchema.parse(request.body);

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
    }

    const [updated] = await sql<{ id: string; preferred_name: string | null; timezone: string }[]>`
      UPDATE patients
      SET preferred_name = COALESCE(${updates.preferred_name ?? null}, preferred_name),
          timezone       = COALESCE(${updates.timezone       ?? null}, timezone),
          updated_at     = NOW()
      WHERE id = ${request.user.sub}
        AND is_active = TRUE
      RETURNING id, preferred_name, timezone
    `;

    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    return reply.send({ success: true, data: updated });
  });

  // ===========================================================================
  // Symptoms
  // ===========================================================================

  // GET /patients/me/symptoms
  fastify.get('/symptoms', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const rows = await sql<{ id: string; symptom_id: string; name: string; is_safety_symptom: boolean; display_order: number; added_at: string }[]>`
      SELECT ps.id, ps.symptom_id, sc.name, sc.is_safety_symptom, ps.display_order, ps.added_at
      FROM patient_symptoms ps
      JOIN symptom_catalogue sc ON sc.id = ps.symptom_id
      WHERE ps.patient_id = ${request.user.sub}
        AND ps.removed_at IS NULL
      ORDER BY ps.display_order ASC, sc.name ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // POST /patients/me/symptoms
  fastify.post('/symptoms', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { id: symptomId } = AddItemSchema.parse(request.body);

    // Verify symptom exists in catalogue
    const [symptom] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM symptom_catalogue WHERE id = ${symptomId} LIMIT 1
    `;
    if (!symptom) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Symptom not found in catalogue' } });
    }

    const [row] = await sql<{ id: string; symptom_id: string; added_at: string }[]>`
      INSERT INTO patient_symptoms (patient_id, symptom_id)
      VALUES (${request.user.sub}, ${symptomId})
      ON CONFLICT (patient_id, symptom_id) DO UPDATE
        SET removed_at = NULL, added_at = NOW()
      RETURNING id, symptom_id, added_at
    `;

    return reply.status(201).send({ success: true, data: row });
  });

  // DELETE /patients/me/symptoms/:symptomId
  fastify.delete('/symptoms/:symptomId', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { symptomId } = z.object({ symptomId: UuidSchema }).parse(request.params);

    await sql`
      UPDATE patient_symptoms
      SET removed_at = NOW()
      WHERE patient_id = ${request.user.sub}
        AND symptom_id = ${symptomId}
        AND removed_at IS NULL
    `;

    return reply.status(204).send();
  });

  // ===========================================================================
  // Triggers
  // ===========================================================================

  // GET /patients/me/triggers
  fastify.get('/triggers', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const rows = await sql<{ id: string; trigger_id: string; name: string; category: string | null; display_order: number; added_at: string }[]>`
      SELECT pt.id, pt.trigger_id, tc.name, tc.category, pt.display_order, pt.added_at
      FROM patient_triggers pt
      JOIN trigger_catalogue tc ON tc.id = pt.trigger_id
      WHERE pt.patient_id = ${request.user.sub}
        AND pt.removed_at IS NULL
      ORDER BY pt.display_order ASC, tc.name ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // POST /patients/me/triggers
  fastify.post('/triggers', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { id: triggerId } = AddItemSchema.parse(request.body);

    const [trigger] = await sql<{ id: string }[]>`
      SELECT id FROM trigger_catalogue WHERE id = ${triggerId} LIMIT 1
    `;
    if (!trigger) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Trigger not found in catalogue' } });
    }

    const [row] = await sql<{ id: string; trigger_id: string; added_at: string }[]>`
      INSERT INTO patient_triggers (patient_id, trigger_id)
      VALUES (${request.user.sub}, ${triggerId})
      ON CONFLICT (patient_id, trigger_id) DO UPDATE
        SET removed_at = NULL, added_at = NOW()
      RETURNING id, trigger_id, added_at
    `;

    return reply.status(201).send({ success: true, data: row });
  });

  // DELETE /patients/me/triggers/:triggerId
  fastify.delete('/triggers/:triggerId', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { triggerId } = z.object({ triggerId: UuidSchema }).parse(request.params);

    await sql`
      UPDATE patient_triggers
      SET removed_at = NOW()
      WHERE patient_id = ${request.user.sub}
        AND trigger_id = ${triggerId}
        AND removed_at IS NULL
    `;

    return reply.status(204).send();
  });

  // ===========================================================================
  // Wellness Strategies
  // ===========================================================================

  // GET /patients/me/strategies
  fastify.get('/strategies', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const rows = await sql<{ id: string; strategy_id: string; name: string; category: string | null; display_order: number; added_at: string }[]>`
      SELECT pws.id, pws.strategy_id, ws.name, ws.category, pws.display_order, pws.added_at
      FROM patient_wellness_strategies pws
      JOIN wellness_strategies ws ON ws.id = pws.strategy_id
      WHERE pws.patient_id = ${request.user.sub}
        AND pws.removed_at IS NULL
      ORDER BY pws.display_order ASC, ws.name ASC
    `;

    return reply.send({ success: true, data: rows });
  });

  // POST /patients/me/strategies
  fastify.post('/strategies', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { id: strategyId } = AddItemSchema.parse(request.body);

    const [strategy] = await sql<{ id: string }[]>`
      SELECT id FROM wellness_strategies WHERE id = ${strategyId} LIMIT 1
    `;
    if (!strategy) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Strategy not found in catalogue' } });
    }

    const [row] = await sql<{ id: string; strategy_id: string; added_at: string }[]>`
      INSERT INTO patient_wellness_strategies (patient_id, strategy_id)
      VALUES (${request.user.sub}, ${strategyId})
      ON CONFLICT (patient_id, strategy_id) DO UPDATE
        SET removed_at = NULL, added_at = NOW()
      RETURNING id, strategy_id, added_at
    `;

    return reply.status(201).send({ success: true, data: row });
  });

  // DELETE /patients/me/strategies/:strategyId
  fastify.delete('/strategies/:strategyId', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { strategyId } = z.object({ strategyId: UuidSchema }).parse(request.params);

    await sql`
      UPDATE patient_wellness_strategies
      SET removed_at = NOW()
      WHERE patient_id = ${request.user.sub}
        AND strategy_id = ${strategyId}
        AND removed_at IS NULL
    `;

    return reply.status(204).send();
  });
}
