// =============================================================================
// MindLog API — Patient insights routes
// GET /api/v1/insights/me?days=30   — aggregated trends + correlations for the
//                                     authenticated patient
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';

const InsightsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export default async function insightsRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ---------------------------------------------------------------------------
  // GET /insights/me — patient's own aggregated insights
  // ---------------------------------------------------------------------------
  fastify.get('/me', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const { days } = InsightsQuerySchema.parse(request.query);
    const patientId = request.user.sub;

    // Compute cutoff date in JS to avoid postgres.js type ambiguity
    // with `CURRENT_DATE - integer` expressions
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]!;

    // ── Core daily stats ──────────────────────────────────────────────────────
    const [stats] = await sql<{
      check_in_days: string;
      avg_mood: number | null;
      avg_coping: number | null;
      min_mood: number | null;
      max_mood: number | null;
      avg_sleep_minutes: number | null;
      avg_exercise_minutes: number | null;
    }[]>`
      SELECT
        COUNT(de.id)                                    AS check_in_days,
        ROUND(AVG(de.mood)::numeric, 1)                 AS avg_mood,
        ROUND(AVG(de.coping)::numeric, 1)               AS avg_coping,
        MIN(de.mood)                                    AS min_mood,
        MAX(de.mood)                                    AS max_mood,
        ROUND(AVG(sl.total_minutes)::numeric, 0)        AS avg_sleep_minutes,
        ROUND(AVG(el.duration_minutes)::numeric, 0)     AS avg_exercise_minutes
      FROM daily_entries de
      LEFT JOIN sleep_logs    sl ON sl.daily_entry_id = de.id
      LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
        AND de.submitted_at IS NOT NULL
    `;

    // ── Mood trend — last N days, 1 row per day ───────────────────────────────
    const moodTrend = await sql<{
      entry_date: string;
      mood: number | null;
      coping: number | null;
      sleep_minutes: number | null;
      exercise_minutes: number | null;
    }[]>`
      SELECT
        de.entry_date,
        de.mood,
        de.coping,
        sl.total_minutes   AS sleep_minutes,
        el.duration_minutes AS exercise_minutes
      FROM daily_entries de
      LEFT JOIN sleep_logs    sl ON sl.daily_entry_id = de.id
      LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
      ORDER BY de.entry_date ASC
    `;

    // ── Sleep × mood correlation (Pearson-style: slope of linear fit) ─────────
    // Only computed when we have ≥ 7 days with both sleep and mood data
    const [sleepCorr] = await sql<{
      n: string;
      corr: number | null;
    }[]>`
      SELECT
        COUNT(*) AS n,
        CORR(sl.total_minutes::float, de.mood::float) AS corr
      FROM daily_entries de
      JOIN sleep_logs sl ON sl.daily_entry_id = de.id
      WHERE de.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
        AND de.mood IS NOT NULL
        AND sl.total_minutes IS NOT NULL
    `;

    // ── Exercise × mood correlation ───────────────────────────────────────────
    const [exerciseCorr] = await sql<{
      n: string;
      corr: number | null;
    }[]>`
      SELECT
        COUNT(*) AS n,
        CORR(el.duration_minutes::float, de.mood::float) AS corr
      FROM daily_entries de
      JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
        AND de.mood IS NOT NULL
        AND el.duration_minutes IS NOT NULL
    `;

    // ── Top triggers (most frequently fired) ─────────────────────────────────
    const topTriggers = await sql<{
      trigger_id: string;
      name: string;
      count: string;
      avg_severity: number | null;
    }[]>`
      SELECT
        tc.id   AS trigger_id,
        tc.name,
        COUNT(tl.id)                             AS count,
        ROUND(AVG(tl.severity)::numeric, 1)      AS avg_severity
      FROM trigger_logs tl
      JOIN trigger_catalogue tc ON tc.id = tl.trigger_id
      JOIN daily_entries de     ON de.id = tl.daily_entry_id
      WHERE tl.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
        AND tl.is_active = TRUE
      GROUP BY tc.id, tc.name
      ORDER BY count DESC, avg_severity DESC
      LIMIT 5
    `;

    // ── Top symptoms (most frequently reported) ───────────────────────────────
    const topSymptoms = await sql<{
      symptom_id: string;
      name: string;
      count: string;
      avg_intensity: number | null;
    }[]>`
      SELECT
        sc.id   AS symptom_id,
        sc.name,
        COUNT(sl2.id)                            AS count,
        ROUND(AVG(sl2.intensity)::numeric, 1)    AS avg_intensity
      FROM symptom_logs sl2
      JOIN symptom_catalogue sc ON sc.id = sl2.symptom_id
      JOIN daily_entries de     ON de.id = sl2.daily_entry_id
      WHERE sl2.patient_id  = ${patientId}
        AND de.entry_date  >= ${since}
        AND sl2.is_present = TRUE
      GROUP BY sc.id, sc.name
      ORDER BY count DESC, avg_intensity DESC
      LIMIT 5
    `;

    // ── Most effective wellness strategies (highest avg mood days when used) ──
    const topStrategies = await sql<{
      strategy_id: string;
      name: string;
      count: string;
      avg_mood_on_use: number | null;
    }[]>`
      SELECT
        ws.id   AS strategy_id,
        ws.name,
        COUNT(wl.id)                             AS count,
        ROUND(AVG(de.mood)::numeric, 1)          AS avg_mood_on_use
      FROM wellness_logs wl
      JOIN wellness_strategies ws ON ws.id = wl.strategy_id
      JOIN daily_entries de       ON de.id = wl.daily_entry_id
      WHERE wl.patient_id  = ${patientId}
        AND de.entry_date >= ${since}
        AND wl.state = 'yes'
        AND de.mood IS NOT NULL
      GROUP BY ws.id, ws.name
      HAVING COUNT(wl.id) >= 3
      ORDER BY avg_mood_on_use DESC NULLS LAST
      LIMIT 5
    `;

    const sleepCorrN = Number(sleepCorr?.n ?? 0);
    const exerciseCorrN = Number(exerciseCorr?.n ?? 0);

    return reply.send({
      success: true,
      data: {
        period_days: days,
        summary: {
          check_in_days: Number(stats?.check_in_days ?? 0),
          avg_mood: stats?.avg_mood ?? null,
          avg_coping: stats?.avg_coping ?? null,
          min_mood: stats?.min_mood ?? null,
          max_mood: stats?.max_mood ?? null,
          avg_sleep_minutes: stats?.avg_sleep_minutes ? Number(stats.avg_sleep_minutes) : null,
          avg_exercise_minutes: stats?.avg_exercise_minutes ? Number(stats.avg_exercise_minutes) : null,
        },
        mood_trend: moodTrend,
        correlations: {
          sleep_mood: sleepCorrN >= 7
            ? { coefficient: sleepCorr?.corr ?? null, data_points: sleepCorrN }
            : null,
          exercise_mood: exerciseCorrN >= 7
            ? { coefficient: exerciseCorr?.corr ?? null, data_points: exerciseCorrN }
            : null,
        },
        top_triggers: topTriggers.map((t) => ({ ...t, count: Number(t.count) })),
        top_symptoms: topSymptoms.map((s) => ({ ...s, count: Number(s.count) })),
        top_strategies: topStrategies.map((s) => ({ ...s, count: Number(s.count) })),
      },
    });
  });
}
