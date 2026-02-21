// =============================================================================
// MindLog API — Patient consent routes
// GET    /api/v1/consent         — list patient's active consent records
// POST   /api/v1/consent         — grant or record consent
// DELETE /api/v1/consent/:type   — revoke a consent type (insert revocation row)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UpdateConsentSchema } from '@mindlog/shared';

const CONSENT_VERSION = '1.0.0';

export default async function consentRoutes(fastify: FastifyInstance): Promise<void> {
  const patientOnly = { preHandler: [fastify.requireRole(['patient'])] };

  // ---------------------------------------------------------------------------
  // GET /consent — list latest consent status per type for this patient
  // ---------------------------------------------------------------------------
  fastify.get('/', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;

    // Return the most recent record per consent_type
    const records = await sql`
      SELECT DISTINCT ON (consent_type)
        id, consent_type, granted, granted_at, expires_at, revoked_at
      FROM consent_records
      WHERE patient_id = ${patientId}
      ORDER BY consent_type, granted_at DESC
    `;

    return reply.send({ success: true, data: records });
  });

  // ---------------------------------------------------------------------------
  // POST /consent — grant or update consent
  // ---------------------------------------------------------------------------
  fastify.post('/', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;
    const body = UpdateConsentSchema.parse(request.body);

    const [record] = await sql<{ id: string; granted_at: string }[]>`
      INSERT INTO consent_records (
        patient_id, consent_type, granted, consent_version, ip_address
      ) VALUES (
        ${patientId}, ${body.consent_type}, ${body.granted},
        ${CONSENT_VERSION}, ${request.ip}::INET
      )
      RETURNING id, granted_at
    `;

    return reply.status(201).send({ success: true, data: record });
  });

  // ---------------------------------------------------------------------------
  // DELETE /consent/:type — revoke a consent type
  // ---------------------------------------------------------------------------
  fastify.delete('/:type', patientOnly, async (request, reply) => {
    const { type } = z.object({
      type: z.enum(['journal_sharing', 'data_research', 'ai_insights', 'emergency_contact']),
    }).parse(request.params);

    const patientId = request.user.sub;

    // Insert a revocation record (append-only — never update old rows)
    const [record] = await sql<{ id: string }[]>`
      INSERT INTO consent_records (
        patient_id, consent_type, granted, consent_version, ip_address, revoked_at
      ) VALUES (
        ${patientId}, ${type}, FALSE, ${CONSENT_VERSION}, ${request.ip}::INET, NOW()
      )
      RETURNING id
    `;

    return reply.send({ success: true, data: { id: record?.id, revoked: true } });
  });
}
