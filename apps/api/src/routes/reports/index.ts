// =============================================================================
// MindLog API — Report routes
// POST /api/v1/reports       — request report generation (enqueues BullMQ job)
// GET  /api/v1/reports       — list reports for clinician (paginated)
// GET  /api/v1/reports/:id   — get report status / signed download URL
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { CreateReportSchema, UuidSchema, PaginationSchema } from '@mindlog/shared';
import { reportQueue, type ReportJobData } from '../../workers/report-generator.js';

// Helper to check if current user is an admin
async function isAdminUser(userId: string): Promise<boolean> {
  const [clinician] = await sql<{ role: string }[]>`
    SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
  `;
  return clinician?.role === 'admin';
}

// Maps Zod schema report_type values → DB CHECK constraint values
// DB allows: 'individual_patient' | 'population_summary' | 'handover' | 'custom'
const REPORT_TYPE_DB_MAP: Record<string, string> = {
  weekly_summary:  'individual_patient',
  monthly_summary: 'population_summary', // aggregate caseload — no patient_id
  clinical_export: 'handover',           // cover-clinician handover — no patient_id
  cda_handover:    'handover',           // CDA R2 XML handover — requires patient_id
};

const REPORT_TYPE_LABEL: Record<string, string> = {
  weekly_summary:  'Individual Patient Report',
  monthly_summary: 'Population Summary',
  clinical_export: 'Handover Report',
  cda_handover:    'CDA R2 Handover Document',
};

// Reports that require a patient_id + care-team check
const REQUIRES_PATIENT = new Set(['weekly_summary', 'cda_handover']);

export default async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ---------------------------------------------------------------------------
  // POST /reports — request report generation
  // ---------------------------------------------------------------------------
  fastify.post('/', clinicianOnly, async (request, reply) => {
    const body = CreateReportSchema.parse(request.body);
    const isAdmin = await isAdminUser(request.user.sub);

    // For individual patient reports, verify care team access (admin bypasses)
    if (REQUIRES_PATIENT.has(body.report_type)) {
      if (!body.patient_id) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'patient_id is required for individual patient reports' },
        });
      }
      if (!isAdmin) {
        const [access] = await sql<{ id: string }[]>`
          SELECT ctm.id FROM care_team_members ctm
          WHERE ctm.patient_id   = ${body.patient_id}
            AND ctm.clinician_id = ${request.user.sub}
            AND ctm.unassigned_at IS NULL
        `;
        if (!access) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: "Not on this patient's care team" },
          });
        }
      }
    }

    const reportTitle = `${REPORT_TYPE_LABEL[body.report_type] ?? body.report_type} ${body.period_start} – ${body.period_end}`;
    const dbReportType = REPORT_TYPE_DB_MAP[body.report_type] ?? 'individual_patient';

    // Insert report record (patient_id is NULL for population/handover reports)
    const patientId = body.patient_id ?? null;
    const [report] = await sql<{ id: string }[]>`
      INSERT INTO clinical_reports (
        patient_id, clinician_id, organisation_id,
        report_type, title, date_range_start, date_range_end,
        status, parameters
      ) VALUES (
        ${patientId}, ${request.user.sub}, ${request.user.org_id},
        ${dbReportType}, ${reportTitle},
        ${body.period_start}, ${body.period_end},
        'pending',
        ${JSON.stringify({ report_subtype: body.report_type })}
      )
      RETURNING id
    `;

    if (!report) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create report record' },
      });
    }

    // Enqueue PDF generation
    const jobData: ReportJobData = {
      reportId: report.id,
      ...(patientId ? { patientId } : {}),
      clinicianId: request.user.sub,
      orgId: request.user.org_id,
      reportType: body.report_type,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      title: reportTitle,
    };

    await reportQueue.add('generate', jobData, {
      jobId: `report:${report.id}`, // idempotent re-enqueue
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return reply.status(202).send({
      success: true,
      data: {
        id: report.id,
        status: 'pending',
        title: reportTitle,
        message: 'Report queued for generation. Poll GET /reports/:id for status.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /reports — list clinician's reports (paginated, newest first); admin sees all
  // ---------------------------------------------------------------------------
  fastify.get('/', clinicianOnly, async (request, reply) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;
    const isAdmin = await isAdminUser(request.user.sub);

    let reports;
    let countResult;

    if (isAdmin) {
      // Admin sees ALL reports across all organizations
      reports = await sql`
        SELECT
          cr.id, cr.patient_id,
          p.first_name  AS patient_first_name,
          p.last_name   AS patient_last_name,
          cr.report_type, cr.title,
          cr.date_range_start, cr.date_range_end,
          cr.status, cr.file_url, cr.file_size_bytes,
          cr.generated_at, cr.expires_at, cr.created_at,
          cr.parameters
        FROM clinical_reports cr
        LEFT JOIN patients p ON p.id = cr.patient_id
        ORDER BY cr.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      [countResult] = await sql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM clinical_reports
      `;
    } else {
      reports = await sql`
        SELECT
          cr.id, cr.patient_id,
          p.first_name  AS patient_first_name,
          p.last_name   AS patient_last_name,
          cr.report_type, cr.title,
          cr.date_range_start, cr.date_range_end,
          cr.status, cr.file_url, cr.file_size_bytes,
          cr.generated_at, cr.expires_at, cr.created_at,
          cr.parameters
        FROM clinical_reports cr
        LEFT JOIN patients p ON p.id = cr.patient_id
        WHERE cr.clinician_id    = ${request.user.sub}
          AND cr.organisation_id = ${request.user.org_id}
        ORDER BY cr.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      [countResult] = await sql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM clinical_reports
        WHERE clinician_id    = ${request.user.sub}
          AND organisation_id = ${request.user.org_id}
      `;
    }

    const count = countResult?.count ?? '0';

    return reply.send({
      success: true,
      data: {
        items: reports,
        total: Number(count),
        page,
        limit,
        has_next: offset + reports.length < Number(count),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /reports/:id — status + download URL (admin can access any)
  // ---------------------------------------------------------------------------
  fastify.get('/:id', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const isAdmin = await isAdminUser(request.user.sub);

    let report;

    if (isAdmin) {
      // Admin can access any report
      [report] = await sql`
        SELECT
          cr.id, cr.patient_id,
          p.first_name  AS patient_first_name,
          p.last_name   AS patient_last_name,
          cr.report_type, cr.title,
          cr.date_range_start, cr.date_range_end,
          cr.status, cr.file_url, cr.file_size_bytes,
          cr.generated_at, cr.expires_at, cr.created_at,
          cr.parameters
        FROM clinical_reports cr
        LEFT JOIN patients p ON p.id = cr.patient_id
        WHERE cr.id = ${id}
        LIMIT 1
      `;
    } else {
      [report] = await sql`
        SELECT
          cr.id, cr.patient_id,
          p.first_name  AS patient_first_name,
          p.last_name   AS patient_last_name,
          cr.report_type, cr.title,
          cr.date_range_start, cr.date_range_end,
          cr.status, cr.file_url, cr.file_size_bytes,
          cr.generated_at, cr.expires_at, cr.created_at,
          cr.parameters
        FROM clinical_reports cr
        LEFT JOIN patients p ON p.id = cr.patient_id
        WHERE cr.id             = ${id}
          AND cr.clinician_id    = ${request.user.sub}
          AND cr.organisation_id = ${request.user.org_id}
        LIMIT 1
      `;
    }

    if (!report) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    return reply.send({ success: true, data: report });
  });
}
