// =============================================================================
// MindLog API — AI Insights Worker (BullMQ)
//
// Processes AI inference jobs for clinical decision support.
// All inference is gated behind:
//   1. AI_INSIGHTS_ENABLED=true
//   2. ANTHROPIC_BAA_SIGNED=true
//   3. Patient has granted 'ai_insights' consent
//
// ⚠  HIPAA PREAMBLE (included in every prompt)
//    All patient data in prompts is de-identified: no names, email, or MRN.
//    The patient is referred to as "the patient".
//    This system is a clinical decision SUPPORT tool — it must never produce
//    definitive diagnoses or replace clinical judgment.
//
// Job types:
//   generate_weekly_summary    — 7-day narrative for a patient
//   generate_trend_narrative   — shorter trend analysis
//   detect_anomaly             — detect unusual patterns in recent data
//   risk_stratification        — compute + persist rule-based risk score
//                                (rule-based only — does NOT call LLM)
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@mindlog/db';
import { config } from '../config.js';
import { connection } from './rules-engine.js';
import { computeRiskScore, persistRiskScore } from '../services/riskScoring.js';

// ---------------------------------------------------------------------------
// Queue — exported so routes can enqueue jobs
// ---------------------------------------------------------------------------

export const AI_INSIGHTS_QUEUE_NAME = 'mindlog-ai-insights';

export const aiInsightsQueue = new Queue(AI_INSIGHTS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 2_000 },
  },
});

export type AiInsightJobType =
  | 'generate_weekly_summary'
  | 'generate_trend_narrative'
  | 'detect_anomaly'
  | 'risk_stratification';

export interface AiInsightJobData {
  patientId:   string;
  orgId:       string;
  jobType:     AiInsightJobType;
  clinicianId?: string;   // present when manually triggered by a clinician
  periodDays?: number;    // default 7
}

// ---------------------------------------------------------------------------
// HIPAA preamble — prepended to every LLM prompt
// ---------------------------------------------------------------------------

const HIPAA_PREAMBLE = `You are a clinical decision support system integrated into an electronic mental health record platform.

CRITICAL COMPLIANCE REQUIREMENTS:
- You are a decision SUPPORT tool. Never produce definitive diagnoses.
- Always recommend clinical judgment and direct assessment by a licensed clinician.
- The data provided is de-identified. Do not attempt to identify the patient.
- Respond in plain, professional clinical language suitable for a clinician audience.
- If you detect any indicators of imminent risk to life, flag them prominently at the top of your response.
- Do not suggest specific medication changes — that requires a prescriber.`;

// ---------------------------------------------------------------------------
// Consent verification — must pass before any inference
// ---------------------------------------------------------------------------

