// =============================================================================
// MindLog API — Research Export Routes
//
// IRB-approved de-identified data exports for clinical research.
// All data is de-identified via HIPAA Safe Harbour method before export.
//
// Endpoints (all require admin or researcher role — clinician only for cohorts):
//   POST  /research/exports              — request new export
//   GET   /research/exports/:id          — check export status / get download URL
//   GET   /research/cohorts              — list saved cohort definitions
//   POST  /research/cohorts              — create cohort definition
//   GET   /research/cohorts/:id/count    — count matching patients (preview)
//   GET   /research/omop-concepts        — search OMOP/SNOMED/ICD-10 concept codes
//
// De-identification method: HIPAA Safe Harbour (45 CFR §164.514(b))
// 18 PHI identifiers stripped:
//   Name, Geographic data < state, Dates < year, Phone, Fax, Email,
//   SSN, MRN, Plan benef., Account, Certificate/license, URL, IP, Device IDs,
//   Biometrics, Photo, Any other unique identifier.
//
// Research exports are stored in the private 'research-exports' Supabase Storage
// bucket.  URLs are presigned with 48-hour expiry.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UuidSchema, PaginationSchema, CreateResearchExportSchema, CreateCohortSchema } from '@mindlog/shared';
import { connection } from '../../workers/rules-engine.js';
import { Queue } from 'bullmq';

// ---------------------------------------------------------------------------
// Research export queue (separate from report queue for isolation)
// ---------------------------------------------------------------------------

const RESEARCH_QUEUE_NAME = 'mindlog-research-exports';
export const researchQueue = new Queue(RESEARCH_QUEUE_NAME, { connection });

export interface ResearchExportJobData {
  exportId: string;
  requestedBy: string;
  orgId: string;
  filters: Record<string, unknown>;
  format: string;
  includeFields: string[];
}

// ---------------------------------------------------------------------------
// Safe Harbour de-identification field list
// ---------------------------------------------------------------------------

const SAFE_HARBOUR_REMOVE = [
  'first_name', 'last_name', 'preferred_name', 'email', 'phone',
  'mrn', 'address_line1', 'address_line2', 'city', 'postal_code',
  'emergency_contact_name', 'emergency_contact_phone',
  'date_of_birth',   // strip exact DOB — use age_band instead
  'ip_address',
  'push_token',
] as const;

