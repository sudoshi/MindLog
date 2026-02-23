// =============================================================================
// MindLog API — Global search
// GET /api/v1/search?q=:query&types=patients,notes
//
// - Patients: fuzzy name + MRN search via pg_trgm similarity()
// - Notes:    full-text search via search_vector @@ plainto_tsquery()
// - Scoped to clinician's care-team patients (admin sees all)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';

const MAX_RESULTS_PER_TYPE = 10;

export default async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ---------------------------------------------------------------------------
  // GET /search?q=&types=patients,notes
  // ---------------------------------------------------------------------------
  fastify.get('/', clinicianOnly, async (request, reply) => {
    const { q, types } = z.object({
      q:     z.string().min(1).max(200),
      types: z.string().default('patients,notes'),
    }).parse(request.query);

    const searchTypes = new Set(types.split(',').map((t) => t.trim()));
    const { sub: clinicianId, org_id: orgId } = request.user as { sub: string; org_id: string };

    const [clinicianRow] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${clinicianId}::UUID LIMIT 1
    `;
    const isAdmin = clinicianRow?.role === 'admin';

    // Patient IDs this clinician can see
    const patientScope = isAdmin
      ? sql`TRUE`
      : sql`
          EXISTS (
            SELECT 1 FROM care_team_members ctm
            WHERE ctm.patient_id = p.id
              AND ctm.clinician_id = ${clinicianId}::UUID
              AND ctm.unassigned_at IS NULL
          )
          AND p.organisation_id = ${orgId}
        `;

    const results: {
      patients: Array<{
        id: string; first_name: string; last_name: string;
        mrn: string; status: string; risk_level: string | null;
        similarity: number;
      }>;
      notes: Array<{
        id: string; patient_id: string; patient_first_name: string; patient_last_name: string;
        note_type: string; body_excerpt: string; created_at: string;
        rank: number;
      }>;
    } = { patients: [], notes: [] };

    // ------------------------------------------------------------------
    // Patient search via pg_trgm similarity on name + exact MRN prefix
    // ------------------------------------------------------------------
    if (searchTypes.has('patients')) {
      const normalised = q.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      const patients = await sql<{
        id: string; first_name: string; last_name: string;
        mrn: string; status: string; risk_level: string | null; similarity: number;
      }[]>`
        SELECT
          p.id, p.first_name, p.last_name, p.mrn, p.status, p.risk_level,
          GREATEST(
            similarity(lower(p.first_name || ' ' || p.last_name), ${normalised}),
            similarity(lower(p.last_name || ', ' || p.first_name), ${normalised}),
            CASE WHEN lower(p.mrn) LIKE lower(${q + '%'}) THEN 0.9 ELSE 0 END
          ) AS similarity
        FROM patients p
        WHERE p.is_active = TRUE
          AND ${patientScope}
          AND (
            similarity(lower(p.first_name || ' ' || p.last_name), ${normalised}) > 0.15
            OR lower(p.mrn) LIKE lower(${q + '%'})
          )
        ORDER BY similarity DESC
        LIMIT ${MAX_RESULTS_PER_TYPE}
      `;
      results.patients = patients.map((r) => ({ ...r, similarity: Number(r.similarity) }));
    }

    // ------------------------------------------------------------------
    // Notes search via GIN tsvector
    // ------------------------------------------------------------------
    if (searchTypes.has('notes') && q.length >= 2) {
      const tsQuery = q.trim().split(/\s+/).map((w) => `${w}:*`).join(' & ');
      const notes = await sql<{
        id: string; patient_id: string;
        patient_first_name: string; patient_last_name: string;
        note_type: string; body_excerpt: string; created_at: string; rank: number;
      }[]>`
        SELECT
          cn.id,
          cn.patient_id,
          p.first_name  AS patient_first_name,
          p.last_name   AS patient_last_name,
          cn.note_type,
          LEFT(cn.body, 200) AS body_excerpt,
          cn.created_at,
          ts_rank(cn.search_vector, to_tsquery('english', ${tsQuery})) AS rank
        FROM clinician_notes cn
        JOIN patients p ON p.id = cn.patient_id
        WHERE cn.deleted_at IS NULL
          AND cn.is_private = FALSE
          AND cn.search_vector @@ to_tsquery('english', ${tsQuery})
          AND ${patientScope}
        ORDER BY rank DESC
        LIMIT ${MAX_RESULTS_PER_TYPE}
      `;
      results.notes = notes.map((r) => ({ ...r, rank: Number(r.rank) }));
    }

    return reply.send({ success: true, data: results });
  });
}
