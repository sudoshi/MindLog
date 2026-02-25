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
//   nightly_deep_analysis      — enriched multi-domain analysis via LLM
//                                (structured JSON output with trajectory,
//                                 domain findings, early warnings, etc.)
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@mindlog/db';
import { config } from '../config.js';
import { connection } from './rules-engine.js';
import { computeRiskScore, persistRiskScore } from '../services/riskScoring.js';
import { generateCompletion, computeCostCents } from '../services/llmClient.js';

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
  | 'risk_stratification'
  | 'nightly_deep_analysis';

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

export const HIPAA_PREAMBLE = `You are a clinical decision support system integrated into an electronic mental health record platform.

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
    ORDER BY granted_at DESC
    LIMIT 1
  `;
  return row?.granted === true;
}

// ---------------------------------------------------------------------------
// Job type → DB insight_type mapping
//
// BullMQ job types use verb prefixes (generate_weekly_summary) while the
// DB CHECK constraint uses noun forms (weekly_summary).
// ---------------------------------------------------------------------------

const JOB_TYPE_TO_INSIGHT_TYPE: Record<AiInsightJobType, string> = {
  generate_weekly_summary:  'weekly_summary',
  generate_trend_narrative: 'trend_narrative',
  detect_anomaly:           'anomaly_detection',
  risk_stratification:      'risk_stratification',
  nightly_deep_analysis:    'nightly_deep_analysis',
};

const DB_INSIGHT_TYPES = new Set(Object.values(JOB_TYPE_TO_INSIGHT_TYPE));

function insightTypeForDb(jobType: AiInsightJobType | string): string {
  // Verb-form → DB noun-form (from nightly scheduler)
  if (jobType in JOB_TYPE_TO_INSIGHT_TYPE) {
    return JOB_TYPE_TO_INSIGHT_TYPE[jobType as AiInsightJobType];
  }
  // Already a DB-form type (from trigger route) — pass through
  if (DB_INSIGHT_TYPES.has(jobType)) {
    return jobType;
  }
  return jobType; // fallback
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
  costCents:    number,
): Promise<void> {
  const monthYear = new Date().toISOString().substring(0, 7); // YYYY-MM

  await sql`
    INSERT INTO ai_usage_log
      (patient_id, org_id, month_year, insight_type, input_tokens, output_tokens, cost_cents)
    VALUES
      (${patientId}, ${orgId}::UUID, ${monthYear}, ${insightTypeForDb(jobType)}, ${inputTokens}, ${outputTokens}, ${costCents})
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

export interface ClinicalSnapshot {
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

export async function buildClinicalSnapshot(
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
    scale:      string;
    score:      number;
    assessed_at: string;
  }[]>`
    SELECT scale, score, completed_at::date::text AS assessed_at
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND completed_at >= ${since}
    ORDER BY completed_at DESC
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
      scale: a.scale,
      score: a.score,
      date:  a.assessed_at,
    })),
    med_adherence_pct: adherence?.pct ?? null,
    risk_score:        patient?.risk_score ?? null,
  };
}

// ---------------------------------------------------------------------------
// Enriched snapshot — deep analysis data for nightly_deep_analysis
// ---------------------------------------------------------------------------

