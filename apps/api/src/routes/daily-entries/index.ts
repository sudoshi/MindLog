// =============================================================================
// MindLog API — Daily entry routes (patient-facing + clinician read)
// POST /api/v1/daily-entries              — create / upsert today's entry
// GET  /api/v1/daily-entries              — list patient's entries (history)
// GET  /api/v1/daily-entries/:id          — single entry detail
// GET  /api/v1/daily-entries/today        — shortcut for today's entry
// PATCH /api/v1/daily-entries/:id/submit  — mark entry as submitted
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { CreateDailyEntrySchema, PaginationSchema, UuidSchema, IsoDateSchema } from '@mindlog/shared';
import { rulesQueue } from '../../workers/rules-engine.js';

export default async function dailyEntryRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ---------------------------------------------------------------------------
  // GET /daily-entries/today — must be registered before /:id
  // ---------------------------------------------------------------------------
  fastify.get('/today', auth, async (request, reply) => {
    const today = new Date().toISOString().split('T')[0]!;

    const [entry] = await sql<{ id: string; entry_date: string; mood: number | null; submitted_at: string | null; completion_pct: number }[]>`
      SELECT de.id, de.entry_date, de.mood, de.coping, de.completion_pct, de.submitted_at,
             de.core_complete, de.wellness_complete, de.triggers_complete,
             de.symptoms_complete, de.journal_complete
      FROM daily_entries de
      WHERE de.patient_id = ${request.user.sub}
        AND de.entry_date = ${today}
      LIMIT 1
    `;

    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No entry for today yet' } });
    }

    return reply.send({ success: true, data: entry });
  });

  // ---------------------------------------------------------------------------
  // POST /daily-entries — create or upsert the day's entry
  // ---------------------------------------------------------------------------
  fastify.post('/', auth, async (request, reply) => {
    const body = CreateDailyEntrySchema.parse(request.body);
    const patientId = request.user.sub;

    // Upsert the parent daily_entry row (includes Phase 8c clinical domain columns)
    const [entry] = await sql<{ id: string; entry_date: string }[]>`
      INSERT INTO daily_entries (
        patient_id, entry_date, mood, notes, coping, started_at, core_complete,
        mania_score, racing_thoughts, decreased_sleep_need,
        anxiety_score, somatic_anxiety, anhedonia_score, suicidal_ideation,
        social_score, social_avoidance, cognitive_score, brain_fog, stress_score,
        substance_use, substance_quantity, appetite_score, life_event_note
      )
      VALUES (
        ${patientId}, ${body.entry_date}, ${body.mood_score},
        ${body.notes ?? null}, ${null}, NOW(), TRUE,
        ${body.mania_score ?? null}, ${body.racing_thoughts ?? null}, ${body.decreased_sleep_need ?? null},
        ${body.anxiety_score ?? null}, ${body.somatic_anxiety ?? null}, ${body.anhedonia_score ?? null},
        ${body.suicidal_ideation ?? null},
        ${body.social_score ?? null}, ${body.social_avoidance ?? null},
        ${body.cognitive_score ?? null}, ${body.brain_fog ?? null}, ${body.stress_score ?? null},
        ${body.substance_use ?? null}, ${body.substance_quantity ?? null},
        ${body.appetite_score ?? null}, ${body.life_event_note ?? null}
      )
      ON CONFLICT (patient_id, entry_date) DO UPDATE
        SET mood                = EXCLUDED.mood,
            notes               = COALESCE(EXCLUDED.notes, daily_entries.notes),
            core_complete       = TRUE,
            last_saved_at       = NOW(),
            mania_score         = COALESCE(EXCLUDED.mania_score,         daily_entries.mania_score),
            racing_thoughts     = COALESCE(EXCLUDED.racing_thoughts,     daily_entries.racing_thoughts),
            decreased_sleep_need = COALESCE(EXCLUDED.decreased_sleep_need, daily_entries.decreased_sleep_need),
            anxiety_score       = COALESCE(EXCLUDED.anxiety_score,       daily_entries.anxiety_score),
            somatic_anxiety     = COALESCE(EXCLUDED.somatic_anxiety,     daily_entries.somatic_anxiety),
            anhedonia_score     = COALESCE(EXCLUDED.anhedonia_score,     daily_entries.anhedonia_score),
            suicidal_ideation   = COALESCE(EXCLUDED.suicidal_ideation,   daily_entries.suicidal_ideation),
            social_score        = COALESCE(EXCLUDED.social_score,        daily_entries.social_score),
            social_avoidance    = COALESCE(EXCLUDED.social_avoidance,    daily_entries.social_avoidance),
            cognitive_score     = COALESCE(EXCLUDED.cognitive_score,     daily_entries.cognitive_score),
            brain_fog           = COALESCE(EXCLUDED.brain_fog,           daily_entries.brain_fog),
            stress_score        = COALESCE(EXCLUDED.stress_score,        daily_entries.stress_score),
            substance_use       = COALESCE(EXCLUDED.substance_use,       daily_entries.substance_use),
            substance_quantity  = COALESCE(EXCLUDED.substance_quantity,  daily_entries.substance_quantity),
            appetite_score      = COALESCE(EXCLUDED.appetite_score,      daily_entries.appetite_score),
            life_event_note     = COALESCE(EXCLUDED.life_event_note,     daily_entries.life_event_note)
      RETURNING id, entry_date
    `;

    if (!entry) throw new Error('Failed to upsert daily entry');
    const entryId = entry.id;

    // Upsert sleep log
    if (body.sleep_hours !== undefined && body.sleep_hours !== null) {
      const hours = Math.floor(body.sleep_hours);
      const minutes = Math.round((body.sleep_hours - hours) * 60);
      const roundedMinutes = ([0, 15, 30, 45] as const).reduce((prev, curr) =>
        Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev,
      );
      await sql`
        INSERT INTO sleep_logs (daily_entry_id, patient_id, entry_date, hours, minutes)
        VALUES (${entryId}, ${patientId}, ${body.entry_date}, ${hours}, ${roundedMinutes})
        ON CONFLICT (daily_entry_id) DO UPDATE
          SET hours = EXCLUDED.hours, minutes = EXCLUDED.minutes
      `;
    }

    // Upsert exercise log
    if (body.exercise_minutes !== undefined && body.exercise_minutes !== null) {
      await sql`
        INSERT INTO exercise_logs (daily_entry_id, patient_id, entry_date, duration_minutes)
        VALUES (${entryId}, ${patientId}, ${body.entry_date}, ${body.exercise_minutes})
        ON CONFLICT (daily_entry_id) DO UPDATE
          SET duration_minutes = EXCLUDED.duration_minutes
      `;
    }

    // Upsert trigger logs
    if (body.triggers?.length) {
      for (const t of body.triggers) {
        await sql`
          INSERT INTO trigger_logs (daily_entry_id, patient_id, trigger_id, entry_date, is_active, severity)
          VALUES (${entryId}, ${patientId}, ${t.trigger_id}, ${body.entry_date}, TRUE, ${t.severity})
          ON CONFLICT (daily_entry_id, trigger_id) DO UPDATE
            SET severity = EXCLUDED.severity, is_active = TRUE
        `;
      }
      await sql`
        UPDATE daily_entries SET triggers_complete = TRUE WHERE id = ${entryId}
      `;
    }

    // Upsert symptom logs
    // Note: safety symptoms auto-raise a clinical_alert + safety_event via DB trigger (SAF-001)
    if (body.symptoms?.length) {
      for (const s of body.symptoms) {
        await sql`
          INSERT INTO symptom_logs (daily_entry_id, patient_id, symptom_id, entry_date, is_present, intensity)
          VALUES (${entryId}, ${patientId}, ${s.symptom_id}, ${body.entry_date}, TRUE, ${s.severity})
          ON CONFLICT (daily_entry_id, symptom_id) DO UPDATE
            SET intensity = EXCLUDED.intensity, is_present = TRUE
        `;
      }
      await sql`
        UPDATE daily_entries SET symptoms_complete = TRUE WHERE id = ${entryId}
      `;
    }

    // Upsert wellness strategy logs
    if (body.strategies?.length) {
      for (const ws of body.strategies) {
        await sql`
          INSERT INTO wellness_logs (daily_entry_id, patient_id, strategy_id, entry_date, state)
          VALUES (${entryId}, ${patientId}, ${ws.strategy_id}, ${body.entry_date}, 'yes')
          ON CONFLICT (daily_entry_id, strategy_id) DO UPDATE
            SET state = EXCLUDED.state
        `;
      }
      await sql`
        UPDATE daily_entries SET wellness_complete = TRUE WHERE id = ${entryId}
      `;
    }

    // Enqueue rules evaluation (non-blocking)
    await rulesQueue.add('evaluate', {
      patientId,
      orgId: request.user.org_id,
      entryDate: body.entry_date,
      triggeredBy: 'daily_entry',
    });

    return reply.status(201).send({ success: true, data: { id: entryId, entry_date: entry.entry_date } });
  });

  // ---------------------------------------------------------------------------
  // GET /daily-entries — patient's entry history
  // ---------------------------------------------------------------------------
  fastify.get('/', auth, async (request, reply) => {
    const query = PaginationSchema.parse(request.query);
    const limit = query.limit;
    const offset = (query.page - 1) * limit;

    const entries = await sql<{ id: string; entry_date: string; mood: number | null; completion_pct: number; submitted_at: string | null }[]>`
      SELECT id, entry_date, mood, coping, completion_pct, submitted_at
      FROM daily_entries
      WHERE patient_id = ${request.user.sub}
      ORDER BY entry_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [_countRow] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM daily_entries WHERE patient_id = ${request.user.sub}
    `;
    const count = _countRow?.count ?? '0';

    const total = Number(count);
    return reply.send({
      success: true,
      data: { items: entries, total, page: query.page, limit, has_next: offset + entries.length < total },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /daily-entries/:id — full entry detail
  // ---------------------------------------------------------------------------
  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);

    const [entry] = await sql`
      SELECT de.*,
        sl.hours AS sleep_hours, sl.minutes AS sleep_minutes, sl.total_minutes, sl.quality AS sleep_quality,
        el.duration_minutes AS exercise_minutes, el.exercise_type
      FROM daily_entries de
      LEFT JOIN sleep_logs sl ON sl.daily_entry_id = de.id
      LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.id = ${id}
        AND de.patient_id = ${request.user.sub}
      LIMIT 1
    `;

    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found' } });
    }

    // Fetch child lists in parallel
    const [triggers, symptoms, strategies] = await Promise.all([
      sql`SELECT tl.*, tc.name AS trigger_name FROM trigger_logs tl
          JOIN trigger_catalogue tc ON tc.id = tl.trigger_id
          WHERE tl.daily_entry_id = ${id}`,
      sql`SELECT sl.*, sc.name AS symptom_name, sc.is_safety_symptom FROM symptom_logs sl
          JOIN symptom_catalogue sc ON sc.id = sl.symptom_id
          WHERE sl.daily_entry_id = ${id}`,
      sql`SELECT wl.*, ws.name AS strategy_name FROM wellness_logs wl
          JOIN wellness_strategies ws ON ws.id = wl.strategy_id
          WHERE wl.daily_entry_id = ${id}`,
    ]);

    return reply.send({ success: true, data: { ...entry, triggers, symptoms, strategies } });
  });

  // ---------------------------------------------------------------------------
  // PATCH /daily-entries/:id/submit — finalise the entry
  // ---------------------------------------------------------------------------
  fastify.patch('/:id/submit', auth, async (request, reply) => {
    const { id } = z.object({ id: UuidSchema }).parse(request.params);

    const [entry] = await sql<{ id: string; submitted_at: string | null }[]>`
      UPDATE daily_entries
      SET submitted_at = COALESCE(submitted_at, NOW()),
          last_saved_at = NOW()
      WHERE id = ${id} AND patient_id = ${request.user.sub}
      RETURNING id, submitted_at
    `;

    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Entry not found' } });
    }

    return reply.send({ success: true, data: entry });
  });

  // ---------------------------------------------------------------------------
  // GET /daily-entries/date/:date — look up by ISO date
  // ---------------------------------------------------------------------------
  fastify.get('/date/:date', auth, async (request, reply) => {
    const { date } = z.object({ date: IsoDateSchema }).parse(request.params);

    const [entry] = await sql<{ id: string }[]>`
      SELECT id FROM daily_entries
      WHERE patient_id = ${request.user.sub} AND entry_date = ${date}
      LIMIT 1
    `;

    if (!entry) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No entry for that date' } });
    }

    return reply.redirect(`/api/v1/daily-entries/${entry.id}`);
  });
}