async function hasAiConsent(patientId: string): Promise<boolean> {
  const [row] = await sql<{ granted: boolean }[]>`
    SELECT granted
    FROM consent_records
    WHERE patient_id    = ${patientId}
      AND consent_type  = 'ai_insights'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row?.granted === true;
}

// ---------------------------------------------------------------------------
// Token usage accounting — UPSERT into ai_usage_log
// ---------------------------------------------------------------------------

async function recordUsage(
  patientId: string,
  orgId:     string,
  jobType:   AiInsightJobType,
  inputTokens:  number,
  outputTokens: number,
): Promise<void> {
  // Approximate cost: claude-sonnet-4-6 = $3 per 1M input, $15 per 1M output
  const costCents = Math.round(
    (inputTokens * 3 + outputTokens * 15) / 10_000,
  );
  const monthYear = new Date().toISOString().substring(0, 7); // YYYY-MM

  await sql`
    INSERT INTO ai_usage_log
      (patient_id, org_id, month_year, insight_type, input_tokens, output_tokens, cost_cents)
    VALUES
      (${patientId}, ${orgId}::UUID, ${monthYear}, ${jobType}, ${inputTokens}, ${outputTokens}, ${costCents})
    ON CONFLICT (patient_id, month_year, insight_type) DO UPDATE SET
      input_tokens   = ai_usage_log.input_tokens  + EXCLUDED.input_tokens,
      output_tokens  = ai_usage_log.output_tokens + EXCLUDED.output_tokens,
      cost_cents     = ai_usage_log.cost_cents    + EXCLUDED.cost_cents,
      last_logged_at = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Data aggregation — builds a de-identified clinical summary for the prompt
// ---------------------------------------------------------------------------

interface ClinicalSnapshot {
  period_days:     number;
  avg_mood:        number | null;
  min_mood:        number | null;
  max_mood:        number | null;
  avg_coping:      number | null;
  check_in_days:   number;
  avg_sleep_hours: number | null;
  top_triggers:    string[];
  top_symptoms:    string[];
  top_strategies:  string[];
  recent_assessments: Array<{ scale: string; score: number; date: string }>;
  med_adherence_pct: number | null;
  risk_score:      number | null;
}

async function buildClinicalSnapshot(
  patientId: string,
  periodDays: number,
): Promise<ClinicalSnapshot> {
  const since = new Date(Date.now() - periodDays * 86400_000)
    .toISOString()
    .split('T')[0]!;

  const [stats] = await sql<{
    avg_mood:          number | null;
    min_mood:          number | null;
    max_mood:          number | null;
    avg_coping:        number | null;
    check_in_days:     string;
    avg_sleep_minutes: number | null;
  }[]>`
    SELECT
      ROUND(AVG(de.mood)::numeric, 1)          AS avg_mood,
      MIN(de.mood)                              AS min_mood,
      MAX(de.mood)                              AS max_mood,
      ROUND(AVG(de.coping)::numeric, 1)        AS avg_coping,
      COUNT(de.id)                             AS check_in_days,
      ROUND(AVG(sl.total_minutes)::numeric, 0) AS avg_sleep_minutes
    FROM daily_entries de
    LEFT JOIN sleep_logs sl ON sl.daily_entry_id = de.id
    WHERE de.patient_id  = ${patientId}
      AND de.entry_date >= ${since}
      AND de.submitted_at IS NOT NULL
  `;

  const triggers = await sql<{ name: string }[]>`
    SELECT tc.name
    FROM trigger_logs tl
    JOIN trigger_catalogue tc ON tc.id = tl.trigger_id
    JOIN daily_entries de ON de.id = tl.daily_entry_id
    WHERE tl.patient_id = ${patientId}
      AND de.entry_date >= ${since}
      AND tl.is_active  = TRUE
    GROUP BY tc.name
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `;

  const symptoms = await sql<{ name: string }[]>`
    SELECT sc.name
    FROM symptom_logs sl2
    JOIN symptom_catalogue sc ON sc.id = sl2.symptom_id
    JOIN daily_entries de ON de.id = sl2.daily_entry_id
    WHERE sl2.patient_id = ${patientId}
      AND de.entry_date >= ${since}
      AND sl2.is_present = TRUE
    GROUP BY sc.name
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `;

  const strategies = await sql<{ name: string }[]>`
    SELECT ws.name
    FROM wellness_logs wl
    JOIN wellness_strategies ws ON ws.id = wl.strategy_id
    JOIN daily_entries de ON de.id = wl.daily_entry_id
    WHERE wl.patient_id  = ${patientId}
      AND de.entry_date >= ${since}
      AND wl.state = 'yes'
    GROUP BY ws.name
    ORDER BY COUNT(*) DESC
    LIMIT 3
  `;

  const assessments = await sql<{
    scale_code:  string;
    total_score: number;
    assessed_at: string;
  }[]>`
    SELECT scale_code, total_score, assessed_at::date::text AS assessed_at
    FROM validated_assessments
    WHERE patient_id   = ${patientId}
      AND assessed_at >= ${since}
    ORDER BY assessed_at DESC
    LIMIT 6
  `;

  const [adherence] = await sql<{ pct: number | null }[]>`
    SELECT
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE mal.taken = TRUE)
        / NULLIF(COUNT(*), 0)
      )::int AS pct
    FROM medication_adherence_logs mal
    JOIN patient_medications pm ON pm.id = mal.patient_medication_id
    WHERE pm.patient_id       = ${patientId}
      AND pm.discontinued_at IS NULL
      AND pm.show_in_app      = TRUE
      AND mal.entry_date     >= ${since}
  `;

  const [patient] = await sql<{ risk_score: number | null }[]>`
    SELECT risk_score FROM patients WHERE id = ${patientId}
  `;

  return {
    period_days:       periodDays,
    avg_mood:          stats?.avg_mood ?? null,
    min_mood:          stats?.min_mood ?? null,
    max_mood:          stats?.max_mood ?? null,
    avg_coping:        stats?.avg_coping ?? null,
    check_in_days:     Number(stats?.check_in_days ?? 0),
    avg_sleep_hours:   stats?.avg_sleep_minutes
      ? Math.round((stats.avg_sleep_minutes / 60) * 10) / 10
      : null,
    top_triggers:      triggers.map((t) => t.name),
    top_symptoms:      symptoms.map((s) => s.name),
    top_strategies:    strategies.map((s) => s.name),
    recent_assessments: assessments.map((a) => ({
      scale: a.scale_code,
      score: a.total_score,
      date:  a.assessed_at,
    })),
    med_adherence_pct: adherence?.pct ?? null,
    risk_score:        patient?.risk_score ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildWeeklySummaryPrompt(snapshot: ClinicalSnapshot): string {
  return `${HIPAA_PREAMBLE}

TASK: Generate a clinical weekly summary for this de-identified patient.

PATIENT DATA (${snapshot.period_days}-day window):
- Check-ins completed: ${snapshot.check_in_days} of ${snapshot.period_days} days
- Mood: avg ${snapshot.avg_mood ?? 'N/A'}/10, range ${snapshot.min_mood ?? 'N/A'}–${snapshot.max_mood ?? 'N/A'}
- Coping: avg ${snapshot.avg_coping ?? 'N/A'}/10
- Sleep: avg ${snapshot.avg_sleep_hours ?? 'N/A'} hours/night
- Medication adherence: ${snapshot.med_adherence_pct != null ? `${snapshot.med_adherence_pct}%` : 'N/A'}
- Composite risk score: ${snapshot.risk_score ?? 'not computed'}
- Top triggers: ${snapshot.top_triggers.join(', ') || 'none recorded'}
- Top symptoms: ${snapshot.top_symptoms.join(', ') || 'none recorded'}
- Helpful strategies: ${snapshot.top_strategies.join(', ') || 'none recorded'}
${snapshot.recent_assessments.length > 0
  ? `- Recent assessments:\n${snapshot.recent_assessments.map((a) => `  • ${a.scale}: ${a.score} (${a.date})`).join('\n')}`
  : ''}

RESPONSE FORMAT (respond ONLY with valid JSON, no markdown, no preamble):
{
  "narrative": "<2–4 paragraph clinical narrative suitable for a progress note>",
  "key_findings": [
    "<clinical finding 1, max 15 words>",
    "<clinical finding 2, max 15 words>",
    ...
  ],
  "risk_indicators": "<any indicators of elevated risk, or 'None identified'>",
  "recommended_focus": "<1–2 suggested clinical focus areas for the next session>"
}

Key findings list should have 3–6 items. Use objective, clinical language.`;
}

function buildAnomalyDetectionPrompt(snapshot: ClinicalSnapshot): string {
  return `${HIPAA_PREAMBLE}

TASK: Identify any anomalous or concerning patterns in this patient's data.

PATIENT DATA (${snapshot.period_days}-day window):
- Check-ins: ${snapshot.check_in_days}/${snapshot.period_days} days
- Mood trend: avg ${snapshot.avg_mood ?? 'N/A'}, min ${snapshot.min_mood ?? 'N/A'}, max ${snapshot.max_mood ?? 'N/A'}
- Sleep: ${snapshot.avg_sleep_hours ?? 'N/A'} h avg
- Medication adherence: ${snapshot.med_adherence_pct != null ? `${snapshot.med_adherence_pct}%` : 'N/A'}
- Top triggers: ${snapshot.top_triggers.join(', ') || 'none'}
- Top symptoms: ${snapshot.top_symptoms.join(', ') || 'none'}
- Assessments: ${snapshot.recent_assessments.map((a) => `${a.scale}=${a.score}`).join(', ') || 'none'}

RESPONSE FORMAT (valid JSON only):
{
  "anomalies_detected": true | false,
  "narrative": "<brief summary of any anomalies, or 'No significant anomalies detected'>",
  "key_findings": ["<finding 1>", "<finding 2>"],
  "urgency": "routine" | "elevated" | "urgent"
}

"urgent" should only be used for indicators of imminent safety concern.`;
}

// ---------------------------------------------------------------------------
// Core inference function
// ---------------------------------------------------------------------------

async function runInference(
  jobType:  Exclude<AiInsightJobType, 'risk_stratification'>,
  snapshot: ClinicalSnapshot,
): Promise<{
  narrative:    string;
  key_findings: string[];
  rawResponse:  unknown;
  inputTokens:  number;
  outputTokens: number;
}> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const prompt = jobType === 'detect_anomaly'
    ? buildAnomalyDetectionPrompt(snapshot)
    : buildWeeklySummaryPrompt(snapshot);

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: jobType === 'detect_anomaly' ? 0.0 : 0.3,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';
  const parsed = JSON.parse(text) as {
    narrative?:    string;
    key_findings?: string[];
    recommended_focus?: string;
    risk_indicators?:   string;
  };

  const narrative = [
    parsed.narrative ?? 'Narrative generation failed.',
    parsed.recommended_focus ? `\n\n**Recommended focus:** ${parsed.recommended_focus}` : '',
    parsed.risk_indicators && parsed.risk_indicators !== 'None identified'
      ? `\n\n⚠ **Risk indicators:** ${parsed.risk_indicators}`
      : '',
  ].join('');

  return {
    narrative,
    key_findings:  parsed.key_findings ?? [],
    rawResponse:   parsed,
    inputTokens:   message.usage.input_tokens,
    outputTokens:  message.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processAiInsightJob(job: { data: AiInsightJobData }): Promise<void> {
  const { patientId, orgId, jobType, clinicianId, periodDays = 7 } = job.data;

  // ── Gate: env flags ────────────────────────────────────────────────────────
  if (!config.aiInsightsEnabled || !config.anthropicBaaSigned) {
    console.warn(`[ai-worker] Skipping job ${jobType} — AI not enabled`);
    return;
  }

  // ── Risk stratification is rule-based only (no LLM) ──────────────────────
  if (jobType === 'risk_stratification') {
    const result = await computeRiskScore(patientId);
    await persistRiskScore(patientId, result);
    console.info(`[ai-worker] ✓ risk_stratification — patient ${patientId} — score ${result.score} (${result.band})`);
    return;
  }

  // ── All other jobs require patient AI consent ─────────────────────────────
  const consented = await hasAiConsent(patientId);
  if (!consented) {
    console.info(`[ai-worker] Skipping ${jobType} — patient ${patientId} has not consented to AI insights`);
    return;
  }

  // ── Retrieve prior insight for risk_delta calculation ─────────────────────
  const [prior] = await sql<{ score: number | null }[]>`
    SELECT pai.risk_delta AS score
    FROM patient_ai_insights pai
    WHERE patient_id   = ${patientId}
      AND insight_type = ${jobType}
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  // ── Build clinical snapshot ────────────────────────────────────────────────
  const snapshot = await buildClinicalSnapshot(patientId, periodDays);

  // ── Run inference ──────────────────────────────────────────────────────────
  let narrative:    string;
  let key_findings: string[];
  let inputTokens:  number;
  let outputTokens: number;

  try {
    const result = await runInference(jobType, snapshot);
    ({ narrative, key_findings, inputTokens, outputTokens } = result);
  } catch (err) {
    console.error(`[ai-worker] Inference error for ${jobType} / patient ${patientId}:`, err);
    throw err; // Let BullMQ retry
  }

  // ── Compute risk delta ─────────────────────────────────────────────────────
  const currentRisk = snapshot.risk_score ?? 0;
  const priorRisk   = prior?.score ?? currentRisk;
  const riskDelta   = Math.max(-100, Math.min(100, currentRisk - priorRisk));

  // ── Persist insight ────────────────────────────────────────────────────────
  const periodStart = new Date(Date.now() - periodDays * 86400_000)
    .toISOString().split('T')[0]!;
  const periodEnd = new Date().toISOString().split('T')[0]!;

  await sql`
    INSERT INTO patient_ai_insights
      (patient_id, clinician_id, insight_type,
       period_start, period_end,
       narrative, key_findings, risk_delta,
       model_id, input_tokens, output_tokens,
       consent_verified)
    VALUES (
      ${patientId},
      ${clinicianId ?? null},
      ${jobType},
      ${periodStart}::date, ${periodEnd}::date,
      ${narrative},
      ${JSON.stringify(key_findings)}::JSONB,
      ${riskDelta},
      'claude-sonnet-4-6',
      ${inputTokens},
      ${outputTokens},
      TRUE
    )
  `;

  // ── Record usage ───────────────────────────────────────────────────────────
  await recordUsage(patientId, orgId, jobType, inputTokens, outputTokens);

  console.info(
    `[ai-worker] ✓ ${jobType} — patient ${patientId} — `
    + `${inputTokens}in/${outputTokens}out tokens`,
  );
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startAiInsightsWorker(): Worker<AiInsightJobData> {
  const worker = new Worker<AiInsightJobData>(
    AI_INSIGHTS_QUEUE_NAME,
    processAiInsightJob,
    {
      connection,
      concurrency: 2,   // LLM calls are I/O-bound; 2 concurrent is safe
    },
  );

  worker.on('completed', (job) => {
    console.info(`[ai-worker] ✓ completed job ${job.id} (${job.data.jobType})`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[ai-worker] ✗ failed job ${job?.id ?? '?'} (${job?.data.jobType ?? 'unknown'}):`,
      err.message,
    );
  });

  return worker;
}
