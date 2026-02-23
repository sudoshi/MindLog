// =============================================================================
// MindLog API — Admin routes
// GET    /api/v1/admin/users              — list all clinicians (admin only)
// GET    /api/v1/admin/users/:id          — get single clinician details
// POST   /api/v1/admin/users              — create new clinician
// PATCH  /api/v1/admin/users/:id          — update clinician
// GET    /api/v1/admin/audit-log          — query audit log entries
// GET    /api/v1/admin/audit-log/export   — export audit log as CSV
// GET    /api/v1/admin/stats              — admin dashboard stats
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { UuidSchema, PaginationSchema } from '@mindlog/shared';
import { auditLog } from '../../middleware/audit.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const AuditLogFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  resource_type: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  from_date: z.string().optional(), // ISO date string
  to_date: z.string().optional(),
});

const CreateClinicianSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  role: z.enum(['clinician', 'admin']).default('clinician'),
  npi: z.string().max(20).optional(),
});

const UpdateClinicianSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  title: z.string().max(100).optional(),
  role: z.enum(['clinician', 'admin']).optional(),
  npi: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // All admin routes require admin role
  const adminOnly = { preHandler: [fastify.requireRole(['admin'])] };

  // ---------------------------------------------------------------------------
  // GET /admin/stats — Dashboard statistics
  // ---------------------------------------------------------------------------
  fastify.get('/stats', adminOnly, async (request, reply) => {
    const orgId = request.user.org_id;

    // Run multiple queries in parallel for efficiency
    const [
      [patientStats],
      [clinicianStats],
      [alertStats],
      [auditStats],
    ] = await Promise.all([
      // Patient counts
      sql<{ total: number; active: number; crisis: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'crisis')::int AS crisis
        FROM patients
        WHERE organisation_id = ${orgId} AND is_active = TRUE
      `,
      // Clinician counts
      sql<{ total: number; active: number; admins: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
          COUNT(*) FILTER (WHERE role = 'admin' AND is_active = TRUE)::int AS admins
        FROM clinicians
        WHERE organisation_id = ${orgId}
      `,
      // Alert counts (last 24h)
      sql<{ critical: number; warning: number; total: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE severity = 'critical' AND acknowledged_at IS NULL)::int AS critical,
          COUNT(*) FILTER (WHERE severity = 'warning' AND acknowledged_at IS NULL)::int AS warning,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS total
        FROM clinical_alerts
        WHERE organisation_id = ${orgId}
      `,
      // Audit log stats (last 24h)
      sql<{ total: number; phi_access: number; errors: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE action = 'read' AND resource_type IN ('patients', 'journal_entries', 'daily_entries'))::int AS phi_access,
          COUNT(*) FILTER (WHERE success = FALSE)::int AS errors
        FROM audit_log
        WHERE organisation_id = ${orgId}
          AND occurred_at > NOW() - INTERVAL '24 hours'
      `,
    ]);

    return reply.send({
      success: true,
      data: {
        patients: patientStats,
        clinicians: clinicianStats,
        alerts: alertStats,
        audit: auditStats,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/users — List all clinicians
  // ---------------------------------------------------------------------------
  fastify.get('/users', adminOnly, async (request, reply) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;
    const orgId = request.user.org_id;

    const users = await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      title: string | null;
      role: string;
      npi: string | null;
      is_active: boolean;
      mfa_enabled: boolean;
      last_login_at: string | null;
      created_at: string;
      patients_assigned: number;
    }[]>`
      SELECT
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.title,
        c.role,
        c.npi,
        c.is_active,
        c.mfa_enabled,
        c.last_login_at,
        c.created_at,
        (
          SELECT COUNT(*)::int
          FROM care_team_members ctm
          WHERE ctm.clinician_id = c.id AND ctm.unassigned_at IS NULL
        ) AS patients_assigned
      FROM clinicians c
      WHERE c.organisation_id = ${orgId}
      ORDER BY c.last_name, c.first_name
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count
      FROM clinicians
      WHERE organisation_id = ${orgId}
    `;

    const total = Number(countResult[0]?.count ?? 0);
    return reply.send({
      success: true,
      data: {
        items: users,
        total,
        page,
        limit,
        has_next: offset + users.length < total,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/users/:id — Get single clinician
  // ---------------------------------------------------------------------------
  fastify.get('/users/:id', adminOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const orgId = request.user.org_id;

    const [user] = await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      title: string | null;
      role: string;
      npi: string | null;
      is_active: boolean;
      mfa_enabled: boolean;
      last_login_at: string | null;
      created_at: string;
      updated_at: string;
    }[]>`
      SELECT id, email, first_name, last_name, title, role, npi,
             is_active, mfa_enabled, last_login_at, created_at, updated_at
      FROM clinicians
      WHERE id = ${id} AND organisation_id = ${orgId}
      LIMIT 1
    `;

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return reply.send({ success: true, data: user });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/users — Create new clinician
  // ---------------------------------------------------------------------------
  fastify.post('/users', adminOnly, async (request, reply) => {
    const body = CreateClinicianSchema.parse(request.body);
    const orgId = request.user.org_id;

    // Check if email already exists
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM clinicians WHERE email = ${body.email} LIMIT 1
    `;

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists' },
      });
    }

    // Create clinician (password will need to be set via invite/reset flow)
    const [newUser] = await sql<{ id: string; email: string; created_at: string }[]>`
      INSERT INTO clinicians (
        organisation_id, email, first_name, last_name, title, role, npi, is_active
      ) VALUES (
        ${orgId},
        ${body.email},
        ${body.first_name},
        ${body.last_name},
        ${body.title ?? null},
        ${body.role},
        ${body.npi ?? null},
        TRUE
      )
      RETURNING id, email, created_at
    `;

    await auditLog({
      actor: request.user,
      action: 'create',
      resourceType: 'clinicians',
      resourceId: newUser?.id,
      newValues: { email: body.email, role: body.role },
      ipAddress: request.ip,
    });

    return reply.status(201).send({
      success: true,
      data: newUser,
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/users/:id — Update clinician
  // ---------------------------------------------------------------------------
  fastify.patch('/users/:id', adminOnly, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const body = UpdateClinicianSchema.parse(request.body);
    const orgId = request.user.org_id;

    // Verify user exists and belongs to org
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM clinicians
      WHERE id = ${id} AND organisation_id = ${orgId}
      LIMIT 1
    `;

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    // Prevent admin from deactivating themselves
    if (body.is_active === false && id === request.user.sub) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SELF_DEACTIVATE', message: 'Cannot deactivate your own account' },
      });
    }

    const [updated] = await sql<{ id: string; email: string; role: string; is_active: boolean }[]>`
      UPDATE clinicians SET
        first_name = COALESCE(${body.first_name ?? null}, first_name),
        last_name = COALESCE(${body.last_name ?? null}, last_name),
        title = COALESCE(${body.title ?? null}, title),
        role = COALESCE(${body.role ?? null}, role),
        npi = COALESCE(${body.npi ?? null}, npi),
        is_active = COALESCE(${body.is_active ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, role, is_active
    `;

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'clinicians',
      resourceId: id,
      newValues: body as Record<string, unknown>,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/audit-log — Query audit log entries
  // ---------------------------------------------------------------------------
  fastify.get('/audit-log', adminOnly, async (request, reply) => {
    const query = AuditLogFilterSchema.parse(request.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const orgId = request.user.org_id;

    // Build dynamic filters
    const actionFilter = query.action ?? null;
    const resourceTypeFilter = query.resource_type ?? null;
    const actorIdFilter = query.actor_id ?? null;
    const patientIdFilter = query.patient_id ?? null;
    const fromDateFilter = query.from_date ?? null;
    const toDateFilter = query.to_date ?? null;

    const entries = await sql<{
      id: string;
      actor_id: string;
      actor_email: string;
      action: string;
      resource_type: string;
      resource_id: string | null;
      patient_id: string | null;
      new_values: Record<string, unknown> | null;
      ip_address: string | null;
      user_agent: string | null;
      occurred_at: string;
    }[]>`
      SELECT
        al.id,
        al.actor_id,
        COALESCE(c.email, 'system') AS actor_email,
        al.action,
        al.resource_type,
        al.resource_id,
        al.patient_id,
        al.new_values,
        al.ip_address,
        al.user_agent,
        al.occurred_at
      FROM audit_log al
      LEFT JOIN clinicians c ON c.id = al.actor_id
      WHERE al.organisation_id = ${orgId}
        AND (${actionFilter}::TEXT IS NULL OR al.action = ${actionFilter})
        AND (${resourceTypeFilter}::TEXT IS NULL OR al.resource_type = ${resourceTypeFilter})
        AND (${actorIdFilter}::UUID IS NULL OR al.actor_id = ${actorIdFilter}::UUID)
        AND (${patientIdFilter}::UUID IS NULL OR al.patient_id = ${patientIdFilter}::UUID)
        AND (${fromDateFilter}::DATE IS NULL OR al.occurred_at >= ${fromDateFilter}::DATE)
        AND (${toDateFilter}::DATE IS NULL OR al.occurred_at < (${toDateFilter}::DATE + INTERVAL '1 day'))
      ORDER BY al.occurred_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count
      FROM audit_log al
      WHERE al.organisation_id = ${orgId}
        AND (${actionFilter}::TEXT IS NULL OR al.action = ${actionFilter})
        AND (${resourceTypeFilter}::TEXT IS NULL OR al.resource_type = ${resourceTypeFilter})
        AND (${actorIdFilter}::UUID IS NULL OR al.actor_id = ${actorIdFilter}::UUID)
        AND (${patientIdFilter}::UUID IS NULL OR al.patient_id = ${patientIdFilter}::UUID)
        AND (${fromDateFilter}::DATE IS NULL OR al.occurred_at >= ${fromDateFilter}::DATE)
        AND (${toDateFilter}::DATE IS NULL OR al.occurred_at < (${toDateFilter}::DATE + INTERVAL '1 day'))
    `;

    const total = Number(countResult[0]?.count ?? 0);
    return reply.send({
      success: true,
      data: {
        items: entries,
        total,
        page,
        limit,
        has_next: offset + entries.length < total,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/audit-log/export — Export audit log as CSV
  // ---------------------------------------------------------------------------
  fastify.get('/audit-log/export', adminOnly, async (request, reply) => {
    const query = AuditLogFilterSchema.parse(request.query);
    const orgId = request.user.org_id;

    const actionFilter = query.action ?? null;
    const resourceTypeFilter = query.resource_type ?? null;
    const fromDateFilter = query.from_date ?? null;
    const toDateFilter = query.to_date ?? null;

    const entries = await sql<{
      occurred_at: string;
      actor_email: string;
      action: string;
      resource_type: string;
      resource_id: string | null;
      patient_id: string | null;
      ip_address: string | null;
    }[]>`
      SELECT
        al.occurred_at,
        COALESCE(c.email, 'system') AS actor_email,
        al.action,
        al.resource_type,
        al.resource_id,
        al.patient_id,
        al.ip_address
      FROM audit_log al
      LEFT JOIN clinicians c ON c.id = al.actor_id
      WHERE al.organisation_id = ${orgId}
        AND (${actionFilter}::TEXT IS NULL OR al.action = ${actionFilter})
        AND (${resourceTypeFilter}::TEXT IS NULL OR al.resource_type = ${resourceTypeFilter})
        AND (${fromDateFilter}::DATE IS NULL OR al.occurred_at >= ${fromDateFilter}::DATE)
        AND (${toDateFilter}::DATE IS NULL OR al.occurred_at < (${toDateFilter}::DATE + INTERVAL '1 day'))
      ORDER BY al.occurred_at DESC
      LIMIT 10000
    `;

    // Generate CSV
    const header = 'Timestamp,User,Action,Resource Type,Resource ID,Patient ID,IP Address';
    const rows = entries.map((e) =>
      `"${e.occurred_at}","${e.actor_email}","${e.action}","${e.resource_type}","${e.resource_id ?? ''}","${e.patient_id ?? ''}","${e.ip_address ?? ''}"`
    );
    const csv = [header, ...rows].join('\n');

    await auditLog({
      actor: request.user,
      action: 'export',
      resourceType: 'audit_log',
      newValues: { count: entries.length },
      ipAddress: request.ip,
    });

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`);
    return reply.send(csv);
  });
}
