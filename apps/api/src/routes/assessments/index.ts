// =============================================================================
// MindLog API — Validated assessment routes
// POST /api/v1/assessments              — submit a completed scale (PHQ-9, GAD-7 …)
// GET  /api/v1/assessments              — patient's history (latest per scale)
// GET  /api/v1/assessments/pending      — which scales are due for this patient
// GET  /api/v1/assessments/:id/fhir     — FHIR R4 QuestionnaireResponse export
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { SCALE_LOINC_MAP } from '@mindlog/shared';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const VALID_SCALES = ['PHQ-9', 'GAD-7', 'ASRM', 'ISI', 'C-SSRS', 'WHODAS', 'QIDS-SR'] as const;
type Scale = (typeof VALID_SCALES)[number];

const SubmitAssessmentSchema = z.object({
  scale: z.enum(VALID_SCALES),
  score: z.number().int().min(0).max(100),
  item_responses: z.record(z.string(), z.number().int().min(0).max(9)),
  notes: z.string().max(2000).optional(),
});

// Recommended reassessment interval (days) per scale
const REASSESS_INTERVAL_DAYS: Record<Scale, number> = {
  'PHQ-9':   7,
  'GAD-7':   7,
  'ASRM':    7,
  'ISI':     14,
  'C-SSRS':  7,
  'WHODAS':  30,
  'QIDS-SR': 14,
};

// ---------------------------------------------------------------------------
// FHIR R4 QuestionnaireResponse transform
// ---------------------------------------------------------------------------

function toFhirQuestionnaireResponse(assessment: {
  id: string;
  scale: string;
  score: number;
  item_responses: Record<string, number>;
  completed_at: string;
  loinc_code: string | null;
}) {
  const loincCode = assessment.loinc_code;
  return {
    resourceType: 'QuestionnaireResponse',
    id: assessment.id,
    status: 'completed',
    questionnaire: loincCode
      ? `http://loinc.org/vs/${loincCode}`
      : `urn:mindlog:scale:${assessment.scale}`,
    authored: assessment.completed_at,
    extension: [
      {
        url: 'http://mindlog.app/fhir/StructureDefinition/totalScore',
        valueInteger: assessment.score,
      },
    ],
    item: Object.entries(assessment.item_responses).map(([linkId, answer]) => ({
      linkId,
      answer: [{ valueInteger: answer }],
    })),
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function assessmentRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ── POST /assessments — submit a completed scale ─────────────────────────
  fastify.post('/', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const body = SubmitAssessmentSchema.parse(request.body);
    const patientId = request.user.sub;
    const loincCode = SCALE_LOINC_MAP[body.scale] ?? null;

    const [row] = await sql<{ id: string; completed_at: string }[]>`
      INSERT INTO validated_assessments
        (patient_id, scale, score, item_responses, loinc_code, completed_at)
      VALUES
        (${patientId}, ${body.scale}, ${body.score}, ${JSON.stringify(body.item_responses)},
         ${loincCode}, NOW())
      RETURNING id, completed_at
    `;

    return reply.status(201).send({
      success: true,
      data: {
        id: row!.id,
        scale: body.scale,
        score: body.score,
        completed_at: row!.completed_at,
        loinc_code: loincCode,
      },
    });
  });

  // ── GET /assessments/pending — which scales are due ───────────────────────
  fastify.get('/pending', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const patientId = request.user.sub;

    // Most recent submission per scale
    const latest = await sql<{ scale: string; completed_at: string }[]>`
      SELECT DISTINCT ON (scale) scale, completed_at
      FROM validated_assessments
      WHERE patient_id = ${patientId}
      ORDER BY scale, completed_at DESC
    `;

    const latestMap = new Map(latest.map((r) => [r.scale, new Date(r.completed_at)]));
    const now = new Date();

    const due: Array<{ scale: Scale; days_overdue: number; interval_days: number }> = [];

    for (const scale of VALID_SCALES) {
      // Only surface core clinical scales as "pending" prompts (not WHODAS/QIDS-SR by default)
      if (!['PHQ-9', 'GAD-7', 'ASRM', 'C-SSRS'].includes(scale)) continue;

      const lastDate = latestMap.get(scale);
      const intervalDays = REASSESS_INTERVAL_DAYS[scale];

      if (!lastDate) {
        due.push({ scale, days_overdue: intervalDays, interval_days: intervalDays });
      } else {
        const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= intervalDays) {
          due.push({ scale, days_overdue: daysSince - intervalDays, interval_days: intervalDays });
        }
      }
    }

    return reply.send({ success: true, data: due });
  });

  // ── GET /assessments — patient's assessment history ───────────────────────
  fastify.get('/', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const patientId = request.user.sub;

    const rows = await sql<{
      id: string;
      scale: string;
      score: number;
      completed_at: string;
      loinc_code: string | null;
      notes: string | null;
    }[]>`
      SELECT id, scale, score, completed_at, loinc_code, notes
      FROM validated_assessments
      WHERE patient_id = ${patientId}
      ORDER BY completed_at DESC
      LIMIT 50
    `;

    return reply.send({ success: true, data: rows });
  });

  // ── GET /assessments/:id/fhir — FHIR R4 export ───────────────────────────
  fastify.get('/:id/fhir', auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patientId = request.user.sub;

    const [row] = await sql<{
      id: string;
      scale: string;
      score: number;
      item_responses: Record<string, number>;
      completed_at: string;
      loinc_code: string | null;
    }[]>`
      SELECT id, scale, score, item_responses, completed_at, loinc_code
      FROM validated_assessments
      WHERE id = ${id}
        AND patient_id = ${patientId}
      LIMIT 1
    `;

    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
    }

    const fhir = toFhirQuestionnaireResponse(row);
    return reply
      .header('Content-Type', 'application/fhir+json')
      .send(fhir);
  });
}
