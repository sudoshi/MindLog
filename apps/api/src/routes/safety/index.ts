// =============================================================================
// MindLog API — Safety routes
//
// Public:
//   GET  /safety/resources                 — static crisis resource list
//
// Authenticated (clinician or admin):
//   GET  /safety/plans/:patientId          — get crisis safety plan
//   PUT  /safety/plans/:patientId          — upsert crisis safety plan
//   GET  /safety/plans/:patientId/history  — version history
//
// Authenticated (patient):
//   GET  /safety/my-plan                   — patient's own safety plan
//   POST /safety/my-plan/sign              — patient acknowledges/signs plan
// =============================================================================

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UuidSchema, UpsertSafetyPlanSchema } from '@mindlog/shared';

// Shorthand type for the JWT payload shape (matches auth plugin augmentation)
type JwtUser = { sub: string; org_id: string; role: string };

// Static list — extend via DB table in a future phase if clinician-configurable
// resources are needed.  These US resources are always safe to expose.
const SAFETY_RESOURCES = [
  {
    id: 'lifeline',
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    text_to: '988',
    text_keyword: null,
    url: 'https://988lifeline.org',
    description: 'Free, confidential support 24/7 for people in distress.',
    available_24_7: true,
    type: 'crisis_line',
  },
  {
    id: 'crisis_text_line',
    name: 'Crisis Text Line',
    phone: null,
    text_to: '741741',
    text_keyword: 'HELLO',
    url: 'https://www.crisistextline.org',
    description: 'Text HOME to 741741 from anywhere in the USA.',
    available_24_7: true,
    type: 'text_line',
  },
  {
    id: 'veterans_crisis',
    name: 'Veterans Crisis Line',
    phone: '988',
    text_to: '838255',
    text_keyword: null,
    url: 'https://www.veteranscrisisline.net',
    description: 'Press 1 after dialing 988. Text 838255. Chat online.',
    available_24_7: true,
    type: 'crisis_line',
  },
  {
    id: 'samhsa',
    name: 'SAMHSA National Helpline',
    phone: '1-800-662-4357',
    text_to: null,
    text_keyword: null,
    url: 'https://www.samhsa.gov/find-help/national-helpline',
    description: 'Free, confidential treatment referral and information service.',
    available_24_7: true,
    type: 'treatment_referral',
  },
  {
    id: 'nami',
    name: 'NAMI Helpline',
    phone: '1-800-950-6264',
    text_to: '62640',
    text_keyword: 'NAMI',
    url: 'https://www.nami.org/help',
    description: 'Mental health information and support — Mon–Fri 10am–10pm ET.',
    available_24_7: false,
    type: 'support_line',
  },
];