export interface EnrichedClinicalSnapshot extends ClinicalSnapshot {
  phq9_trajectory?:  Array<{ score: number; date: string; delta?: number }>;
  gad7_trajectory?:  Array<{ score: number; date: string; delta?: number }>;
  asrm_trajectory?:  Array<{ score: number; date: string; delta?: number }>;
  sleep_pattern?: {
    avg_hours:       number | null;
    variability_hrs: number | null;
    avg_quality:     number | null;
    short_nights:    number;
    trend:           'improving' | 'stable' | 'declining' | 'insufficient_data';
  };
  passive_health?: {
    avg_steps:       number | null;
    step_trend:      'up' | 'stable' | 'down' | null;
    avg_hrv:         number | null;
    avg_resting_hr:  number | null;
  };
  med_adherence_detail?: {
    rate_pct:             number | null;
    longest_miss_streak:  number;
    medications:          Array<{ name: string; adherence_pct: number }>;
  };
  social_trend?: {
    avg_social_score:     number | null;
    avoidance_days_7d:    number;
    trend:                'improving' | 'stable' | 'declining' | 'insufficient_data';
  };
  correlations?: {
    sleep_mood?:     { coefficient: number; n: number } | null;
    exercise_mood?:  { coefficient: number; n: number } | null;
  };
  prior_insight_summary?: string | null;
  risk_factors?: Array<{ rule: string; contribution: number; detail: string }>;
}

async function fetchAssessmentTrajectory(
  patientId: string, scale: string, count: number,
): Promise<Array<{ score: number; date: string; delta?: number }>> {
  const rows = await sql<{ score: number; completed_at: string }[]>`
    SELECT score::int, completed_at::date::text AS completed_at
    FROM validated_assessments
    WHERE patient_id = ${patientId} AND scale = ${scale}
    ORDER BY completed_at DESC LIMIT ${count}
  `;
  const trajectory = rows.reverse().map((r, i, arr) => {
    const base = { score: r.score, date: r.completed_at };
    return i > 0 ? { ...base, delta: r.score - arr[i - 1]!.score } : base;
  });
  return trajectory;
}

async function fetchSleepPattern(
  patientId: string, since7d: string,
): Promise<EnrichedClinicalSnapshot['sleep_pattern']> {
  const rows = await sql<{ total_minutes: number | null; quality: number | null }[]>`
    SELECT total_minutes, quality
    FROM sleep_logs
    WHERE patient_id = ${patientId} AND entry_date >= ${since7d}::date
    ORDER BY entry_date ASC
  `;
  if (rows.length === 0) return { avg_hours: null, variability_hrs: null, avg_quality: null, short_nights: 0, trend: 'insufficient_data' };

  const hours = rows.filter(r => r.total_minutes != null).map(r => r.total_minutes! / 60);
  const avgH = hours.length > 0 ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length * 10) / 10 : null;
  const variance = hours.length >= 2
    ? Math.sqrt(hours.reduce((sum, h) => sum + (h - avgH!) ** 2, 0) / hours.length)
    : null;
  const qualities = rows.filter(r => r.quality != null).map(r => r.quality!);
  const avgQ = qualities.length > 0 ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length * 10) / 10 : null;
  const shortNights = hours.filter(h => h < 5).length;

  // Trend: compare first half vs second half avg hours
  let trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data';
  if (hours.length >= 4) {
    const mid = Math.floor(hours.length / 2);
    const firstHalf = hours.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = hours.slice(mid).reduce((a, b) => a + b, 0) / (hours.length - mid);
    if (secondHalf - firstHalf > 0.5) trend = 'improving';
    else if (firstHalf - secondHalf > 0.5) trend = 'declining';
    else trend = 'stable';
  }

  return { avg_hours: avgH, variability_hrs: variance ? Math.round(variance * 10) / 10 : null, avg_quality: avgQ, short_nights: shortNights, trend };
}

