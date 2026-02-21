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

// Maps Zod schema report_type values → DB CHECK constraint values
const REPORT_TYPE_DB_MAP: Record<string, string> = {
  weekly_summary: 'individual_patient',
  monthly_summary: 'individual_patient',
  clinical_export: 'individual_patient',
};

const REPORT_TYPE_LABEL: Record<string, string> = {
  weekly_summary: 'Weekly Summary',
  monthly_summary: 'Monthly Summary',
  clinical_export: 'Clinical Export',
};

export default async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const clinicianOnly = { preHandler: [fastify.requireRole(['clinician', 'admin'])] };

  // ---------------------------------------------------------------------------
  // POST /reports — request report generation
  // ---------------------------------------------------------------------------
  fastify.post('/', clinicianOnly, async (request, reply) => {
    const body = CreateReportSchema.parse(request.body);

    // Verify care team access
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

    const reportTitle = `${REPORT_TYPE_LABEL[body.report_type] ?? body.report_type} ${body.period_start} – ${body.period_end}`;
    const dbReportType = REPORT_TYPE_DB_MAP[body.report_type] ?? 'individual_patient';

    // Insert report record
    const [report] = await sql<{ id: string }[]>`
      INSERT INTO clinical_reports (
        patient_id, clinician_id, organisation_id,
        report_type, title, date_range_start, date_range_end,
        status, parameters
      ) VALUES (
        ${body.patient_id}, ${request.user.sub}, ${request.user.org_id},
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
      patientId: body.patient_id,
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
  // GET /reports — list clinician's reports (paginated, newest first)
  // ---------------------------------------------------------------------------
  fastify.get('/', clinicianOnly, async (request, reply) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;

    const reports = await sql`
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

    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM clinical_reports
      WHERE clinician_id    = ${request.user.sub}
        AND organisation_id = ${request.user.org_id}
    `;

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
  // GET /reports/:id — status + download URL
  // ---------------------------------------------------------------------------
  fastify.get('/:id', clinicianOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);

    const [report] = await sql`
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

    if (!report) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    return reply.send({ success: true, data: report });
  });
}