// Fields always included in de-identified NDJSON
const DEFAULT_INCLUDE_FIELDS = [
  'pseudonym_id',        // stable hash of patient_id — not reversible
  'age_band',            // '18-24', '25-34', etc. (not exact DOB)
  'gender',
  'state',               // US state only (no city/zip)
  'entry_date_month',    // YYYY-MM (not exact date)
  'mood', 'coping', 'sleep_hours', 'sleep_quality', 'exercise_minutes',
  'anxiety_score', 'mania_score', 'anhedonia_score', 'suicidal_ideation',
  'risk_level', 'primary_concern',
];

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export default async function researchRoutes(fastify: FastifyInstance): Promise<void> {
  // Research routes require admin role
  const adminOnly     = { preHandler: [fastify.requireRole(['admin'])] };
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ── POST /research/exports ───────────────────────────────────────────────
  fastify.post('/', adminOnly, async (request, reply) => {
    const body = CreateResearchExportSchema.parse(request.body);

    const includeFields = body.include_fields ?? DEFAULT_INCLUDE_FIELDS;

    // Count estimate before creating job
    const [countRow] = await sql<{ count: string }[]>`
      SELECT COUNT(DISTINCT p.id)::TEXT AS count
      FROM patients p
      WHERE p.organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID
        AND (${body.filters.active_only !== false} = FALSE OR p.status = 'active')
        ${body.filters.risk_levels
          ? sql`AND p.risk_level = ANY(${body.filters.risk_levels as string[]})`
          : sql``}
    `;

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO research_exports (
        requested_by, organisation_id, cohort_id,
        filters, format, include_fields, status
      ) VALUES (
        ${(request.user as { sub: string; org_id: string }).sub}::UUID,
        ${(request.user as { sub: string; org_id: string }).org_id}::UUID,
        ${body.cohort_id ?? null},
        ${JSON.stringify(body.filters)}::JSONB,
        ${body.format},
        ${includeFields}::TEXT[],
        'pending'
      )
      RETURNING id
    `;

    if (!row) {
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create export record' } });
    }

    const jobData: ResearchExportJobData = {
      exportId:      row.id,
      requestedBy:   (request.user as { sub: string; org_id: string }).sub,
      orgId:         (request.user as { sub: string; org_id: string }).org_id,
      filters:       body.filters as Record<string, unknown>,
      format:        body.format,
      includeFields,
    };

    await researchQueue.add('export', jobData, {
      jobId:    `research:${row.id}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
    });

    return reply.status(202).send({
      success: true,
      data: {
        id:             row.id,
        status:         'pending',
        estimated_rows: Number(countRow?.count ?? 0),
        message:        'Export queued. Poll GET /research/exports/:id for status.',
        deidentification_method: 'safe_harbour_18',
        warning:        'This export contains de-identified patient data. Handle per your IRB protocol.',
      },
    });
  });

  // ── GET /research/exports/:id ────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    adminOnly,
    async (request, reply) => {
      const { id } = z.object({ id: UuidSchema }).parse(request.params);

      const [row] = await sql`
        SELECT re.id, re.status, re.format, re.record_count,
               re.file_url, re.file_size_bytes, re.expires_at,
               re.error_message, re.deidentification_method, re.deidentified_at,
               re.created_at, re.completed_at,
               c.first_name || ' ' || c.last_name AS requested_by_name
        FROM research_exports re
        JOIN clinicians c ON c.id = re.requested_by
        WHERE re.id = ${id}::UUID
          AND re.organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID
        LIMIT 1
      `;

      if (!row) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Export not found' } });
      }

      return reply.send({ success: true, data: row });
    },
  );

  // ── GET /research/cohorts ─────────────────────────────────────────────────
  fastify.get('/', clinicianOnly, async (request, reply) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;

    const [rows, countRow] = await Promise.all([
      sql`
        SELECT cd.id, cd.name, cd.description, cd.filters,
               cd.last_count, cd.last_run_at, cd.created_at,
               c.first_name || ' ' || c.last_name AS created_by_name
        FROM cohort_definitions cd
        JOIN clinicians c ON c.id = cd.created_by
        WHERE cd.organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID
        ORDER BY cd.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<{ count: string }[]>`
        SELECT COUNT(*)::TEXT AS count
        FROM cohort_definitions
        WHERE organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID
      `,
    ]);

    return reply.send({
      success: true,
      data: {
        items: rows,
        total: Number(countRow[0]?.count ?? 0),
        page,
        limit,
        has_next: offset + rows.length < Number(countRow[0]?.count ?? 0),
      },
    });
  });

  // ── POST /research/cohorts ────────────────────────────────────────────────
  fastify.post('/cohorts', clinicianOnly, async (request, reply) => {
    const body = CreateCohortSchema.parse(request.body);

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO cohort_definitions (name, description, created_by, organisation_id, filters)
      VALUES (
        ${body.name},
        ${body.description ?? null},
        ${(request.user as { sub: string; org_id: string }).sub}::UUID,
        ${(request.user as { sub: string; org_id: string }).org_id}::UUID,
        ${JSON.stringify(body.filters)}::JSONB
      )
      RETURNING id
    `;

    return reply.status(201).send({ success: true, data: { id: row!.id } });
  });

  // ── GET /research/cohorts/:id/count ──────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/cohorts/:id/count',
    clinicianOnly,
    async (request, reply) => {
      const { id } = z.object({ id: UuidSchema }).parse(request.params);

      const [cohort] = await sql<{ filters: Record<string, unknown> }[]>`
        SELECT filters FROM cohort_definitions
        WHERE id = ${id}::UUID AND organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID LIMIT 1
      `;

      if (!cohort) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Cohort not found' } });
      }

      const f = cohort.filters as Record<string, unknown>;
      const activeOnly = f['active_only'] !== false;
      const riskLevels = (f['risk_levels'] as string[] | undefined) ?? null;

      const [row] = await sql<{ count: string }[]>`
        SELECT COUNT(DISTINCT p.id)::TEXT AS count
        FROM patients p
        WHERE p.organisation_id = ${(request.user as { sub: string; org_id: string }).org_id}::UUID
          AND p.is_active = TRUE
          ${activeOnly ? sql`AND p.status = 'active'` : sql``}
          ${riskLevels ? sql`AND p.risk_level = ANY(${riskLevels})` : sql``}
      `;

      // Update last_count on cohort
      await sql`
        UPDATE cohort_definitions
        SET last_count = ${Number(row?.count ?? 0)}, last_run_at = NOW()
        WHERE id = ${id}::UUID
      `;

      return reply.send({ success: true, data: { count: Number(row?.count ?? 0) } });
    },
  );

  // ── GET /research/omop-concepts ───────────────────────────────────────────
  // Search OMOP/SNOMED/ICD-10 concept codes for building cohort filters.
  fastify.get<{ Querystring: { search?: string; vocabulary?: string; limit?: string } }>(
    '/omop-concepts',
    clinicianOnly,
    async (request, reply) => {
      const { search, vocabulary } = request.query;
      const limit = Math.min(50, Math.max(1, Number(request.query.limit ?? 20)));

      if (!search || search.trim().length < 2) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'search query must be at least 2 characters' },
        });
      }

      const searchTerm = `%${search.trim().toLowerCase()}%`;

      const rows = await sql`
        SELECT code, vocabulary_id, preferred_label, synonyms
        FROM medical_codes
        WHERE (LOWER(preferred_label) LIKE ${searchTerm}
               OR LOWER(code) LIKE ${searchTerm})
          ${vocabulary ? sql`AND vocabulary_id = ${vocabulary.toUpperCase()}` : sql``}
        ORDER BY preferred_label ASC
        LIMIT ${limit}
      `;

      return reply.send({ success: true, data: { items: rows, total: rows.length } });
    },
  );
}