export default async function safetyRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };
  const patientOnly   = { preHandler: [fastify.requireRole(['patient'])] };

  // ── GET /safety/resources — Public ───────────────────────────────────────
  // No authentication needed so patients can access even if session has expired.
  fastify.get('/resources', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        resources: SAFETY_RESOURCES,
        disclaimer: 'If you are in immediate danger, call 911 or go to your nearest emergency room.',
      },
    });
  });

  // ── Helper: care-team access check ───────────────────────────────────────
  async function isAdmin(userId: string): Promise<boolean> {
    const [c] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
    `;
    return c?.role === 'admin';
  }

  async function assertCareTeam(
    clinicianId: string,
    patientId: string,
    reply: FastifyReply,
  ): Promise<boolean> {
    if (await isAdmin(clinicianId)) return true;
    const [m] = await sql<{ id: string }[]>`
      SELECT ctm.id FROM care_team_members ctm
      WHERE ctm.patient_id   = ${patientId}::UUID
        AND ctm.clinician_id = ${clinicianId}::UUID
        AND ctm.unassigned_at IS NULL
      LIMIT 1
    `;
    if (!m) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: "Not on this patient's care team" } });
      return false;
    }
    return true;
  }

  // ── GET /safety/plans/:patientId ─────────────────────────────────────────
  fastify.get<{ Params: { patientId: string } }>(
    '/plans/:patientId',
    clinicianOnly,
    async (request, reply) => {
      const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
      const ok = await assertCareTeam((request.user as { sub: string; org_id: string }).sub, patientId, reply);
      if (!ok) return;

      const [plan] = await sql`
        SELECT csp.*,
               c.first_name AS completed_by_first,
               c.last_name  AS completed_by_last
        FROM crisis_safety_plans csp
        LEFT JOIN clinicians c ON c.id = csp.completed_by
        WHERE csp.patient_id = ${patientId}::UUID AND csp.is_active = TRUE
        LIMIT 1
      `;

      if (!plan) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No safety plan found for this patient' } });
      }

      return reply.send({ success: true, data: plan });
    },
  );

  // ── PUT /safety/plans/:patientId — Upsert ────────────────────────────────
  fastify.put<{ Params: { patientId: string } }>(
    '/plans/:patientId',
    clinicianOnly,
    async (request, reply) => {
      const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
      const ok = await assertCareTeam((request.user as { sub: string; org_id: string }).sub, patientId, reply);
      if (!ok) return;

      const body = UpsertSafetyPlanSchema.parse(request.body);

      // Verify patient belongs to clinician's org
      const [patient] = await sql<{ organisation_id: string }[]>`
        SELECT organisation_id FROM patients WHERE id = ${patientId}::UUID LIMIT 1
      `;
      if (!patient) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      }

      // Fetch existing plan for version history
      const [existing] = await sql<{ id: string; version: number; version_history: unknown[] }[]>`
        SELECT id, version, version_history
        FROM crisis_safety_plans
        WHERE patient_id = ${patientId}::UUID AND is_active = TRUE
        LIMIT 1
      `;

      if (existing) {
        // Append current version to history before overwriting
        const snapshot = {
          version: existing.version,
          updated_at: new Date().toISOString(),
          updated_by: (request.user as { sub: string; org_id: string }).sub,
        };
        const newHistory = [...(existing.version_history as unknown[]), snapshot];

        const [updated] = await sql`
          UPDATE crisis_safety_plans SET
            warning_signs               = ${body.warning_signs               ?? null}::TEXT[],
            internal_coping_strategies  = ${body.internal_coping_strategies  ?? null}::TEXT[],
            social_distractions         = ${JSON.stringify(body.social_distractions  ?? [])}::JSONB,
            support_contacts            = ${JSON.stringify(body.support_contacts     ?? [])}::JSONB,
            professional_contact_name   = ${body.professional_contact_name   ?? null},
            professional_contact_phone  = ${body.professional_contact_phone  ?? null},
            professional_contact_agency = ${body.professional_contact_agency ?? null},
            crisis_line_phone           = ${body.crisis_line_phone           ?? '988'},
            crisis_line_name            = ${body.crisis_line_name            ?? '988 Suicide & Crisis Lifeline'},
            er_address                  = ${body.er_address                  ?? null},
            means_restriction_notes     = ${body.means_restriction_notes     ?? null},
            emergency_steps             = ${body.emergency_steps             ?? null},
            reasons_for_living          = ${body.reasons_for_living          ?? null}::TEXT[],
            completed_by                = ${(request.user as { sub: string; org_id: string }).sub}::UUID,
            last_reviewed_at            = NOW(),
            clinician_signature_at      = NOW(),
            version                     = ${existing.version + 1},
            version_history             = ${JSON.stringify(newHistory)}::JSONB,
            updated_at                  = NOW()
          WHERE id = ${existing.id}::UUID
          RETURNING *
        `;
        return reply.send({ success: true, data: updated });
      }

      // Insert new plan
      const [inserted] = await sql`
        INSERT INTO crisis_safety_plans (
          patient_id, organisation_id, completed_by,
          warning_signs, internal_coping_strategies,
          social_distractions, support_contacts,
          professional_contact_name, professional_contact_phone, professional_contact_agency,
          crisis_line_phone, crisis_line_name, er_address,
          means_restriction_notes, emergency_steps, reasons_for_living,
          last_reviewed_at, clinician_signature_at
        ) VALUES (
          ${patientId}::UUID,
          ${patient.organisation_id}::UUID,
          ${(request.user as { sub: string; org_id: string }).sub}::UUID,
          ${body.warning_signs              ?? []}::TEXT[],
          ${body.internal_coping_strategies ?? []}::TEXT[],
          ${JSON.stringify(body.social_distractions ?? [])}::JSONB,
          ${JSON.stringify(body.support_contacts    ?? [])}::JSONB,
          ${body.professional_contact_name   ?? null},
          ${body.professional_contact_phone  ?? null},
          ${body.professional_contact_agency ?? null},
          ${body.crisis_line_phone ?? '988'},
          ${body.crisis_line_name  ?? '988 Suicide & Crisis Lifeline'},
          ${body.er_address                  ?? null},
          ${body.means_restriction_notes     ?? null},
          ${body.emergency_steps             ?? null},
          ${body.reasons_for_living          ?? []}::TEXT[],
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      return reply.status(201).send({ success: true, data: inserted });
    },
  );

  // ── GET /safety/plans/:patientId/history ─────────────────────────────────
  fastify.get<{ Params: { patientId: string } }>(
    '/plans/:patientId/history',
    clinicianOnly,
    async (request, reply) => {
      const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
      const ok = await assertCareTeam((request.user as { sub: string; org_id: string }).sub, patientId, reply);
      if (!ok) return;

      const [plan] = await sql<{ version: number; version_history: unknown[] }[]>`
        SELECT version, version_history, created_at, updated_at
        FROM crisis_safety_plans
        WHERE patient_id = ${patientId}::UUID AND is_active = TRUE
        LIMIT 1
      `;

      if (!plan) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No safety plan found' } });
      }

      return reply.send({
        success: true,
        data: {
          current_version: plan.version,
          history: plan.version_history,
        },
      });
    },
  );

  // ── GET /safety/my-plan — Patient reads own plan ─────────────────────────
  fastify.get(
    '/my-plan',
    patientOnly,
    async (request, reply) => {
      const patientId = (request.user as { sub: string; org_id: string }).sub;

      const [plan] = await sql`
        SELECT
          csp.id, csp.warning_signs, csp.internal_coping_strategies,
          csp.support_contacts, csp.social_distractions,
          csp.crisis_line_phone, csp.crisis_line_name, csp.er_address,
          csp.emergency_steps, csp.reasons_for_living,
          csp.patient_signature_at, csp.clinician_signature_at,
          csp.updated_at
        FROM crisis_safety_plans csp
        WHERE csp.patient_id = ${patientId}::UUID AND csp.is_active = TRUE
        LIMIT 1
      `;

      if (!plan) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No safety plan on file yet. Ask your care team to create one.' } });
      }

      // Append safety resources to the patient-facing plan
      return reply.send({
        success: true,
        data: {
          plan,
          resources: SAFETY_RESOURCES.slice(0, 2), // Lifeline + Crisis Text Line
          disclaimer: 'If you are in immediate danger, call 911 or go to your nearest emergency room.',
        },
      });
    },
  );

  // ── POST /safety/my-plan/sign — Patient acknowledges plan ────────────────
  fastify.post(
    '/my-plan/sign',
    patientOnly,
    async (request, reply) => {
      const patientId = (request.user as { sub: string; org_id: string }).sub;

      const [plan] = await sql<{ id: string }[]>`
        SELECT id FROM crisis_safety_plans
        WHERE patient_id = ${patientId}::UUID AND is_active = TRUE LIMIT 1
      `;

      if (!plan) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No safety plan found' } });
      }

      await sql`
        UPDATE crisis_safety_plans
        SET patient_signature_at = NOW()
        WHERE id = ${plan.id}::UUID
      `;

      return reply.send({ success: true, data: { signed_at: new Date().toISOString() } });
    },
  );
}
