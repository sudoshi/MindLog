// =============================================================================
// MindLog API — Catalogue routes (patient-facing)
// GET /api/v1/catalogues/triggers    — patient's active trigger list (+ system fallback)
// GET /api/v1/catalogues/symptoms    — patient's active symptom list (+ system fallback)
// GET /api/v1/catalogues/strategies  — patient's active wellness strategies (+ system fallback)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@mindlog/db';

export default async function catalogueRoutes(fastify: FastifyInstance): Promise<void> {
  const patientOnly = { preHandler: [fastify.requireRole(['patient'])] };

  // ---------------------------------------------------------------------------
  // GET /catalogues/triggers
  // Returns the patient's personalised trigger list.
  // Falls back to system-wide triggers when no patient_triggers exist yet.
  // ---------------------------------------------------------------------------
  fastify.get('/triggers', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;

    let rows = await sql<{
      trigger_id: string; name: string; category: string; icon_key: string | null;
    }[]>`
      SELECT pt.trigger_id, tc.name, tc.category, tc.icon_key
      FROM patient_triggers pt
      JOIN trigger_catalogue tc ON tc.id = pt.trigger_id
      WHERE pt.patient_id = ${patientId}
        AND pt.removed_at IS NULL
        AND tc.is_active = TRUE
      ORDER BY pt.display_order ASC NULLS LAST, tc.name ASC
    `;

    // Fallback: return all active system triggers when patient has no personalised list
    if (rows.length === 0) {
      rows = await sql<{ trigger_id: string; name: string; category: string; icon_key: string | null }[]>`
        SELECT id AS trigger_id, name, category, icon_key
        FROM trigger_catalogue
        WHERE is_system = TRUE AND is_active = TRUE
        ORDER BY display_order ASC, name ASC
      `;
    }

    return reply.send({ success: true, data: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /catalogues/symptoms
  // Returns the patient's symptom list with safety flags.
  // ---------------------------------------------------------------------------
  fastify.get('/symptoms', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;

    let rows = await sql<{
      symptom_id: string; name: string; category: string;
      icon_key: string | null; is_safety_symptom: boolean;
    }[]>`
      SELECT ps.symptom_id, sc.name, sc.category, sc.icon_key, sc.is_safety_symptom
      FROM patient_symptoms ps
      JOIN symptom_catalogue sc ON sc.id = ps.symptom_id
      WHERE ps.patient_id = ${patientId}
        AND ps.removed_at IS NULL
        AND sc.is_active = TRUE
      ORDER BY sc.is_safety_symptom DESC, ps.display_order ASC NULLS LAST, sc.name ASC
    `;

    if (rows.length === 0) {
      rows = await sql<{
        symptom_id: string; name: string; category: string;
        icon_key: string | null; is_safety_symptom: boolean;
      }[]>`
        SELECT id AS symptom_id, name, category, icon_key, is_safety_symptom
        FROM symptom_catalogue
        WHERE is_system = TRUE AND is_active = TRUE
        ORDER BY is_safety_symptom DESC, display_order ASC, name ASC
      `;
    }

    return reply.send({ success: true, data: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /catalogues/strategies
  // Returns the patient's wellness strategies.
  // ---------------------------------------------------------------------------
  fastify.get('/strategies', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;

    let rows = await sql<{
      strategy_id: string; name: string; category: string;
      icon_key: string | null; has_quality_rating: boolean;
    }[]>`
      SELECT pw.strategy_id, ws.name, ws.category, ws.icon_key, ws.has_quality_rating
      FROM patient_wellness_strategies pw
      JOIN wellness_strategies ws ON ws.id = pw.strategy_id
      WHERE pw.patient_id = ${patientId}
        AND pw.removed_at IS NULL
        AND ws.is_active = TRUE
      ORDER BY pw.display_order ASC NULLS LAST, ws.name ASC
    `;

    if (rows.length === 0) {
      rows = await sql<{
        strategy_id: string; name: string; category: string;
        icon_key: string | null; has_quality_rating: boolean;
      }[]>`
        SELECT id AS strategy_id, name, category, icon_key, has_quality_rating
        FROM wellness_strategies
        WHERE is_system = TRUE AND is_active = TRUE
        ORDER BY display_order ASC, name ASC
      `;
    }

    return reply.send({ success: true, data: rows });
  });
}