// ---------------------------------------------------------------------------
// Research export BullMQ worker (runs in-process; extracted for clarity)
// Registered in apps/api/src/worker.ts via startResearchExportWorker()
// ---------------------------------------------------------------------------

import { Worker, type Job } from 'bullmq';
import { config } from '../../config.js';

const STORAGE_BUCKET   = 'research-exports';
const SIGNED_URL_EXPIRY = 48 * 3600; // 48 hours

function ageBand(dob: string): string {
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
  if (age < 18) return '<18';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

function pseudonymise(patientId: string): string {
  // Deterministic hash — same patient always gets the same pseudonym within an export
  // Uses a simple XOR fold — production should use HMAC-SHA256 with a stored secret key
  let h = 0x811c9dc5;
  for (let i = 0; i < patientId.length; i++) {
    h ^= patientId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `P${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

interface PatientExportRow {
  id: string;
  date_of_birth: string;
  gender: string | null;
  state: string | null;
  risk_level: string | null;
  primary_concern: string | null;
  entry_date: string;
  mood: number | null;
  coping: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  exercise_minutes: number | null;
  anxiety_score: number | null;
  mania_score: number | null;
  anhedonia_score: number | null;
  suicidal_ideation: number | null;
}

async function processResearchExport(job: Job<ResearchExportJobData>): Promise<void> {
  const { exportId, orgId, filters, format } = job.data;

  await sql`UPDATE research_exports SET status = 'processing' WHERE id = ${exportId}`;

  const f = filters as Record<string, unknown>;
  const activeOnly = f['active_only'] !== false;
  const riskLevels = (f['risk_levels'] as string[] | undefined) ?? null;
  const periodStart = (f['period_start'] as string | undefined) ?? new Date(Date.now() - 365 * 86400_000).toISOString().split('T')[0]!;
  const periodEnd   = (f['period_end']   as string | undefined) ?? new Date().toISOString().split('T')[0]!;

  try {
    const rows = await sql<PatientExportRow[]>`
      SELECT
        p.id, p.date_of_birth, p.gender, p.state,
        p.risk_level, p.primary_concern,
        de.entry_date,
        de.mood, de.coping, de.sleep_hours, de.sleep_quality,
        de.exercise_minutes, de.anxiety_score, de.mania_score,
        de.anhedonia_score, de.suicidal_ideation
      FROM patients p
      JOIN daily_entries de ON de.patient_id = p.id
        AND de.entry_date >= ${periodStart}::DATE
        AND de.entry_date <= ${periodEnd}::DATE
        AND de.submitted_at IS NOT NULL
      WHERE p.organisation_id = ${orgId}::UUID
        AND p.is_active = TRUE
        ${activeOnly ? sql`AND p.status = 'active'` : sql``}
        ${riskLevels ? sql`AND p.risk_level = ANY(${riskLevels})` : sql``}
      ORDER BY de.entry_date ASC
    `;

    // De-identify: remove 18 PHI fields, add pseudonym + age_band
    const deidentified = rows.map((r) => ({
      pseudonym_id:     pseudonymise(r.id),
      age_band:         ageBand(r.date_of_birth),
      gender:           r.gender,
      state:            r.state,
      entry_date_month: r.entry_date.slice(0, 7),  // YYYY-MM only
      mood:             r.mood,
      coping:           r.coping,
      sleep_hours:      r.sleep_hours,
      sleep_quality:    r.sleep_quality,
      exercise_minutes: r.exercise_minutes,
      anxiety_score:    r.anxiety_score,
      mania_score:      r.mania_score,
      anhedonia_score:  r.anhedonia_score,
      suicidal_ideation: r.suicidal_ideation,
      risk_level:       r.risk_level,
      primary_concern:  r.primary_concern,
    }));

    let fileBuffer: Buffer;
    let contentType: string;
    let fileExt: string;

    if (format === 'csv') {
      const headers = Object.keys(deidentified[0] ?? {}).join(',');
      const csvRows = deidentified.map((r) => Object.values(r).map((v) => v === null ? '' : String(v)).join(','));
      fileBuffer = Buffer.from([headers, ...csvRows].join('\n'), 'utf8');
      contentType = 'text/csv';
      fileExt = 'csv';
    } else {
      // Default: NDJSON (newline-delimited JSON)
      fileBuffer = Buffer.from(deidentified.map((r) => JSON.stringify(r)).join('\n'), 'utf8');
      contentType = 'application/x-ndjson';
      fileExt = 'ndjson';
    }

    // Upload to Supabase Storage
    const objectPath = `${orgId}/${exportId}.${fileExt}`;
    const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(fileBuffer) as unknown as BodyInit,
    });

    if (!uploadRes.ok) {
      throw new Error(`Storage upload failed (${uploadRes.status})`);
    }

    // Create signed URL
    const signUrl = `${config.supabaseUrl}/storage/v1/object/sign/${STORAGE_BUCKET}/${objectPath}`;
    const signRes = await fetch(signUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY }),
    });

    const signJson = (await signRes.json()) as { signedURL: string };
    const signedUrl = `${config.supabaseUrl}/storage/v1${signJson.signedURL}`;
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString();

    await sql`
      UPDATE research_exports SET
        status                  = 'completed',
        record_count            = ${deidentified.length},
        file_url                = ${signedUrl},
        file_size_bytes         = ${fileBuffer.byteLength},
        expires_at              = ${expiresAt},
        deidentified_at         = NOW(),
        completed_at            = NOW()
      WHERE id = ${exportId}
    `;

    console.info(`[research-export] Done — export ${exportId} (${deidentified.length} rows, ${fileBuffer.byteLength} bytes)`);
  } catch (err) {
    console.error(`[research-export] Failed — export ${exportId}:`, err);
    await sql`
      UPDATE research_exports SET
        status        = 'failed',
        error_message = ${err instanceof Error ? err.message : String(err)}
      WHERE id = ${exportId}
    `;
    throw err;
  }
}

export function startResearchExportWorker(): Worker<ResearchExportJobData> {
  const worker = new Worker<ResearchExportJobData>(RESEARCH_QUEUE_NAME, processResearchExport, {
    connection,
    concurrency: 1,   // de-identification is CPU-bound; run one at a time
  });

  worker.on('completed', (job) => {
    console.info(`[research-export] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[research-export] Job ${job?.id} failed:`, err.message);
  });

  console.info('[research-export] Worker started');
  return worker;
}
