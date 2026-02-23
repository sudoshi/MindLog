// =============================================================================
// MindLog API — FHIR R4 Routes
//
// All responses use Content-Type: application/fhir+json; fhirVersion=4.0
// All endpoints require clinician or admin JWT (except GET /fhir/metadata).
//
// Endpoints:
//   GET  /fhir/metadata                         CapabilityStatement (public)
//   GET  /fhir/Patient/:id                      Read single patient
//   GET  /fhir/Patient/:id/$everything          All clinical data as Bundle
//   GET  /fhir/Observation                      ?patient=&date=&code=  (paginated)
//   GET  /fhir/MedicationRequest                ?patient=&status=
//   GET  /fhir/QuestionnaireResponse            ?patient=&questionnaire=
//   GET  /fhir/Condition                        ?patient=&clinical-status=
//   GET  /fhir/CarePlan                         ?patient=
//   GET  /fhir/Consent                          ?patient=
//
// HIPAA: all PHI served over TLS; clinicians may only access patients on their
// care team (admin role bypasses care-team check).
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UuidSchema } from '@mindlog/shared';
import {
  mapPatient,
  mapDailyEntryObservations,
  mapMedicationRequest,
  mapQuestionnaireResponse,
  mapCondition,
  mapConsent,
  mapBundle,
  buildCapabilityStatement,
  type PatientRow,
  type DailyEntryRow,
  type MedicationRow,
  type AssessmentRow,
  type DiagnosisRow,
  type ConsentRow,
} from '../../services/fhir/mappers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FHIR_CONTENT_TYPE = 'application/fhir+json; fhirVersion=4.0';
const DEFAULT_PAGE_SIZE  = 20;
const MAX_PAGE_SIZE      = 100;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fhirBase(request: FastifyRequest): string {
  // Use web app URL base, falling back to request origin
  const origin = `${request.protocol}://${request.hostname}`;
  return `${origin}/api/v1/fhir`;
}

function sendFhir(reply: FastifyReply, resource: object, status = 200): void {
  reply.status(status).header('Content-Type', FHIR_CONTENT_TYPE).send(resource);
}

function fhirNotFound(reply: FastifyReply, detail: string): void {
  sendFhir(reply, {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', details: { text: detail } }],
  }, 404);
}

function fhirForbidden(reply: FastifyReply): void {
  sendFhir(reply, {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'forbidden', details: { text: 'You do not have access to this patient.' } }],
  }, 403);
}

/** Returns true if the clinician is an admin role */
async function isAdmin(userId: string): Promise<boolean> {
  const [c] = await sql<{ role: string }[]>`
    SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
  `;
  return c?.role === 'admin';
}

