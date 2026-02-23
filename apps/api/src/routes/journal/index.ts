// =============================================================================
// MindLog API — Journal entry routes
// POST  /api/v1/journal              — create entry (linked to daily entry)
// GET   /api/v1/journal              — list patient's entries (paginated)
// GET   /api/v1/journal/:id          — get single entry
// PATCH /api/v1/journal/:id          — update entry (before 24h window)
// PATCH /api/v1/journal/:id/share    — toggle share with care team
// GET   /api/v1/journal/shared/:patientId — clinician: read shared entries
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { CreateJournalEntrySchema, UpdateJournalEntrySchema, PaginationSchema, UuidSchema } from '@mindlog/shared';
import { auditLog } from '../../middleware/audit.js';

export default async function journalRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // Helper to check if current user is an admin
  async function isAdminUser(userId: string): Promise<boolean> {
    const [clinician] = await sql<{ role: string }[]>`
      SELECT role FROM clinicians WHERE id = ${userId}::UUID LIMIT 1
    `;
    return clinician?.role === 'admin';
  }

  // ---------------------------------------------------------------------------
  // POST /journal — create entry
  // ---------------------------------------------------------------------------
  fastify.post('/', auth, async (request, reply) => {
    const body = CreateJournalEntrySchema.parse(request.body);
    const patientId = request.user.sub;

    // Journal is linked to a daily_entry. Find today's entry or the most recent one.
    const today = new Date().toISOString().split('T')[0]!;
    let [dailyEntry] = await sql<{ id: string }[]>`
      SELECT id FROM daily_entries WHERE patient_id = ${patientId} AND entry_date = ${today} LIMIT 1
    `;

    // Create a bare daily_entry for today if none exists yet
    if (!dailyEntry) {
      [dailyEntry] = await sql<{ id: string }[]>`
        INSERT INTO daily_entries (patient_id, entry_date, started_at)
        VALUES (${patientId}, ${today}, NOW())
        ON CONFLICT (patient_id, entry_date) DO UPDATE SET last_saved_at = NOW()
        RETURNING id
      `;
    }

    if (!dailyEntry) throw new Error('Failed to create daily entry anchor');

    const wordCount = body.body.trim().split(/\s+/).filter(Boolean).length;

    const [entry] = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO journal_entries (
        daily_entry_id, patient_id, entry_date,
        body, body_format, word_count, shared_with_clinician, is_encrypted
      ) VALUES (
        ${dailyEntry.id}, ${patientId}, ${today},
        ${body.body}, 'markdown', ${wordCount},
        ${body.is_shared_with_care_team ?? false}, FALSE
      )
      ON CONFLICT (daily_entry_id) DO UPDATE
        SET body = EXCLUDED.body,
            word_count = EXCLUDED.word_count,
            shared_with_clinician = EXCLUDED.shared_with_clinician,
            shared_at = CASE
              WHEN EXCLUDED.shared_with_clinician = TRUE AND journal_entries.shared_with_clinician = FALSE
              THEN NOW() ELSE journal_entries.shared_at END,
            updated_at = NOW()
      RETURNING id, created_at
    `;

    if (!entry) throw new Error('Failed to create journal entry');

    // Mark journal_complete on daily entry
    await sql`
      UPDATE daily_entries SET journal_complete = TRUE WHERE id = ${dailyEntry.id}
    `;

    await auditLog({
      actor: request.user,
      action: 'create',
      resourceType: 'journal_entries',
      resourceId: entry.id,
      patientId,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ success: true, data: { id: entry.id, created_at: entry.created_at } });
  });

  // ---------------------------------------------------------------------------
  // GET /journal — patient's own journal (paginated)
  // ---------------------------------------------------------------------------
  fastify.get('/', auth, async (request, reply) => {
    const query = PaginationSchema.parse(request.query);
    const limit = query.limit;
    const offset = (query.page - 1) * limit;
    const patientId = request.user.sub;

    const entries = await sql<{
      id: string; entry_date: string; word_count: number;
      shared_with_clinician: boolean; created_at: string;
    }[]>`
      SELECT id, entry_date, word_count, shared_with_clinician, created_at
      FROM journal_entries
      WHERE patient_id = ${patientId}
      ORDER BY entry_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [_countRow] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM journal_entries WHERE patient_id = ${patientId}
    `;
    const count = _countRow?.count ?? '0';

    const total = Number(count);
    return reply.send({
      success: true,
      data: { items: entries, total, page: query.page, limit, has_next: offset + entries.length < total },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /journal/:id — single entry (patient reads own; clinician reads if shared; admin reads any)
  // ---------------------------------------------------------------------------
  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const userId = request.user.sub;
    const role = request.user.role;
    const isAdmin = await isAdminUser(userId);

    let entry;

    if (role === 'patient') {
      [entry] = await sql`
        SELECT id, entry_date, body, word_count, shared_with_clinician, shared_at, created_at, updated_at
        FROM journal_entries
        WHERE id = ${id} AND patient_id = ${userId}
        LIMIT 1
      `;
    } else if (isAdmin) {
      // Admin can read any journal entry
      [entry] = await sql`
        SELECT je.id, je.entry_date, je.body, je.word_count, je.shared_with_clinician, je.created_at,
               je.patient_id
        FROM journal_entries je
        WHERE je.id = ${id}
        LIMIT 1
      `;
    } else {
      // Clinician: only if shared and on care team
      [entry] = await sql`
        SELECT je.id, je.entry_date, je.body, je.word_count, je.shared_with_clinician, je.created_at
        FROM journal_entries je
        JOIN care_team_members ctm ON ctm.patient_id = je.patient_id AND ctm.unassigned_at IS NULL
        WHERE je.id = ${id}
          AND je.shared_with_clinician = TRUE
          AND ctm.clinician_id = ${userId}
        LIMIT 1
      `;
    }

    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Journal entry not found' } });
    }

    await auditLog({
      actor: request.user,
      action: 'read',
      resourceType: 'journal_entries',
      resourceId: id,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: entry });
  });

  // ---------------------------------------------------------------------------
  // PATCH /journal/:id — update entry body / sharing
  // ---------------------------------------------------------------------------
  fastify.patch('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const body = UpdateJournalEntrySchema.parse(request.body);
    const patientId = request.user.sub;

    const [existing] = await sql<{ id: string; created_at: string }[]>`
      SELECT id, created_at FROM journal_entries
      WHERE id = ${id} AND patient_id = ${patientId}
      LIMIT 1
    `;

    if (!existing) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found' } });
    }

    const wordCount = body.body ? body.body.trim().split(/\s+/).filter(Boolean).length : undefined;

    const [updated] = await sql<{ id: string }[]>`
      UPDATE journal_entries SET
        body = COALESCE(${body.body ?? null}, body),
        word_count = COALESCE(${wordCount ?? null}, word_count),
        shared_with_clinician = COALESCE(${body.is_shared_with_care_team ?? null}, shared_with_clinician),
        shared_at = CASE
          WHEN ${body.is_shared_with_care_team ?? null}::BOOLEAN = TRUE AND shared_with_clinician = FALSE
          THEN NOW() ELSE shared_at END,
        updated_at = NOW()
      WHERE id = ${id} AND patient_id = ${patientId}
      RETURNING id
    `;

    await auditLog({
      actor: request.user,
      action: 'update',
      resourceType: 'journal_entries',
      resourceId: id,
      patientId,
      newValues: body as Record<string, unknown>,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: { id: updated?.id } });
  });

  // ---------------------------------------------------------------------------
  // PATCH /journal/:id/share — toggle share (separate endpoint for clarity)
  // ---------------------------------------------------------------------------
  fastify.patch('/:id/share', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);
    const { shared } = z.object({ shared: z.boolean() }).parse(request.body);
    const patientId = request.user.sub;

    const [updated] = await sql<{ id: string; shared_with_clinician: boolean }[]>`
      UPDATE journal_entries SET
        shared_with_clinician = ${shared},
        shared_at = CASE WHEN ${shared} = TRUE AND shared_with_clinician = FALSE THEN NOW() ELSE shared_at END,
        updated_at = NOW()
      WHERE id = ${id} AND patient_id = ${patientId}
      RETURNING id, shared_with_clinician
    `;

    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found' } });
    }

    await auditLog({
      actor: request.user,
      action: shared ? 'share' : 'update',
      resourceType: 'journal_entries',
      resourceId: id,
      patientId,
      newValues: { shared_with_clinician: shared },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  });

  // ---------------------------------------------------------------------------
  // GET /journal/shared/:patientId — clinician reads patient's shared entries (admin reads all)
  // ---------------------------------------------------------------------------
  fastify.get('/shared/:patientId', auth, async (request, reply) => {
    const { patientId } = z.object({ patientId: UuidSchema }).parse(request.params);
    const query = PaginationSchema.parse(request.query);
    const isAdmin = await isAdminUser(request.user.sub);

    // Verify care team membership (admin bypasses)
    if (!isAdmin) {
      const [access] = await sql<{ id: string }[]>`
        SELECT ctm.id FROM care_team_members ctm
        WHERE ctm.patient_id = ${patientId}
          AND ctm.clinician_id = ${request.user.sub}
          AND ctm.unassigned_at IS NULL
      `;

      if (!access) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
      }
    }

    const limit = query.limit;
    const offset = (query.page - 1) * limit;

    // Admin can see all entries; regular clinicians only see shared entries
    const entries = await sql<{
      id: string; entry_date: string; body: string; word_count: number; shared_at: string; shared_with_clinician: boolean;
    }[]>`
      SELECT id, entry_date, body, word_count, shared_at, shared_with_clinician
      FROM journal_entries
      WHERE patient_id = ${patientId}
        AND (${isAdmin} = TRUE OR shared_with_clinician = TRUE)
      ORDER BY entry_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [_countRow2] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM journal_entries
      WHERE patient_id = ${patientId}
        AND (${isAdmin} = TRUE OR shared_with_clinician = TRUE)
    `;
    const count = _countRow2?.count ?? '0';

    await auditLog({
      actor: request.user,
      action: 'read',
      resourceType: 'journal_entries',
      patientId,
      ipAddress: request.ip,
    });

    const total = Number(count);
    return reply.send({
      success: true,
      data: { items: entries, total, page: query.page, limit, has_next: offset + entries.length < total },
    });
  });
}
