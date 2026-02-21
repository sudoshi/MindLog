// =============================================================================
// MindLog API — Rules Engine (BullMQ)
// Implements RULE-001 through RULE-008.
//
// ⚠  CLINICAL ADVISORY: All numeric thresholds here are provisional defaults.
//    They MUST be reviewed and signed off by a licensed mental health clinician
//    before any pilot deployment. See DECISIONS.md OQ-004.
//
// Job flow:
//   API route (daily entry submit) → rulesQueue.add() → Worker.process()
//   Nightly batch → rulesQueue.add() for every active patient → Worker.process()
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { ALERT_RULE_KEYS, ALERT_THRESHOLDS, type AlertRuleKey } from '@mindlog/shared';
import { sql } from '@mindlog/db';
import { config } from '../config.js';
import { publishAlert } from '../plugins/websocket.js';

// ---------------------------------------------------------------------------
// Queue — exported so API routes can enqueue jobs
// ---------------------------------------------------------------------------

export const RULES_QUEUE_NAME = 'mindlog:rules';

export const connection = {
  host: new URL(config.redisUrl).hostname,
  port: Number(new URL(config.redisUrl).port || 6379),
};

export const rulesQueue = new Queue(RULES_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export interface RulesJobData {
  patientId: string;
  orgId: string;
  entryDate: string; // ISO 8601 date YYYY-MM-DD
  triggeredBy: 'daily_entry' | 'nightly_batch';
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type AlertSeverity = 'info' | 'warning' | 'critical';

interface AlertCandidate {
  ruleKey: AlertRuleKey;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Deduplication: upsert clinical_alert only if no open alert exists for this rule
// Returns the new alertId, or null if suppressed as duplicate
// ---------------------------------------------------------------------------

async function upsertAlert(
  patientId: string,
  orgId: string,
  candidate: AlertCandidate,
): Promise<string | null> {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM clinical_alerts
    WHERE patient_id = ${patientId}
      AND rule_key   = ${candidate.ruleKey}
      AND status NOT IN ('resolved', 'auto_resolved')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existing) return null; // already open — suppress

  const [alert] = await sql<{ id: string }[]>`
    INSERT INTO clinical_alerts (patient_id, org_id, rule_key, severity, title, detail)
    VALUES (
      ${patientId}, ${orgId},
      ${candidate.ruleKey}, ${candidate.severity},
      ${candidate.title}, ${JSON.stringify(candidate.detail)}
    )
    RETURNING id
  `;

  return alert?.id ?? null;
}

// ===========================================================================
// RULE-001 — Mood decline
// 7-day rolling average drops WARNING_DELTA below 28-day baseline → WARNING
// 7-day rolling average drops CRITICAL_DELTA below 28-day baseline → CRITICAL
// ===========================================================================

async function evaluateMoodDecline(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  const [row] = await sql<{ avg_7d: string | null; avg_28d: string | null }[]>`
    SELECT
      AVG(mood_score) FILTER (
        WHERE entry_date > (${entryDate}::date - INTERVAL '7 days')
      )::numeric(4,2) AS avg_7d,
      AVG(mood_score) FILTER (
        WHERE entry_date > (${entryDate}::date - INTERVAL '28 days')
      )::numeric(4,2) AS avg_28d
    FROM daily_entries
    WHERE patient_id  = ${patientId}
      AND entry_date <= ${entryDate}::date
      AND mood_score IS NOT NULL
  `;

  if (!row || row.avg_7d === null || row.avg_28d === null) return null;

  const avg7 = Number(row.avg_7d);
  const avg28 = Number(row.avg_28d);
  const delta = avg28 - avg7; // positive means decline

  if (delta >= ALERT_THRESHOLDS.MOOD_DECLINE_CRITICAL_DELTA) {
    return {
      ruleKey: ALERT_RULE_KEYS.MOOD_DECLINE,
      severity: 'critical',
      title: 'Significant mood decline detected',
      detail: { avg_7d: avg7, avg_28d: avg28, delta },
    };
  }
  if (delta >= ALERT_THRESHOLDS.MOOD_DECLINE_WARNING_DELTA) {
    return {
      ruleKey: ALERT_RULE_KEYS.MOOD_DECLINE,
      severity: 'warning',
      title: 'Mood decline detected',
      detail: { avg_7d: avg7, avg_28d: avg28, delta },
    };
  }
  return null;
}

// ===========================================================================
// RULE-002 — Missed check-in
// Counts consecutive days without a *submitted* daily entry up to entryDate.
// >=CRITICAL_DAYS → CRITICAL, >=WARNING_DAYS → WARNING
// ===========================================================================

async function evaluateMissedCheckIn(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  // Walk back from yesterday; count days until we hit a submitted entry
  const [row] = await sql<{ consecutive_missed: number }[]>`
    WITH RECURSIVE counter AS (
      SELECT
        ${entryDate}::date - 1 AS check_date,
        0 AS missed
      UNION ALL
      SELECT
        c.check_date - 1,
        c.missed + 1
      FROM counter c
      WHERE c.missed < 14  -- cap at 14 to avoid runaway
        AND NOT EXISTS (
          SELECT 1 FROM daily_entries de
          WHERE de.patient_id   = ${patientId}
            AND de.entry_date   = c.check_date
            AND de.submitted_at IS NOT NULL
        )
    )
    SELECT MAX(missed)::int AS consecutive_missed FROM counter
  `;

  const missed = row?.consecutive_missed ?? 0;

  if (missed >= ALERT_THRESHOLDS.MISSED_CHECK_IN_CRITICAL_DAYS) {
    return {
      ruleKey: ALERT_RULE_KEYS.MISSED_CHECK_IN,
      severity: 'critical',
      title: `${missed} consecutive missed check-ins`,
      detail: { consecutive_missed: missed, as_of: entryDate },
    };
  }
  if (missed >= ALERT_THRESHOLDS.MISSED_CHECK_IN_WARNING_DAYS) {
    return {
      ruleKey: ALERT_RULE_KEYS.MISSED_CHECK_IN,
      severity: 'warning',
      title: `${missed} consecutive missed check-ins`,
      detail: { consecutive_missed: missed, as_of: entryDate },
    };
  }
  return null;
}

// ===========================================================================
// RULE-003 — Trigger escalation
// Any trigger rated >= TRIGGER_ESCALATION_SEVERITY for >= TRIGGER_ESCALATION_DAYS
// consecutive days → WARNING
// ===========================================================================

async function evaluateTriggerEscalation(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  const { TRIGGER_ESCALATION_SEVERITY, TRIGGER_ESCALATION_DAYS } = ALERT_THRESHOLDS;

  const rows = await sql<{ trigger_id: string; trigger_name: string; high_days: number }[]>`
    SELECT
      tl.trigger_id,
      MAX(tc.name)  AS trigger_name,
      COUNT(DISTINCT tl.entry_date)::int AS high_days
    FROM trigger_logs tl
    JOIN triggers tc ON tc.id = tl.trigger_id
    WHERE tl.patient_id  = ${patientId}
      AND tl.entry_date  > ${entryDate}::date - INTERVAL '${sql.unsafe(String(TRIGGER_ESCALATION_DAYS))} days'
      AND tl.entry_date <= ${entryDate}::date
      AND tl.severity   >= ${TRIGGER_ESCALATION_SEVERITY}
    GROUP BY tl.trigger_id
    HAVING COUNT(DISTINCT tl.entry_date) >= ${TRIGGER_ESCALATION_DAYS}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const top = rows[0]!;
  return {
    ruleKey: ALERT_RULE_KEYS.TRIGGER_ESCALATION,
    severity: 'warning',
    title: `High-severity trigger for ${top.high_days} days: ${top.trigger_name}`,
    detail: {
      trigger_id: top.trigger_id,
      trigger_name: top.trigger_name,
      high_days: top.high_days,
      threshold_severity: TRIGGER_ESCALATION_SEVERITY,
    },
  };
}

// ===========================================================================
// RULE-004 — Safety symptom
// DB trigger handle_safety_symptom() already created the clinical_alert + safety_event.
// This rule verifies the alert exists and publishes it over WebSocket immediately
// so clinicians receive real-time notification.
// ===========================================================================

async function evaluateSafetySymptom(
  patientId: string,
  orgId: string,
  entryDate: string,
): Promise<void> {
  const [alertRow] = await sql<{ id: string; title: string }[]>`
    SELECT id, title
    FROM clinical_alerts
    WHERE patient_id = ${patientId}
      AND severity   = 'critical'
      AND rule_key   = ${ALERT_RULE_KEYS.SAFETY_SYMPTOM}
      AND DATE(created_at AT TIME ZONE 'America/New_York') = ${entryDate}::date
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (alertRow) {
    await publishAlert(patientId, orgId, {
      alertId: alertRow.id,
      severity: 'critical',
      title: alertRow.title,
      ruleKey: ALERT_RULE_KEYS.SAFETY_SYMPTOM,
      patientId,
    });
  }
}

// ===========================================================================
// RULE-005 — Medication adherence
// medication_logs.taken = FALSE for >= 3 consecutive days → WARNING
// ===========================================================================

async function evaluateMedicationAdherence(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  const MISSED_THRESHOLD = 3;

  const [row] = await sql<{ missed_days: number; med_name: string | null }[]>`
    SELECT
      COUNT(DISTINCT ml.logged_date)::int AS missed_days,
      MAX(m.name)                          AS med_name
    FROM medication_logs ml
    JOIN medications m ON m.id = ml.medication_id
    WHERE m.patient_id   = ${patientId}
      AND ml.logged_date > ${entryDate}::date - INTERVAL '${sql.unsafe(String(MISSED_THRESHOLD + 1))} days'
      AND ml.logged_date <= ${entryDate}::date
      AND ml.taken        = FALSE
      AND m.is_active     = TRUE
  `;

  if ((row?.missed_days ?? 0) >= MISSED_THRESHOLD) {
    return {
      ruleKey: ALERT_RULE_KEYS.MEDICATION_ADHERENCE,
      severity: 'warning',
      title: `Medication not taken for ${row!.missed_days} days`,
      detail: { missed_days: row!.missed_days, med_name: row!.med_name },
    };
  }
  return null;
}

// ===========================================================================
// RULE-006 — Sleep disruption
// Average sleep < 5 h for >= 5 consecutive days → WARNING
// ===========================================================================

async function evaluateSleepDisruption(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  const LOOKBACK_DAYS = 5;
  const MIN_HOURS = 5;

  const [row] = await sql<{ poor_days: number; avg_hours: string | null }[]>`
    SELECT
      COUNT(*)::int                               AS poor_days,
      AVG(sl.hours + sl.minutes / 60.0)::numeric(4,2) AS avg_hours
    FROM sleep_logs sl
    WHERE sl.patient_id  = ${patientId}
      AND sl.entry_date  > ${entryDate}::date - INTERVAL '${sql.unsafe(String(LOOKBACK_DAYS))} days'
      AND sl.entry_date <= ${entryDate}::date
      AND (sl.hours + sl.minutes / 60.0) < ${MIN_HOURS}
  `;

  if ((row?.poor_days ?? 0) >= LOOKBACK_DAYS) {
    return {
      ruleKey: ALERT_RULE_KEYS.SLEEP_DISRUPTION,
      severity: 'warning',
      title: `Poor sleep for ${LOOKBACK_DAYS} consecutive days`,
      detail: { poor_days: row!.poor_days, avg_hours: Number(row!.avg_hours), threshold_hours: MIN_HOURS },
    };
  }
  return null;
}

// ===========================================================================
// RULE-007 — Exercise decline
// No exercise logged across >= 7 submitted entries → INFO
// ===========================================================================

async function evaluateExerciseDecline(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  const LOOKBACK_DAYS = 7;

  const [row] = await sql<{ inactive_days: number }[]>`
    SELECT COUNT(*)::int AS inactive_days
    FROM daily_entries de
    LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
    WHERE de.patient_id   = ${patientId}
      AND de.entry_date   > ${entryDate}::date - INTERVAL '${sql.unsafe(String(LOOKBACK_DAYS))} days'
      AND de.entry_date  <= ${entryDate}::date
      AND de.submitted_at IS NOT NULL
      AND (el.duration_minutes IS NULL OR el.duration_minutes = 0)
  `;

  if ((row?.inactive_days ?? 0) >= LOOKBACK_DAYS) {
    return {
      ruleKey: ALERT_RULE_KEYS.EXERCISE_DECLINE,
      severity: 'info',
      title: `No exercise logged in ${LOOKBACK_DAYS} days`,
      detail: { inactive_days: row!.inactive_days },
    };
  }
  return null;
}

// ===========================================================================
// RULE-008 — Journal sentiment (AI-assisted, compliance-gated)
// Only runs if AI_INSIGHTS_ENABLED=true AND ANTHROPIC_BAA_SIGNED=true.
// Calls claude-sonnet to detect concerning or crisis-level language.
// ===========================================================================

async function evaluateJournalSentiment(
  patientId: string,
  _orgId: string,
  entryDate: string,
): Promise<AlertCandidate | null> {
  if (!config.aiInsightsEnabled || !config.anthropicBaaSigned) return null;

  const entries = await sql<{ body: string }[]>`
    SELECT je.body
    FROM journal_entries je
    JOIN daily_entries de ON de.id = je.daily_entry_id
    WHERE de.patient_id  = ${patientId}
      AND de.entry_date <= ${entryDate}::date
    ORDER BY de.entry_date DESC
    LIMIT 3
  `;

  if (entries.length === 0) return null;

  const combinedText = entries.map((e) => e.body).join('\n\n---\n\n');

  // Dynamic import — keeps SDK out of the bundle when AI is disabled
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  let analysis: { sentiment: string; crisis_indicators: boolean; summary: string };
  try {
    const message = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are a mental health clinical assistant. Analyze the following journal entries and respond ONLY with valid JSON (no markdown, no explanation).

Journal entries (most recent first):
<entries>
${combinedText}
</entries>

Respond with:
{
  "sentiment": "positive" | "neutral" | "negative" | "concerning",
  "crisis_indicators": true | false,
  "summary": "<clinical one-sentence summary, max 20 words>"
}

"concerning" = hopelessness, worthlessness, or passive SI language.
"crisis_indicators" = true ONLY for explicit active suicidal ideation.`,
        },
      ],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';
    analysis = JSON.parse(text) as typeof analysis;
  } catch {
    return null; // malformed response or API error — skip silently
  }

  if (analysis.crisis_indicators) {
    return {
      ruleKey: ALERT_RULE_KEYS.JOURNAL_SENTIMENT,
      severity: 'critical',
      title: 'Journal: crisis indicators detected',
      detail: { sentiment: analysis.sentiment, summary: analysis.summary, model: config.anthropicModel },
    };
  }
  if (analysis.sentiment === 'concerning') {
    return {
      ruleKey: ALERT_RULE_KEYS.JOURNAL_SENTIMENT,
      severity: 'warning',
      title: 'Journal: concerning sentiment detected',
      detail: { sentiment: analysis.sentiment, summary: analysis.summary, model: config.anthropicModel },
    };
  }
  return null;
}

// ===========================================================================
// Master evaluator — runs all rules, upserts alerts, broadcasts over WS
// ===========================================================================

async function evaluateAllRules(job: { data: RulesJobData }): Promise<void> {
  const { patientId, orgId, entryDate } = job.data;

  // Safety symptom is handled by DB trigger; just verify + broadcast in real-time
  await evaluateSafetySymptom(patientId, orgId, entryDate);

  // All other rules evaluated in parallel
  const candidates = (await Promise.all([
    evaluateMoodDecline(patientId, orgId, entryDate),
    evaluateMissedCheckIn(patientId, orgId, entryDate),
    evaluateTriggerEscalation(patientId, orgId, entryDate),
    evaluateMedicationAdherence(patientId, orgId, entryDate),
    evaluateSleepDisruption(patientId, orgId, entryDate),
    evaluateExerciseDecline(patientId, orgId, entryDate),
    evaluateJournalSentiment(patientId, orgId, entryDate),
  ])).filter((c): c is AlertCandidate => c !== null);

  // Upsert each alert and broadcast if newly created
  await Promise.all(
    candidates.map(async (candidate) => {
      const alertId = await upsertAlert(patientId, orgId, candidate);
      if (alertId) {
        await publishAlert(patientId, orgId, {
          alertId,
          severity: candidate.severity,
          title: candidate.title,
          ruleKey: candidate.ruleKey,
          patientId,
        });
      }
    }),
  );
}

// ===========================================================================
// Worker factory — call from the dedicated worker.ts entrypoint
// ===========================================================================

export function startRulesWorker(): Worker<RulesJobData> {
  const worker = new Worker<RulesJobData>(
    RULES_QUEUE_NAME,
    evaluateAllRules,
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    console.info(`[rules] ✓ job ${job.id} — patient ${job.data.patientId} / ${job.data.entryDate}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[rules] ✗ job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