async function fetchPassiveHealth(
  patientId: string, since7d: string,
): Promise<EnrichedClinicalSnapshot['passive_health']> {
  const rows = await sql<{ step_count: number | null; hrv_ms: number | null; resting_hr: number | null; snapshot_date: string }[]>`
    SELECT step_count, hrv_ms::float, resting_hr, snapshot_date::text
    FROM passive_health_snapshots
    WHERE patient_id = ${patientId} AND snapshot_date >= ${since7d}::date
    ORDER BY snapshot_date ASC
  `;
  if (rows.length === 0) return { avg_steps: null, step_trend: null, avg_hrv: null, avg_resting_hr: null };

  const steps = rows.filter(r => r.step_count != null).map(r => r.step_count!);
  const avgSteps = steps.length > 0 ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null;
  let stepTrend: 'up' | 'stable' | 'down' | null = null;
  if (steps.length >= 4) {
    const mid = Math.floor(steps.length / 2);
    const firstHalf = steps.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = steps.slice(mid).reduce((a, b) => a + b, 0) / (steps.length - mid);
    if (secondHalf / firstHalf > 1.15) stepTrend = 'up';
    else if (secondHalf / firstHalf < 0.85) stepTrend = 'down';
    else stepTrend = 'stable';
  }

  const hrvs = rows.filter(r => r.hrv_ms != null).map(r => r.hrv_ms!);
  const avgHrv = hrvs.length > 0 ? Math.round(hrvs.reduce((a, b) => a + b, 0) / hrvs.length * 10) / 10 : null;
  const hrs = rows.filter(r => r.resting_hr != null).map(r => r.resting_hr!);
  const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;

  return { avg_steps: avgSteps, step_trend: stepTrend, avg_hrv: avgHrv, avg_resting_hr: avgHr };
}

async function fetchMedAdherenceDetail(
  patientId: string, since: string,
): Promise<EnrichedClinicalSnapshot['med_adherence_detail']> {
  const rows = await sql<{ med_name: string; total: number; taken_count: number }[]>`
    SELECT pm.medication_name AS med_name, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE mal.taken = TRUE)::int AS taken_count
    FROM medication_adherence_logs mal
    JOIN patient_medications pm ON pm.id = mal.patient_medication_id
    WHERE pm.patient_id = ${patientId}
      AND pm.discontinued_at IS NULL AND pm.show_in_app = TRUE
      AND mal.entry_date >= ${since}::date
    GROUP BY pm.medication_name
  `;

  const overall = rows.length > 0
    ? Math.round(100 * rows.reduce((s, r) => s + r.taken_count, 0) / rows.reduce((s, r) => s + r.total, 0))
    : null;

  // Longest consecutive miss streak (across all meds)
  const allMissed = await sql<{ entry_date: string }[]>`
    SELECT DISTINCT mal.entry_date::text AS entry_date
    FROM medication_adherence_logs mal
    JOIN patient_medications pm ON pm.id = mal.patient_medication_id
    WHERE pm.patient_id = ${patientId}
      AND pm.discontinued_at IS NULL AND pm.show_in_app = TRUE
      AND mal.entry_date >= ${since}::date AND mal.taken = FALSE
    ORDER BY 1
  `;
  let maxStreak = 0; let curStreak = 0; let lastD: Date | null = null;
  for (const r of allMissed) {
    const d = new Date(r.entry_date);
    if (lastD && Math.abs(d.getTime() - lastD.getTime()) <= 86400_000 * 1.5) curStreak++;
    else curStreak = 1;
    maxStreak = Math.max(maxStreak, curStreak);
    lastD = d;
  }

  return {
    rate_pct: overall,
    longest_miss_streak: maxStreak,
    medications: rows.map(r => ({
      name: r.med_name,
      adherence_pct: r.total > 0 ? Math.round(100 * r.taken_count / r.total) : 0,
    })),
  };
}

async function fetchSocialTrend(
  patientId: string, since7d: string,
): Promise<EnrichedClinicalSnapshot['social_trend']> {
  const rows = await sql<{ social_score: number | null; social_avoidance: boolean | null }[]>`
    SELECT social_score, social_avoidance
    FROM daily_entries
    WHERE patient_id = ${patientId} AND entry_date >= ${since7d}::date AND submitted_at IS NOT NULL
    ORDER BY entry_date ASC
  `;
  const scores = rows.filter(r => r.social_score != null).map(r => r.social_score!);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
  const avoidanceDays = rows.filter(r => r.social_avoidance === true).length;

  let trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data';
  if (scores.length >= 4) {
    const mid = Math.floor(scores.length / 2);
    const firstAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
    if (secondAvg - firstAvg > 0.5) trend = 'improving';
    else if (firstAvg - secondAvg > 0.5) trend = 'declining';
    else trend = 'stable';
  }

  return { avg_social_score: avgScore, avoidance_days_7d: avoidanceDays, trend };
}