/** Checks care-team access; throws if not on team and not admin */
async function assertCareTeamAccess(
  clinicianId: string,
  patientId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (await isAdmin(clinicianId)) return true;

  const [member] = await sql<{ id: string }[]>`
    SELECT ctm.id FROM care_team_members ctm
    WHERE ctm.patient_id   = ${patientId}::UUID
      AND ctm.clinician_id = ${clinicianId}::UUID
      AND ctm.unassigned_at IS NULL
    LIMIT 1
  `;
  if (!member) {
    fhirForbidden(reply);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function parsePaging(query: Record<string, unknown>): { limit: number; offset: number; page: number } {
  const page  = Math.max(1, Number(query['_page']  ?? 1));
  const count = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query['_count'] ?? DEFAULT_PAGE_SIZE)));
  return { limit: count, offset: (page - 1) * count, page };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export default async function fhirRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ── GET /fhir/metadata — CapabilityStatement (no auth) ──────────────────
  fastify.get('/metadata', async (request, reply) => {
    sendFhir(reply, buildCapabilityStatement(fhirBase(request)));
  });

  // ── GET /fhir/Patient/:id ─────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/Patient/:id',
    clinicianOnly,
    async (request, reply) => {
      const { id } = z.object({ id: UuidSchema }).parse(request.params);
      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, id, reply);
      if (!ok) return;

      const [row] = await sql<PatientRow[]>`
        SELECT
          p.id, p.mrn, p.first_name, p.last_name, p.preferred_name,
          p.date_of_birth, p.gender, p.phone, p.email,
          p.address_line1, p.city, p.state, p.postal_code,
          p.diagnosis, p.status, p.organisation_id, p.updated_at
        FROM patients p
        WHERE p.id = ${id}::UUID AND p.is_active = TRUE
        LIMIT 1
      `;

      if (!row) return fhirNotFound(reply, `Patient/${id} not found`);
      sendFhir(reply, mapPatient(row, fhirBase(request)));
    },
  );

  // ── GET /fhir/Patient/:id/$everything ─────────────────────────────────────
  // Returns a searchset Bundle with all clinical data for the patient.
  fastify.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    '/Patient/:id/\\$everything',
    clinicianOnly,
    async (request, reply) => {
      const { id } = z.object({ id: UuidSchema }).parse(request.params);
      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, id, reply);
      if (!ok) return;

      // Date range filter (optional)
      const sinceParam = request.query['_since'] as string | undefined;
      const since = sinceParam ?? new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]!;

      const base = fhirBase(request);

      // Fetch all data in parallel
      const [patientRows, entryRows, medicationRows, assessmentRows, consentRows] = await Promise.all([
        sql<PatientRow[]>`
          SELECT p.id, p.mrn, p.first_name, p.last_name, p.preferred_name,
                 p.date_of_birth, p.gender, p.phone, p.email,
                 p.address_line1, p.city, p.state, p.postal_code,
                 p.diagnosis, p.status, p.organisation_id, p.updated_at
          FROM patients p WHERE p.id = ${id}::UUID AND p.is_active = TRUE LIMIT 1
        `,
        sql<DailyEntryRow[]>`
          SELECT id, patient_id, entry_date, mood, coping, sleep_hours, sleep_quality,
                 exercise_minutes, anxiety_score, mania_score, anhedonia_score,
                 suicidal_ideation, stress_score, notes, submitted_at
          FROM daily_entries
          WHERE patient_id = ${id}::UUID AND entry_date >= ${since}::DATE
            AND submitted_at IS NOT NULL
          ORDER BY entry_date DESC
          LIMIT 90
        `,
        sql<MedicationRow[]>`
          SELECT pm.id, pm.patient_id, pm.medication_name, pm.generic_name,
                 mc.rxnorm_code, pm.dose_value, pm.dose_unit, pm.frequency,
                 pm.prescribed_at, pm.discontinued_at,
                 NULL::TEXT AS prescriber_name, NULL::TEXT AS prescriber_npi,
                 pm.notes
          FROM patient_medications pm
          LEFT JOIN medication_catalogue mc ON mc.id = pm.catalogue_id
          WHERE pm.patient_id = ${id}::UUID AND pm.show_in_app = TRUE
        `,
        sql<AssessmentRow[]>`
          SELECT va.id, va.patient_id, va.scale_code, va.total_score,
                 va.responses, va.severity_label, va.assessed_at,
                 va.assessed_by, NULL::TEXT AS clinician_name
          FROM validated_assessments va
          WHERE va.patient_id = ${id}::UUID AND va.assessed_at >= ${since}::DATE
          ORDER BY va.assessed_at DESC
          LIMIT 50
        `,
        sql<ConsentRow[]>`
          SELECT id, patient_id, consent_type, granted, granted_at, revoked_at,
                 NULL::TEXT AS ip_address
          FROM consent_records
          WHERE patient_id = ${id}::UUID
        `,
      ]);

      if (!patientRows[0]) return fhirNotFound(reply, `Patient/${id} not found`);

      const resources: object[] = [
        mapPatient(patientRows[0], base),
        ...entryRows.flatMap((e) => mapDailyEntryObservations(e, base)),
        ...medicationRows.map((m) => mapMedicationRequest(m, base)),
        ...assessmentRows.map((a) => mapQuestionnaireResponse(a, base)),
        ...consentRows.map((c) => mapConsent(c, base)),
      ];

      const selfUrl = `${base}/Patient/${id}/$everything`;
      sendFhir(reply, mapBundle(resources, { type: 'searchset', total: resources.length, selfUrl }));
    },
  );

  // ── GET /fhir/Observation ─────────────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/Observation',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient'] as string | undefined;
      const dateParam = request.query['date']    as string | undefined;
      const { limit, offset, page } = parsePaging(request.query);

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= query parameter is required' } }],
        }, 400);
      }

      // Validate and strip 'Patient/' prefix if present
      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const since = dateParam ?? new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]!;
      const base = fhirBase(request);

      const rows = await sql<DailyEntryRow[]>`
        SELECT id, patient_id, entry_date, mood, coping, sleep_hours, sleep_quality,
               exercise_minutes, anxiety_score, mania_score, anhedonia_score,
               suicidal_ideation, stress_score, notes, submitted_at
        FROM daily_entries
        WHERE patient_id    = ${pid}::UUID
          AND entry_date   >= ${since}::DATE
          AND submitted_at IS NOT NULL
        ORDER BY entry_date DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const observations = rows.flatMap((r) => mapDailyEntryObservations(r, base));
      const selfUrl = `${base}/Observation?patient=${pid}&date=${since}&_page=${page}&_count=${limit}`;
      const hasNext = rows.length === limit;

      sendFhir(reply, mapBundle(observations, {
        type: 'searchset',
        total: observations.length,
        selfUrl,
        ...(hasNext && { nextUrl: `${base}/Observation?patient=${pid}&date=${since}&_page=${page + 1}&_count=${limit}` }),
      }));
    },
  );

  // ── GET /fhir/MedicationRequest ───────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/MedicationRequest',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient'] as string | undefined;
      const statusParam = request.query['status'] as string | undefined;

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= query parameter is required' } }],
        }, 400);
      }

      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const activeOnly = statusParam === 'active';
      const base = fhirBase(request);

      const rows = await sql<MedicationRow[]>`
        SELECT pm.id, pm.patient_id, pm.medication_name, pm.generic_name,
               mc.rxnorm_code, pm.dose_value, pm.dose_unit, pm.frequency,
               pm.prescribed_at, pm.discontinued_at,
               NULL::TEXT AS prescriber_name, NULL::TEXT AS prescriber_npi,
               pm.notes
        FROM patient_medications pm
        LEFT JOIN medication_catalogue mc ON mc.id = pm.catalogue_id
        WHERE pm.patient_id  = ${pid}::UUID
          AND pm.show_in_app = TRUE
          ${activeOnly ? sql`AND pm.discontinued_at IS NULL` : sql``}
        ORDER BY pm.prescribed_at DESC NULLS LAST
      `;

      const resources = rows.map((r) => mapMedicationRequest(r, base));
      sendFhir(reply, mapBundle(resources, {
        type: 'searchset',
        total: resources.length,
        selfUrl: `${base}/MedicationRequest?patient=${pid}`,
      }));
    },
  );

  // ── GET /fhir/QuestionnaireResponse ──────────────────────────────────────
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/QuestionnaireResponse',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient']       as string | undefined;
      const questionnaire = request.query['questionnaire'] as string | undefined;
      const { limit, offset, page } = parsePaging(request.query);

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= is required' } }],
        }, 400);
      }

      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const base = fhirBase(request);

      // questionnaire param may be a LOINC URL or our internal scale code
      const scaleCode = questionnaire
        ? questionnaire.replace(/^urn:mindlog:assessment:/, '').toUpperCase()
        : null;

      const rows = await sql<AssessmentRow[]>`
        SELECT va.id, va.patient_id, va.scale_code, va.total_score,
               va.responses, va.severity_label, va.assessed_at,
               va.assessed_by, NULL::TEXT AS clinician_name
        FROM validated_assessments va
        WHERE va.patient_id = ${pid}::UUID
          ${scaleCode ? sql`AND va.scale_code = ${scaleCode}` : sql``}
        ORDER BY va.assessed_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const resources = rows.map((r) => mapQuestionnaireResponse(r, base));
      const selfUrl = `${base}/QuestionnaireResponse?patient=${pid}&_page=${page}&_count=${limit}`;
      const hasNext = rows.length === limit;

      sendFhir(reply, mapBundle(resources, {
        type: 'searchset',
        total: resources.length,
        selfUrl,
        ...(hasNext && { nextUrl: `${base}/QuestionnaireResponse?patient=${pid}&_page=${page + 1}&_count=${limit}` }),
      }));
    },
  );

  // ── GET /fhir/Condition ───────────────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/Condition',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient']         as string | undefined;
      const statusFilter = request.query['clinical-status'] as string | undefined;

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= is required' } }],
        }, 400);
      }

      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const base = fhirBase(request);

      // Build conditions from patient.diagnosis (simple single-row approach)
      // A production EHR integration would use a separate diagnoses table (migration 014).
      // For now we synthesise from the patients.diagnosis text field + any OMOP assignments.
      const [patient] = await sql<{
        id: string; diagnosis: string | null;
        organisation_id: string; updated_at: string;
      }[]>`
        SELECT id, diagnosis, organisation_id, updated_at
        FROM patients WHERE id = ${pid}::UUID LIMIT 1
      `;

      if (!patient) return fhirNotFound(reply, `Patient/${pid} not found`);

      const rows = await sql<DiagnosisRow[]>`
        SELECT
          oa.id,
          oa.patient_id,
          oa.icd10_code,
          oa.snomed_code,
          COALESCE(oa.description, mc.preferred_label, 'Clinical diagnosis') AS description,
          NULL::DATE AS onset_date,
          'active' AS status,
          NULL::UUID AS recorded_by,
          oa.assigned_at AS recorded_at
        FROM omop_assignments oa
        LEFT JOIN medical_codes mc ON mc.code = oa.icd10_code
        WHERE oa.patient_id   = ${pid}::UUID
          AND oa.vocabulary_id = 'ICD10CM'
          ${statusFilter === 'active' ? sql`` : sql``}
        ORDER BY oa.assigned_at DESC
      `;

      const resources = rows.map((r) => mapCondition(r, base));
      sendFhir(reply, mapBundle(resources, {
        type: 'searchset',
        total: resources.length,
        selfUrl: `${base}/Condition?patient=${pid}`,
      }));
    },
  );

  // ── GET /fhir/CarePlan ────────────────────────────────────────────────────
  // Returns a FHIR CarePlan synthesised from the crisis_safety_plan (if any)
  // plus the patient's care team membership.
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/CarePlan',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient'] as string | undefined;

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= is required' } }],
        }, 400);
      }

      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const base = fhirBase(request);

      const [safetyPlan] = await sql<{
        id: string; warning_signs: string[]; internal_coping_strategies: string[];
        crisis_line_phone: string; updated_at: string;
      }[]>`
        SELECT id, warning_signs, internal_coping_strategies,
               crisis_line_phone, updated_at
        FROM crisis_safety_plans
        WHERE patient_id = ${pid}::UUID AND is_active = TRUE
        LIMIT 1
      `;

      const carePlan = {
        resourceType: 'CarePlan',
        id: safetyPlan?.id ?? `${pid}-careplan`,
        status: 'active',
        intent: 'plan',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/care-plan-category',
            code: 'assess-plan',
            display: 'Assessment and Plan of Treatment',
          }],
        }],
        title: 'MindLog Care Plan',
        subject: { reference: `${base}/Patient/${pid}` },
        ...(safetyPlan && {
          activity: [
            ...(safetyPlan.warning_signs.length > 0 ? [{
              detail: {
                kind: 'ServiceRequest',
                status: 'in-progress',
                description: `Warning signs: ${safetyPlan.warning_signs.join('; ')}`,
              },
            }] : []),
            ...(safetyPlan.internal_coping_strategies.length > 0 ? [{
              detail: {
                kind: 'ServiceRequest',
                status: 'in-progress',
                description: `Coping strategies: ${safetyPlan.internal_coping_strategies.join('; ')}`,
              },
            }] : []),
            {
              detail: {
                kind: 'ServiceRequest',
                status: 'in-progress',
                description: `Crisis line: ${safetyPlan.crisis_line_phone}`,
              },
            },
          ],
          ...(safetyPlan.updated_at && { period: { start: safetyPlan.updated_at } }),
        }),
      };

      sendFhir(reply, mapBundle([carePlan], {
        type: 'searchset',
        total: 1,
        selfUrl: `${base}/CarePlan?patient=${pid}`,
      }));
    },
  );

  // ── GET /fhir/Consent ─────────────────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/Consent',
    clinicianOnly,
    async (request, reply) => {
      const patientId = request.query['patient'] as string | undefined;

      if (!patientId) {
        return sendFhir(reply, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', details: { text: '?patient= is required' } }],
        }, 400);
      }

      const pid = patientId.replace(/^Patient\//, '');
      UuidSchema.parse(pid);

      const ok = await assertCareTeamAccess((request.user as { sub: string; org_id: string }).sub, pid, reply);
      if (!ok) return;

      const base = fhirBase(request);

      const rows = await sql<ConsentRow[]>`
        SELECT id, patient_id, consent_type, granted, granted_at, revoked_at,
               NULL::TEXT AS ip_address
        FROM consent_records
        WHERE patient_id = ${pid}::UUID
        ORDER BY granted_at DESC NULLS LAST
      `;

      const resources = rows.map((r) => mapConsent(r, base));
      sendFhir(reply, mapBundle(resources, {
        type: 'searchset',
        total: resources.length,
        selfUrl: `${base}/Consent?patient=${pid}`,
      }));
    },
  );
}
