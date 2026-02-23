// =============================================================================
// MindLog API — /sync routes
// Supports the WatermelonDB offline-first sync protocol.
//
// GET  /sync/pull  — return all server changes since lastPulledAt (per patient)
// POST /sync/push  — accept locally-created/updated/deleted records from patient
//
// Only patient-role users sync their own data.
// Clinicians pull via REST (no WDB), so this endpoint is patient-only.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { sql } from '@mindlog/db';
import { auditLog } from '../../middleware/audit.js';
import type { JwtPayload } from '../../plugins/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PullQuery {
  last_pulled_at?: string; // unix ms as string, '0' means full sync
  schema_version?: string;
  migration?: string;
}

interface SyncRow {
  id: string;
  [key: string]: unknown;
}

interface SyncTableChanges {
  created: SyncRow[];
  updated: SyncRow[];
  deleted: string[];
}

interface PushBody {
  last_pulled_at: number;
  changes: {
    daily_entries?: Partial<SyncTableChanges>;
    journal_entries?: Partial<SyncTableChanges>;
    daily_entry_triggers?: Partial<SyncTableChanges>;
    daily_entry_symptoms?: Partial<SyncTableChanges>;
    daily_entry_strategies?: Partial<SyncTableChanges>;
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // GET /sync/pull
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: PullQuery }>(
    '/pull',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as JwtPayload;

      // Patients only — clinicians use REST endpoints
      if (user.role !== 'patient') {
        return reply.status(403).send({ success: false, error: { message: 'Patients only' } });
      }

      const lastPulledAtMs = parseInt(request.query.last_pulled_at ?? '0', 10);
      const sinceDate = lastPulledAtMs
        ? new Date(lastPulledAtMs).toISOString()
        : new Date(0).toISOString();

      const patientId = user.sub;
      const nowMs = Date.now();

      // -----------------------------------------------------------------------
      // Fetch changed rows in parallel
      // -----------------------------------------------------------------------
      const [
        entriesCreated, entriesUpdated, entriesDeleted,
        journalCreated, journalUpdated, journalDeleted,
        trigsCreated, trigsUpdated, trigsDeleted,
        symsCreated, symsUpdated, symsDeleted,
        stratsCreated, stratsUpdated, stratsDeleted,
        triggersAll, symptomsAll, strategiesAll,
      ] = await Promise.all([
        // daily_entries created after sinceDate
        sql<SyncRow[]>`
          SELECT id, patient_id, entry_date, mood_score, sleep_hours, exercise_minutes,
                 notes, is_complete, completion_pct, core_complete, wellness_complete,
                 triggers_complete, symptoms_complete, journal_complete,
                 submitted_at, created_at, updated_at,
                 id AS server_id
          FROM daily_entries
          WHERE patient_id = ${patientId}
            AND created_at > ${sinceDate}::timestamptz
            AND updated_at = created_at
        `,
        // daily_entries updated (but not created) after sinceDate
        sql<SyncRow[]>`
          SELECT id, patient_id, entry_date, mood_score, sleep_hours, exercise_minutes,
                 notes, is_complete, completion_pct, core_complete, wellness_complete,
                 triggers_complete, symptoms_complete, journal_complete,
                 submitted_at, created_at, updated_at,
                 id AS server_id
          FROM daily_entries
          WHERE patient_id = ${patientId}
            AND updated_at > ${sinceDate}::timestamptz
            AND updated_at > created_at
        `,
        // No soft-delete on entries yet — return empty
        sql<{ id: string }[]>`SELECT NULL::uuid AS id WHERE FALSE`,

        // journal_entries created
        sql<SyncRow[]>`
          SELECT je.id, je.daily_entry_id, je.patient_id, je.body, je.word_count,
                 je.is_shared_with_care_team, je.created_at, je.updated_at,
                 je.id AS server_id,
                 je.created_at::text AS created_at_iso
          FROM journal_entries je
          WHERE je.patient_id = ${patientId}
            AND je.created_at > ${sinceDate}::timestamptz
            AND je.updated_at = je.created_at
        `,
        // journal_entries updated
        sql<SyncRow[]>`
          SELECT je.id, je.daily_entry_id, je.patient_id, je.body, je.word_count,
                 je.is_shared_with_care_team, je.created_at, je.updated_at,
                 je.id AS server_id,
                 je.created_at::text AS created_at_iso
          FROM journal_entries je
          WHERE je.patient_id = ${patientId}
            AND je.updated_at > ${sinceDate}::timestamptz
            AND je.updated_at > je.created_at
        `,
        sql<{ id: string }[]>`SELECT NULL::uuid AS id WHERE FALSE`,

        // daily_entry_triggers created
        sql<SyncRow[]>`
          SELECT det.id, det.daily_entry_id, det.trigger_id, det.severity,
                 det.created_at, det.updated_at, det.id AS server_id
          FROM daily_entry_triggers det
          JOIN daily_entries de ON de.id = det.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND det.created_at > ${sinceDate}::timestamptz
            AND det.updated_at = det.created_at
        `,
        // daily_entry_triggers updated
        sql<SyncRow[]>`
          SELECT det.id, det.daily_entry_id, det.trigger_id, det.severity,
                 det.created_at, det.updated_at, det.id AS server_id
          FROM daily_entry_triggers det
          JOIN daily_entries de ON de.id = det.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND det.updated_at > ${sinceDate}::timestamptz
            AND det.updated_at > det.created_at
        `,
        sql<{ id: string }[]>`SELECT NULL::uuid AS id WHERE FALSE`,

        // daily_entry_symptoms created
        sql<SyncRow[]>`
          SELECT des.id, des.daily_entry_id, des.symptom_id, des.severity,
                 des.created_at, des.updated_at, des.id AS server_id
          FROM daily_entry_symptoms des
          JOIN daily_entries de ON de.id = des.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND des.created_at > ${sinceDate}::timestamptz
            AND des.updated_at = des.created_at
        `,
        // daily_entry_symptoms updated
        sql<SyncRow[]>`
          SELECT des.id, des.daily_entry_id, des.symptom_id, des.severity,
                 des.created_at, des.updated_at, des.id AS server_id
          FROM daily_entry_symptoms des
          JOIN daily_entries de ON de.id = des.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND des.updated_at > ${sinceDate}::timestamptz
            AND des.updated_at > des.created_at
        `,
        sql<{ id: string }[]>`SELECT NULL::uuid AS id WHERE FALSE`,

        // daily_entry_strategies created
        sql<SyncRow[]>`
          SELECT dew.id, dew.daily_entry_id, dew.strategy_id, dew.helped,
                 dew.created_at, dew.updated_at, dew.id AS server_id
          FROM daily_entry_strategies dew
          JOIN daily_entries de ON de.id = dew.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND dew.created_at > ${sinceDate}::timestamptz
            AND dew.updated_at = dew.created_at
        `,
        // daily_entry_strategies updated
        sql<SyncRow[]>`
          SELECT dew.id, dew.daily_entry_id, dew.strategy_id, dew.helped,
                 dew.created_at, dew.updated_at, dew.id AS server_id
          FROM daily_entry_strategies dew
          JOIN daily_entries de ON de.id = dew.daily_entry_id
          WHERE de.patient_id = ${patientId}
            AND dew.updated_at > ${sinceDate}::timestamptz
            AND dew.updated_at > dew.created_at
        `,
        sql<{ id: string }[]>`SELECT NULL::uuid AS id WHERE FALSE`,

        // Catalogues — full sync always (small tables, rarely change)
        sql<SyncRow[]>`SELECT id, name, category, created_at, updated_at, id AS server_id FROM triggers ORDER BY name`,
        sql<SyncRow[]>`SELECT id, name, is_safety_symptom, created_at, updated_at, id AS server_id FROM symptoms ORDER BY name`,
        sql<SyncRow[]>`SELECT id, name, category, created_at, updated_at, id AS server_id FROM wellness_strategies ORDER BY name`,
      ]);

      await auditLog({
        actor: user,
        action: 'read',
        resourceType: 'sync_pull',
        resourceId: patientId,
      });

      // Helper to filter out null ids from empty queries
      const cleanDeleted = (rows: { id: string }[]) =>
        rows.map((r) => r.id).filter(Boolean);

      return reply.send({
        success: true,
        data: {
          changes: {
            daily_entries: {
              created: entriesCreated,
              updated: entriesUpdated,
              deleted: cleanDeleted(entriesDeleted),
            },
            journal_entries: {
              created: journalCreated,
              updated: journalUpdated,
              deleted: cleanDeleted(journalDeleted),
            },
            daily_entry_triggers: {
              created: trigsCreated,
              updated: trigsUpdated,
              deleted: cleanDeleted(trigsDeleted),
            },
            daily_entry_symptoms: {
              created: symsCreated,
              updated: symsUpdated,
              deleted: cleanDeleted(symsDeleted),
            },
            daily_entry_strategies: {
              created: stratsCreated,
              updated: stratsUpdated,
              deleted: cleanDeleted(stratsDeleted),
            },
            triggers: {
              created: lastPulledAtMs === 0 ? triggersAll : [],
              updated: lastPulledAtMs > 0 ? triggersAll : [],
              deleted: [],
            },
            symptoms: {
              created: lastPulledAtMs === 0 ? symptomsAll : [],
              updated: lastPulledAtMs > 0 ? symptomsAll : [],
              deleted: [],
            },
            wellness_strategies: {
              created: lastPulledAtMs === 0 ? strategiesAll : [],
              updated: lastPulledAtMs > 0 ? strategiesAll : [],
              deleted: [],
            },
          },
          timestamp: nowMs,
        },
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /sync/push
  // ---------------------------------------------------------------------------
  fastify.post<{ Body: PushBody }>(
    '/push',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as JwtPayload;
      if (user.role !== 'patient') {
        return reply.status(403).send({ success: false, error: { message: 'Patients only' } });
      }

      const patientId = user.sub;
      const { changes } = request.body;

      // -----------------------------------------------------------------------
      // Process daily_entries pushed from client
      // We use upsert via INSERT ... ON CONFLICT UPDATE
      // -----------------------------------------------------------------------
      const entryCreated = changes.daily_entries?.created ?? [];
      const entryUpdated = changes.daily_entries?.updated ?? [];

      for (const row of [...entryCreated, ...entryUpdated]) {
        // Ensure the record belongs to this patient (never trust client patientId)
        await sql`
          INSERT INTO daily_entries (
            id, patient_id, entry_date, mood_score, sleep_hours, exercise_minutes,
            notes, is_complete, completion_pct, submitted_at
          )
          VALUES (
            ${(row.server_id as string) || sql`gen_random_uuid()`},
            ${patientId},
            ${(row.entry_date as string)},
            ${(row.mood_score as number | null) ?? null},
            ${(row.sleep_hours as number | null) ?? null},
            ${(row.exercise_minutes as number | null) ?? null},
            ${(row.notes as string | null) ?? null},
            ${Boolean(row.is_complete)},
            ${(row.completion_pct as number) ?? 0},
            ${(row.submitted_at as string | null) ?? null}
          )
          ON CONFLICT (patient_id, entry_date)
          DO UPDATE SET
            mood_score = EXCLUDED.mood_score,
            sleep_hours = EXCLUDED.sleep_hours,
            exercise_minutes = EXCLUDED.exercise_minutes,
            notes = EXCLUDED.notes,
            submitted_at = COALESCE(EXCLUDED.submitted_at, daily_entries.submitted_at)
        `;
      }

      // -----------------------------------------------------------------------
      // Process journal_entries
      // -----------------------------------------------------------------------
      const journalCreated = changes.journal_entries?.created ?? [];
      const journalUpdated = changes.journal_entries?.updated ?? [];

      for (const row of journalCreated) {
        // Look up matching daily_entry server id
        const [de] = await sql<{ id: string }[]>`
          SELECT id FROM daily_entries
          WHERE patient_id = ${patientId} AND entry_date = CURRENT_DATE
          LIMIT 1
        `;
        const dailyEntryId = de?.id;

        await sql`
          INSERT INTO journal_entries (patient_id, daily_entry_id, body, word_count, is_shared_with_care_team)
          VALUES (
            ${patientId},
            ${dailyEntryId ?? null},
            ${(row.body as string)},
            ${(row.word_count as number) ?? 0},
            ${Boolean(row.is_shared_with_care_team)}
          )
          ON CONFLICT DO NOTHING
        `;
      }

      for (const row of journalUpdated) {
        if (!row.server_id) continue;
        await sql`
          UPDATE journal_entries
          SET body = ${(row.body as string)},
              word_count = ${(row.word_count as number) ?? 0},
              is_shared_with_care_team = ${Boolean(row.is_shared_with_care_team)}
          WHERE id = ${(row.server_id as string)} AND patient_id = ${patientId}
        `;
      }

      await auditLog({
        actor: user,
        action: 'create',
        resourceType: 'sync_push',
        resourceId: patientId,
      });

      return reply.send({ success: true });
    },
  );
}

export default fp(syncRoutes, { name: 'sync-routes' });