async function fetchCorrelation(
  patientId: string, since: string, type: 'sleep' | 'exercise',
): Promise<{ coefficient: number; n: number } | null> {
  const result = type === 'sleep'
    ? await sql<{ corr: number | null; n: number }[]>`
        SELECT CORR(sl.total_minutes / 60.0, de.mood)::float AS corr, COUNT(*)::int AS n
        FROM daily_entries de
        JOIN sleep_logs sl ON sl.daily_entry_id = de.id
        WHERE de.patient_id = ${patientId} AND de.entry_date >= ${since}::date
          AND de.submitted_at IS NOT NULL AND de.mood IS NOT NULL AND sl.total_minutes IS NOT NULL
      `
    : await sql<{ corr: number | null; n: number }[]>`
        SELECT CORR(el.duration_minutes, de.mood)::float AS corr, COUNT(*)::int AS n
        FROM daily_entries de
        JOIN exercise_logs el ON el.daily_entry_id = de.id
        WHERE de.patient_id = ${patientId} AND de.entry_date >= ${since}::date
          AND de.submitted_at IS NOT NULL AND de.mood IS NOT NULL AND el.duration_minutes IS NOT NULL
      `;

  const row = result[0];
  if (!row || row.n < 7 || row.corr == null) return null;
  return { coefficient: Math.round(row.corr * 100) / 100, n: row.n };
}

async function fetchPriorInsightSummary(patientId: string): Promise<string | null> {
  const [row] = await sql<{ narrative: string }[]>`
    SELECT narrative FROM patient_ai_insights
    WHERE patient_id = ${patientId}
      AND insight_type IN ('nightly_deep_analysis', 'weekly_summary')
    ORDER BY generated_at DESC LIMIT 1
  `;
  return row ? row.narrative.substring(0, 200) : null;
}

