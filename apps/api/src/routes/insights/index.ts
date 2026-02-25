// =============================================================================
// MindLog API — Patient insights routes
// GET /api/v1/insights/me?days=30   — aggregated trends + correlations for the
//                                     authenticated patient
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { aiGate } from '../../middleware/aiGate.js';
import { aiInsightsQueue, HIPAA_PREAMBLE, buildClinicalSnapshot } from '../../workers/ai-insights-worker.js';
import { generateChat, computeCostCents, type ChatMessage } from '../../services/llmClient.js';

const InsightsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const AiHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  type:  z.enum(['weekly_summary', 'trend_narrative', 'anomaly_detection', 'risk_stratification', 'nightly_deep_analysis']).optional(),
});

const RiskHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
});

const ChatBodySchema = z.object({
  discussion_id: z.string().uuid().nullable().default(null),
  message:       z.string().min(1).max(4000),
});

const DiscussionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
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

  // ---------------------------------------------------------------------------
  // GET /insights/me/ai — patient's latest AI insight (gated)
  // Requires: authenticated patient + AI enabled + BAA signed + consent
  // ---------------------------------------------------------------------------
  fastify.get('/me/ai', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const patientId = request.user.sub;

    // Verify patient has consented to AI insights
    const [consent] = await sql<{ granted: boolean }[]>`
      SELECT granted FROM consent_records
      WHERE patient_id   = ${patientId}
        AND consent_type = 'ai_insights'
      ORDER BY granted_at DESC LIMIT 1
    `;

    if (!consent?.granted) {
      return reply.status(403).send({
        success: false,
        error: { code: 'CONSENT_REQUIRED', message: 'AI insights consent is required. Please update your privacy settings.' },
      });
    }

    const [patient] = await sql<{ risk_score: number | null; risk_score_factors: unknown }[]>`
      SELECT risk_score, risk_score_factors FROM patients WHERE id = ${patientId}
    `;

    const [latest] = await sql<{
      id:           string;
      insight_type: string;
      period_start: string;
      period_end:   string;
      narrative:    string;
      key_findings: unknown;
      risk_delta:   number | null;
      model_id:     string;
      generated_at: string;
    }[]>`
      SELECT id, insight_type, period_start, period_end,
             narrative, key_findings, risk_delta, model_id, generated_at
      FROM patient_ai_insights
      WHERE patient_id = ${patientId}
        AND insight_type IN ('weekly_summary', 'trend_narrative')
      ORDER BY generated_at DESC
      LIMIT 1
    `;

    return reply.send({
      success: true,
      data: {
        risk_score:         patient?.risk_score ?? null,
        risk_score_factors: patient?.risk_score_factors ?? null,
        latest_insight:     latest ?? null,
        disclaimer: 'This AI-generated summary is a clinical decision support tool. It does not constitute a diagnosis. Always apply clinical judgment.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /insights/me/ai/history — patient's AI insight history (gated)
  // ---------------------------------------------------------------------------
  fastify.get('/me/ai/history', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Patient access only' } });
    }

    const patientId = request.user.sub;

    const [consent] = await sql<{ granted: boolean }[]>`
      SELECT granted FROM consent_records
      WHERE patient_id = ${patientId} AND consent_type = 'ai_insights'
      ORDER BY granted_at DESC LIMIT 1
    `;
    if (!consent?.granted) {
      return reply.status(403).send({
        success: false,
        error: { code: 'CONSENT_REQUIRED', message: 'AI insights consent required.' },
      });
    }

    const { limit, type } = AiHistoryQuerySchema.parse(request.query);

    const insights = await sql<{
      id:           string;
      insight_type: string;
      period_start: string;
      period_end:   string;
      narrative:    string;
      key_findings: unknown;
      risk_delta:   number | null;
      generated_at: string;
    }[]>`
      SELECT id, insight_type, period_start, period_end,
             narrative, key_findings, risk_delta, generated_at
      FROM patient_ai_insights
      WHERE patient_id   = ${patientId}
        ${type ? sql`AND insight_type = ${type}` : sql``}
      ORDER BY generated_at DESC
      LIMIT ${limit}
    `;

    return reply.send({ success: true, data: { items: insights, total: insights.length } });
  });

  // ---------------------------------------------------------------------------
  // GET /insights/:patientId/ai — clinician: AI insights for a patient (gated)
  // ---------------------------------------------------------------------------
  fastify.get('/:patientId/ai', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId } = request.params as { patientId: string };
    const clinicianId   = request.user.sub;

    // Verify clinician is on patient's care team
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    const [patient] = await sql<{
      risk_score:            number | null;
      risk_score_factors:    unknown;
      risk_score_updated_at: string | null;
    }[]>`
      SELECT risk_score, risk_score_factors, risk_score_updated_at
      FROM patients WHERE id = ${patientId}
    `;

    const { limit, type } = AiHistoryQuerySchema.parse(request.query);

    const insights = await sql<{
      id:                  string;
      insight_type:        string;
      period_start:        string;
      period_end:          string;
      narrative:           string;
      key_findings:        unknown;
      risk_delta:          number | null;
      model_id:            string;
      generated_at:        string;
      structured_findings: unknown;
      clinical_trajectory: string | null;
    }[]>`
      SELECT id, insight_type, period_start, period_end,
             narrative, key_findings, risk_delta, model_id, generated_at,
             structured_findings, clinical_trajectory
      FROM patient_ai_insights
      WHERE patient_id = ${patientId}
        ${type ? sql`AND insight_type = ${type}` : sql``}
      ORDER BY generated_at DESC
      LIMIT ${limit}
    `;

    // Fetch latest 30 risk history points for inline sparkline
    const riskHistory = await sql<{
      score:       number;
      band:        string;
      computed_at: string;
    }[]>`
      SELECT score, band, computed_at
      FROM patient_risk_history
      WHERE patient_id = ${patientId}
      ORDER BY computed_at DESC
      LIMIT 30
    `;

    return reply.send({
      success: true,
      data: {
        patient_id:            patientId,
        risk_score:            patient?.risk_score ?? null,
        risk_score_factors:    patient?.risk_score_factors ?? null,
        risk_score_updated_at: patient?.risk_score_updated_at ?? null,
        insights,
        risk_history: riskHistory.reverse(),
        disclaimer: 'AI-generated content is for clinical decision support only. Not a substitute for clinical assessment.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /insights/:patientId/risk-history — longitudinal risk scores (clinician)
  // ---------------------------------------------------------------------------
  fastify.get('/:patientId/risk-history', auth, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId } = request.params as { patientId: string };
    const clinicianId   = request.user.sub;

    // Verify care team membership
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    const { days } = RiskHistoryQuerySchema.parse(request.query);
    const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]!;

    const history = await sql<{
      score:       number;
      band:        string;
      factors:     unknown;
      computed_at: string;
    }[]>`
      SELECT score, band, factors, computed_at
      FROM patient_risk_history
      WHERE patient_id  = ${patientId}
        AND computed_at >= ${since}::date
      ORDER BY computed_at ASC
    `;

    return reply.send({
      success: true,
      data: { patient_id: patientId, days, history },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /insights/:patientId/ai/trigger — clinician: manually trigger AI insight
  // ---------------------------------------------------------------------------
  fastify.post('/:patientId/ai/trigger', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId } = request.params as { patientId: string };
    const clinicianId   = request.user.sub;

    // Verify care team membership
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    // Verify patient consent
    const [consent] = await sql<{ granted: boolean }[]>`
      SELECT granted FROM consent_records
      WHERE patient_id = ${patientId} AND consent_type = 'ai_insights'
      ORDER BY granted_at DESC LIMIT 1
    `;
    if (!consent?.granted) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONSENT_REQUIRED', message: 'Patient has not consented to AI insights.' },
      });
    }

    const [patient] = await sql<{ organisation_id: string }[]>`
      SELECT organisation_id FROM patients WHERE id = ${patientId}
    `;
    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found.' } });
    }

    const body = request.body as { type?: string; period_days?: number };
    const allowedTypes = ['weekly_summary', 'trend_narrative', 'anomaly_detection', 'nightly_deep_analysis'] as const;
    const jobType = allowedTypes.includes(body?.type as typeof allowedTypes[number])
      ? (body.type as typeof allowedTypes[number])
      : 'weekly_summary';
    const periodDays = Math.max(7, Math.min(30, Number(body?.period_days ?? (jobType === 'nightly_deep_analysis' ? 30 : 7))));

    const job = await aiInsightsQueue.add(jobType, {
      patientId,
      orgId:       patient.organisation_id,
      jobType,
      clinicianId,
      periodDays,
    });

    return reply.status(202).send({
      success: true,
      data: {
        job_id:     job.id,
        insight_type: jobType,
        period_days:  periodDays,
        message: 'AI insight generation queued. Results will appear in the AI Insights tab within a few minutes.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /insights/:patientId/ai/chat — synchronous AI chat (clinician only)
  // ---------------------------------------------------------------------------
  fastify.post('/:patientId/ai/chat', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId } = request.params as { patientId: string };
    const clinicianId   = request.user.sub;

    // Verify care team
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    // Verify patient consent
    const [consent] = await sql<{ granted: boolean }[]>`
      SELECT granted FROM consent_records
      WHERE patient_id = ${patientId} AND consent_type = 'ai_insights'
      ORDER BY granted_at DESC LIMIT 1
    `;
    if (!consent?.granted) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONSENT_REQUIRED', message: 'Patient has not consented to AI insights.' },
      });
    }

    const { discussion_id, message } = ChatBodySchema.parse(request.body);

    // Create or fetch discussion
    let discussionId = discussion_id;
    if (!discussionId) {
      const title = message.length > 60 ? message.substring(0, 57) + '...' : message;
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO ai_discussions (patient_id, clinician_id, title)
        VALUES (${patientId}, ${clinicianId}, ${title})
        RETURNING id
      `;
      discussionId = created!.id;
    }

    // Load prior messages for context
    const priorMessages = await sql<{ role: string; content: string }[]>`
      SELECT role, content FROM ai_discussion_messages
      WHERE discussion_id = ${discussionId}
      ORDER BY created_at ASC
    `;

    // Build clinical context
    const snapshot = await buildClinicalSnapshot(patientId, 30);
    const systemPrompt = `${HIPAA_PREAMBLE}

PATIENT CLINICAL CONTEXT (de-identified, ${snapshot.period_days}-day window):
- Check-ins: ${snapshot.check_in_days}/${snapshot.period_days} days
- Mood: avg ${snapshot.avg_mood ?? 'N/A'}/10, range ${snapshot.min_mood ?? 'N/A'}–${snapshot.max_mood ?? 'N/A'}
- Coping: avg ${snapshot.avg_coping ?? 'N/A'}/10
- Sleep: avg ${snapshot.avg_sleep_hours ?? 'N/A'} hours/night
- Medication adherence: ${snapshot.med_adherence_pct != null ? `${snapshot.med_adherence_pct}%` : 'N/A'}
- Composite risk score: ${snapshot.risk_score ?? 'not computed'}/100
- Top triggers: ${snapshot.top_triggers.join(', ') || 'none recorded'}
- Top symptoms: ${snapshot.top_symptoms.join(', ') || 'none recorded'}
- Helpful strategies: ${snapshot.top_strategies.join(', ') || 'none recorded'}
${snapshot.recent_assessments.length > 0
  ? `- Recent assessments:\n${snapshot.recent_assessments.map((a) => `  • ${a.scale}: ${a.score} (${a.date})`).join('\n')}`
  : ''}

You are assisting a clinician reviewing this patient's data.
Answer questions about the patient's clinical trajectory, suggest areas of focus,
and help interpret trends. Be concise and clinical. Always recommend direct clinical assessment
when making observations about patient care.`;

    // Build message history for LLM
    const chatHistory: ChatMessage[] = priorMessages.map((m) => ({
      role:    m.role === 'clinician' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    chatHistory.push({ role: 'user', content: message });

    // Persist clinician message
    const [clinicianMsg] = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO ai_discussion_messages (discussion_id, role, content)
      VALUES (${discussionId}, 'clinician', ${message})
      RETURNING id, created_at
    `;

    // Call LLM
    const result = await generateChat(systemPrompt, chatHistory, { maxTokens: 1024, temperature: 0.3 });

    // Persist assistant message
    const [assistantMsg] = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO ai_discussion_messages
        (discussion_id, role, content, model_id, input_tokens, output_tokens)
      VALUES
        (${discussionId}, 'assistant', ${result.text}, ${result.modelId},
         ${result.inputTokens}, ${result.outputTokens})
      RETURNING id, created_at
    `;

    // Update discussion counters
    await sql`
      UPDATE ai_discussions SET
        message_count       = message_count + 2,
        total_input_tokens  = total_input_tokens  + ${result.inputTokens},
        total_output_tokens = total_output_tokens + ${result.outputTokens},
        updated_at          = NOW()
      WHERE id = ${discussionId}
    `;

    // Record usage
    const [patient] = await sql<{ organisation_id: string }[]>`
      SELECT organisation_id FROM patients WHERE id = ${patientId}
    `;
    if (patient) {
      const monthYear = new Date().toISOString().substring(0, 7);
      const costCents = computeCostCents(result);
      await sql`
        INSERT INTO ai_usage_log
          (patient_id, org_id, month_year, insight_type, input_tokens, output_tokens, cost_cents)
        VALUES
          (${patientId}, ${patient.organisation_id}::UUID, ${monthYear}, 'discussion',
           ${result.inputTokens}, ${result.outputTokens}, ${costCents})
        ON CONFLICT (patient_id, month_year, insight_type) DO UPDATE SET
          input_tokens   = ai_usage_log.input_tokens  + EXCLUDED.input_tokens,
          output_tokens  = ai_usage_log.output_tokens + EXCLUDED.output_tokens,
          cost_cents     = ai_usage_log.cost_cents    + EXCLUDED.cost_cents,
          last_logged_at = NOW()
      `;
    }

    return reply.send({
      success: true,
      data: {
        discussion_id: discussionId,
        clinician_message: {
          id:         clinicianMsg!.id,
          role:       'clinician',
          content:    message,
          created_at: clinicianMsg!.created_at,
        },
        assistant_message: {
          id:         assistantMsg!.id,
          role:       'assistant',
          content:    result.text,
          model_id:   result.modelId,
          created_at: assistantMsg!.created_at,
        },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /insights/:patientId/ai/discussions — list discussions for a patient
  // ---------------------------------------------------------------------------
  fastify.get('/:patientId/ai/discussions', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId } = request.params as { patientId: string };
    const clinicianId   = request.user.sub;

    // Verify care team
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    const { limit } = DiscussionsQuerySchema.parse(request.query);

    const discussions = await sql<{
      id:            string;
      title:         string;
      message_count: number;
      updated_at:    string;
    }[]>`
      SELECT id, title, message_count, updated_at
      FROM ai_discussions
      WHERE patient_id = ${patientId}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;

    return reply.send({ success: true, data: { discussions } });
  });

  // ---------------------------------------------------------------------------
  // GET /insights/:patientId/ai/discussions/:discussionId — full discussion
  // ---------------------------------------------------------------------------
  fastify.get('/:patientId/ai/discussions/:discussionId', { preHandler: [fastify.authenticate, aiGate] }, async (request, reply) => {
    if (request.user.role !== 'clinician') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Clinician access only' } });
    }

    const { patientId, discussionId } = request.params as { patientId: string; discussionId: string };
    const clinicianId = request.user.sub;

    // Verify care team
    const [membership] = await sql<{ id: string }[]>`
      SELECT id FROM care_team_members
      WHERE clinician_id = ${clinicianId}
        AND patient_id   = ${patientId}
        AND unassigned_at IS NULL
    `;
    if (!membership) {
      return reply.status(403).send({ success: false, error: { code: 'NOT_ON_CARE_TEAM', message: 'You are not on this patient\'s care team.' } });
    }

    const [discussion] = await sql<{
      id:           string;
      title:        string;
      patient_id:   string;
      clinician_id: string;
      created_at:   string;
    }[]>`
      SELECT id, title, patient_id, clinician_id, created_at
      FROM ai_discussions
      WHERE id = ${discussionId} AND patient_id = ${patientId}
    `;

    if (!discussion) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Discussion not found.' } });
    }

    const messages = await sql<{
      id:         string;
      role:       string;
      content:    string;
      created_at: string;
    }[]>`
      SELECT id, role, content, created_at
      FROM ai_discussion_messages
      WHERE discussion_id = ${discussionId}
      ORDER BY created_at ASC
    `;

    return reply.send({
      success: true,
      data: {
        id:           discussion.id,
        title:        discussion.title,
        patient_id:   discussion.patient_id,
        clinician_id: discussion.clinician_id,
        messages,
        created_at:   discussion.created_at,
      },
    });
  });
}