export async function buildEnrichedClinicalSnapshot(
  patientId: string, periodDays: number,
): Promise<EnrichedClinicalSnapshot> {
  const base = await buildClinicalSnapshot(patientId, periodDays);
  const since = new Date(Date.now() - periodDays * 86400_000).toISOString().split('T')[0]!;
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0]!;

  const riskResult = await computeRiskScore(patientId);

  const [
    phq9Traj, gad7Traj, asrmTraj,
    sleepPat, passiveH, medDetail,
    socialTr, sleepCorr, exCorr,
    priorSummary,
  ] = await Promise.all([
    fetchAssessmentTrajectory(patientId, 'PHQ-9', 3),
    fetchAssessmentTrajectory(patientId, 'GAD-7', 3),
    fetchAssessmentTrajectory(patientId, 'ASRM', 3),
    fetchSleepPattern(patientId, since7d),
    fetchPassiveHealth(patientId, since7d),
    fetchMedAdherenceDetail(patientId, since),
    fetchSocialTrend(patientId, since7d),
    fetchCorrelation(patientId, since, 'sleep'),
    fetchCorrelation(patientId, since, 'exercise'),
    fetchPriorInsightSummary(patientId),
  ]);

  return {
    ...base,
    risk_score: riskResult.score,
    ...(phq9Traj.length > 0 ? { phq9_trajectory: phq9Traj } : {}),
    ...(gad7Traj.length > 0 ? { gad7_trajectory: gad7Traj } : {}),
    ...(asrmTraj.length > 0 ? { asrm_trajectory: asrmTraj } : {}),
    sleep_pattern:         sleepPat!,
    passive_health:        passiveH!,
    med_adherence_detail:  medDetail!,
    social_trend:          socialTr!,
    correlations:          { sleep_mood: sleepCorr, exercise_mood: exCorr },
    prior_insight_summary: priorSummary,
    risk_factors: riskResult.factors.filter(f => f.contribution > 0).map(f => ({
      rule: f.rule, contribution: f.contribution, detail: f.detail,
    })),
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

function formatTrajectoryForPrompt(
  traj: Array<{ score: number; date: string; delta?: number }> | undefined,
): string {
  if (!traj || traj.length === 0) return 'No data';
  return traj.map(t => `${t.score} (${t.date}${t.delta != null ? `, Δ${t.delta > 0 ? '+' : ''}${t.delta}` : ''})`).join(' → ');
}

function buildDeepAnalysisPrompt(snapshot: EnrichedClinicalSnapshot): string {
  return `${HIPAA_PREAMBLE}

TASK: Generate a structured deep clinical analysis for this de-identified patient.
This analysis will be reviewed by a clinician as part of their daily workflow.

PATIENT DATA (${snapshot.period_days}-day window):

CORE METRICS:
- Check-ins completed: ${snapshot.check_in_days}/${snapshot.period_days} days
- Mood: avg ${snapshot.avg_mood ?? 'N/A'}/10, range ${snapshot.min_mood ?? 'N/A'}–${snapshot.max_mood ?? 'N/A'}
- Coping: avg ${snapshot.avg_coping ?? 'N/A'}/10
- Composite risk score: ${snapshot.risk_score ?? 'not computed'}/100

ASSESSMENT TRAJECTORIES:
- PHQ-9: ${formatTrajectoryForPrompt(snapshot.phq9_trajectory)}
- GAD-7: ${formatTrajectoryForPrompt(snapshot.gad7_trajectory)}
- ASRM: ${formatTrajectoryForPrompt(snapshot.asrm_trajectory)}

SLEEP PATTERN (7-day):
${snapshot.sleep_pattern ? `- Avg: ${snapshot.sleep_pattern.avg_hours ?? 'N/A'}h, quality: ${snapshot.sleep_pattern.avg_quality ?? 'N/A'}/5, variability: ${snapshot.sleep_pattern.variability_hrs ?? 'N/A'}h, short nights (<5h): ${snapshot.sleep_pattern.short_nights}, trend: ${snapshot.sleep_pattern.trend}` : '- No sleep data'}

PASSIVE HEALTH:
${snapshot.passive_health ? `- Steps: ${snapshot.passive_health.avg_steps ?? 'N/A'} avg (${snapshot.passive_health.step_trend ?? 'unknown'}), HRV: ${snapshot.passive_health.avg_hrv ?? 'N/A'}ms, resting HR: ${snapshot.passive_health.avg_resting_hr ?? 'N/A'}bpm` : '- No passive health data'}

MEDICATION ADHERENCE:
- Overall: ${snapshot.med_adherence_pct != null ? `${snapshot.med_adherence_pct}%` : 'N/A'}
${snapshot.med_adherence_detail?.medications.map(m => `  - ${m.name}: ${m.adherence_pct}%`).join('\n') || '  - No medication data'}
- Longest miss streak: ${snapshot.med_adherence_detail?.longest_miss_streak ?? 0} days

SOCIAL FUNCTIONING:
${snapshot.social_trend ? `- Avg social score: ${snapshot.social_trend.avg_social_score ?? 'N/A'}/5, avoidance days: ${snapshot.social_trend.avoidance_days_7d}/7, trend: ${snapshot.social_trend.trend}` : '- No social data'}

CROSS-DOMAIN CORRELATIONS:
${snapshot.correlations?.sleep_mood ? `- Sleep→Mood: r=${snapshot.correlations.sleep_mood.coefficient} (n=${snapshot.correlations.sleep_mood.n})` : '- Sleep→Mood: insufficient data'}
${snapshot.correlations?.exercise_mood ? `- Exercise→Mood: r=${snapshot.correlations.exercise_mood.coefficient} (n=${snapshot.correlations.exercise_mood.n})` : '- Exercise→Mood: insufficient data'}

ACTIVE RISK FACTORS:
${snapshot.risk_factors?.map(f => `- [${f.contribution}pts] ${f.detail}`).join('\n') || '- None active'}

TOP TRIGGERS: ${snapshot.top_triggers.join(', ') || 'none recorded'}
TOP SYMPTOMS: ${snapshot.top_symptoms.join(', ') || 'none recorded'}
HELPFUL STRATEGIES: ${snapshot.top_strategies.join(', ') || 'none recorded'}

${snapshot.prior_insight_summary ? `PRIOR INSIGHT SUMMARY: ${snapshot.prior_insight_summary}` : ''}

RESPONSE FORMAT (respond ONLY with valid JSON, no markdown, no preamble):
{
  "clinical_trajectory": "improving" | "stable" | "declining" | "acute",
  "trajectory_rationale": "<1-2 sentences explaining trajectory assessment>",
  "narrative": "<3-5 paragraph comprehensive clinical narrative>",
  "key_findings": ["<finding 1>", "<finding 2>", ...],
  "domain_findings": {
    "mood": "<1-2 sentence mood domain summary>",
    "sleep": "<1-2 sentence sleep domain summary>",
    "anxiety": "<1-2 sentence anxiety domain summary>",
    "social": "<1-2 sentence social functioning summary>",
    "medications": "<1-2 sentence medication adherence summary>"
  },
  "early_warnings": [
    {"signal": "<description>", "urgency": "routine" | "elevated" | "urgent", "domain": "<domain>"}
  ],
  "treatment_response": "<assessment of treatment effectiveness based on data trends>",
  "recommended_focus": [
    {"area": "<focus area>", "priority": 1, "rationale": "<why>"}
  ],
  "cross_domain_patterns": ["<pattern 1>", "<pattern 2>"]
}

Guidelines:
- key_findings: 4-8 items, each max 20 words, objective clinical language
- early_warnings: only include if data supports; "urgent" only for imminent safety concern
- recommended_focus: 2-4 items, priority 1 (highest) to 5 (lowest)
- Always recommend direct clinical assessment for any safety concerns
- If data is sparse, acknowledge limitations rather than speculating`;
}

// ---------------------------------------------------------------------------
// Core inference function
// ---------------------------------------------------------------------------

interface InferenceResult {
  narrative:           string;
  key_findings:        string[];
  rawResponse:         unknown;
  inputTokens:         number;
  outputTokens:        number;
  modelId:             string;
  costCents:           number;
  structured_findings?: unknown;
  clinical_trajectory?: string;
}

async function runInference(
  jobType:  string,  // accepts both verb-form (scheduler) and DB-form (route trigger)
  snapshot: ClinicalSnapshot | EnrichedClinicalSnapshot,
): Promise<InferenceResult> {
  const isDeep = jobType === 'nightly_deep_analysis';
  const isAnomaly = jobType === 'detect_anomaly' || jobType === 'anomaly_detection';
  const prompt = isDeep
    ? buildDeepAnalysisPrompt(snapshot as EnrichedClinicalSnapshot)
    : isAnomaly
      ? buildAnomalyDetectionPrompt(snapshot)
      : buildWeeklySummaryPrompt(snapshot);

  const result = await generateCompletion(prompt, {
    maxTokens:   isDeep ? 2048 : 1024,
    temperature: jobType === 'detect_anomaly' ? 0.0 : isDeep ? 0.2 : 0.3,
    jsonMode:    true,
  });

  const parsed = JSON.parse(result.text) as Record<string, unknown>;

  if (isDeep) {
    // Deep analysis: structured response
    const narrative = [
      (parsed.narrative as string) ?? 'Narrative generation failed.',
      parsed.treatment_response ? `\n\n**Treatment response:** ${parsed.treatment_response}` : '',
    ].join('');

    return {
      narrative,
      key_findings:        (parsed.key_findings as string[]) ?? [],
      rawResponse:         parsed,
      inputTokens:         result.inputTokens,
      outputTokens:        result.outputTokens,
      modelId:             result.modelId,
      costCents:           computeCostCents(result),
      structured_findings: {
        trajectory_rationale:  parsed.trajectory_rationale,
        domain_findings:       parsed.domain_findings,
        early_warnings:        parsed.early_warnings ?? [],
        treatment_response:    parsed.treatment_response,
        recommended_focus:     parsed.recommended_focus ?? [],
        cross_domain_patterns: parsed.cross_domain_patterns ?? [],
      },
      clinical_trajectory: (parsed.clinical_trajectory as string) ?? 'stable',
    };
  }

  // Legacy prompts (weekly_summary, trend_narrative, detect_anomaly)
  const narrative = [
    (parsed.narrative as string) ?? 'Narrative generation failed.',
    parsed.recommended_focus ? `\n\n**Recommended focus:** ${parsed.recommended_focus}` : '',
    parsed.risk_indicators && parsed.risk_indicators !== 'None identified'
      ? `\n\n⚠ **Risk indicators:** ${parsed.risk_indicators}`
      : '',
  ].join('');

  return {
    narrative,
    key_findings:  (parsed.key_findings as string[]) ?? [],
    rawResponse:   parsed,
    inputTokens:   result.inputTokens,
    outputTokens:  result.outputTokens,
    modelId:       result.modelId,
    costCents:     computeCostCents(result),
  };
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processAiInsightJob(job: { data: AiInsightJobData }): Promise<void> {
  const { patientId, orgId, jobType, clinicianId, periodDays = 7 } = job.data;

  // ── Gate: env flags ────────────────────────────────────────────────────────
  if (!config.aiInsightsEnabled) {
    console.warn(`[ai-worker] Skipping job ${jobType} — AI not enabled`);
    return;
  }
  if (config.aiProvider !== 'ollama' && !config.anthropicBaaSigned) {
    console.warn(`[ai-worker] Skipping job ${jobType} — BAA not signed (Anthropic provider)`);
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
      AND insight_type = ${insightTypeForDb(jobType)}
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  // ── Build clinical snapshot ────────────────────────────────────────────────
  const isDeepAnalysis = jobType === 'nightly_deep_analysis';
  const effectivePeriod = isDeepAnalysis ? 30 : periodDays;
  const snapshot = isDeepAnalysis
    ? await buildEnrichedClinicalSnapshot(patientId, effectivePeriod)
    : await buildClinicalSnapshot(patientId, effectivePeriod);

  // ── Run inference ──────────────────────────────────────────────────────────
  let narrative:           string;
  let key_findings:        string[];
  let inputTokens:         number;
  let outputTokens:        number;
  let modelId:             string;
  let costCents:           number;
  let structured_findings: unknown | undefined;
  let clinical_trajectory: string | undefined;

  try {
    const result = await runInference(jobType, snapshot);
    ({ narrative, key_findings, inputTokens, outputTokens, modelId, costCents } = result);
    structured_findings = result.structured_findings;
    clinical_trajectory = result.clinical_trajectory;
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
       consent_verified,
       structured_findings, clinical_trajectory)
    VALUES (
      ${patientId},
      ${clinicianId ?? null},
      ${insightTypeForDb(jobType)},
      ${periodStart}::date, ${periodEnd}::date,
      ${narrative},
      ${JSON.stringify(key_findings)}::JSONB,
      ${riskDelta},
      ${modelId},
      ${inputTokens},
      ${outputTokens},
      TRUE,
      ${structured_findings ? JSON.stringify(structured_findings) : null}::JSONB,
      ${clinical_trajectory ?? null}
    )
  `;

  // ── Record usage ───────────────────────────────────────────────────────────
  await recordUsage(patientId, orgId, jobType, inputTokens, outputTokens, costCents);

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
