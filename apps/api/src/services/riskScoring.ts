// =============================================================================
// MindLog API — Rule-Based Risk Scoring Service
//
// Computes a composite clinical risk score (0–100) for a patient using
// seven deterministic rules.  The score is intentionally rule-based (not AI)
// so it is auditable, reproducible, and does not require a BAA.
//
// ⚠  CLINICAL ADVISORY
//    These thresholds are provisional defaults.  They MUST be reviewed and
//    signed off by a licensed clinician before any pilot deployment.
//    See DECISIONS.md OQ-004.
//
// Scoring bands:
//   0–24   Low      (green)
//  25–49   Moderate (yellow)
//  50–74   High     (orange)
//  75–100  Critical (red)
// =============================================================================

import { sql } from '@mindlog/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskFactor {
  rule:    string;   // e.g. 'CSSRS_HIGH'
  label:   string;   // human-readable label for clinician UI
  weight:  number;   // maximum contribution to score (0–100 sum ≤ 100)
  fired:   boolean;  // whether this factor contributed
  value:   unknown;  // the raw value that caused it to fire (for tooltips)
}

export interface RiskScoreResult {
  score:             number;        // 0–100
  band:              'low' | 'moderate' | 'high' | 'critical';
  factors:           RiskFactor[];
  computed_at:       string;        // ISO 8601
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function scoreToBand(score: number): RiskScoreResult['band'] {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// ---------------------------------------------------------------------------
// Individual rule evaluators
// ---------------------------------------------------------------------------

/** RULE-R01: C-SSRS active suicidal ideation in last 14 days — weight 35 */
async function evalCSSRS(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 35;
  const [row] = await sql<{ max_score: number | null }[]>`
    SELECT MAX(score)::int AS max_score
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'C-SSRS'
      AND completed_at >= ${since}::date
  `;
  const maxScore = row?.max_score ?? 0;
  const fired = maxScore >= 2;
  return {
    rule:   'CSSRS_HIGH',
    label:  'C-SSRS score ≥ 2 (last 14 days)',
    weight: WEIGHT,
    fired,
    value:  maxScore,
  };
}

/** RULE-R02: PHQ-9 severe (≥ 20) in last 30 days — weight 20 */
async function evalPHQ9(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 20;
  const [row] = await sql<{ max_score: number | null }[]>`
    SELECT MAX(score)::int AS max_score
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'PHQ-9'
      AND completed_at >= ${since}::date
  `;
  const maxScore = row?.max_score ?? 0;
  const fired = maxScore >= 20;
  return {
    rule:   'PHQ9_SEVERE',
    label:  'PHQ-9 ≥ 20 (severe, last 30 days)',
    weight: WEIGHT,
    fired,
    value:  maxScore,
  };
}

/** RULE-R03: Mood ≤ 3 on 3+ of last 5 submitted check-ins — weight 15 */
async function evalLowMoodStreak(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 15;
  const [row] = await sql<{ low_days: number }[]>`
    SELECT COUNT(*)::int AS low_days
    FROM (
      SELECT mood
      FROM daily_entries
      WHERE patient_id   = ${patientId}
        AND entry_date  >= ${since}::date
        AND submitted_at IS NOT NULL
        AND mood IS NOT NULL
      ORDER BY entry_date DESC
      LIMIT 5
    ) recent
    WHERE mood <= 3
  `;
  const lowDays = row?.low_days ?? 0;
  const fired = lowDays >= 3;
  return {
    rule:   'LOW_MOOD_STREAK',
    label:  'Mood ≤ 3 on 3+ of last 5 check-ins',
    weight: WEIGHT,
    fired,
    value:  lowDays,
  };
}

/** RULE-R04: Missed ≥ 5 check-ins in last 14 days — weight 10 */
async function evalMissedCheckIns(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 10;
  const [row] = await sql<{ missed: number }[]>`
    SELECT (14 - COUNT(DISTINCT entry_date))::int AS missed
    FROM daily_entries
    WHERE patient_id   = ${patientId}
      AND entry_date  >= ${since}::date
      AND submitted_at IS NOT NULL
  `;
  const missed = Math.max(0, row?.missed ?? 14);
  const fired = missed >= 5;
  return {
    rule:   'MISSED_CHECKINS',
    label:  '≥ 5 missed check-ins (last 14 days)',
    weight: WEIGHT,
    fired,
    value:  missed,
  };
}

/** RULE-R05: ASRM ≥ 6 (mania screen) in last 14 days — weight 10 */
async function evalASRM(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 10;
  const [row] = await sql<{ max_score: number | null }[]>`
    SELECT MAX(score)::int AS max_score
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'ASRM'
      AND completed_at >= ${since}::date
  `;
  const maxScore = row?.max_score ?? 0;
  const fired = maxScore >= 6;
  return {
    rule:   'ASRM_ELEVATED',
    label:  'ASRM ≥ 6 (mania screen, last 14 days)',
    weight: WEIGHT,
    fired,
    value:  maxScore,
  };
}

/** RULE-R06: Medication non-adherence ≥ 3 days in last 7 — weight 5 */
async function evalMedNonadherence(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 5;
  const [row] = await sql<{ missed_days: number }[]>`
    SELECT COUNT(DISTINCT mal.entry_date)::int AS missed_days
    FROM medication_adherence_logs mal
    JOIN patient_medications pm ON pm.id = mal.patient_medication_id
    WHERE pm.patient_id       = ${patientId}
      AND pm.discontinued_at IS NULL
      AND pm.show_in_app      = TRUE
      AND mal.entry_date     >= ${since}::date
      AND mal.taken           = FALSE
  `;
  const missed = row?.missed_days ?? 0;
  const fired = missed >= 3;
  return {
    rule:   'MED_NONADHERENCE',
    label:  'Medication not taken ≥ 3 days (last 7 days)',
    weight: WEIGHT,
    fired,
    value:  missed,
  };
}

/** RULE-R07: Social avoidance + anhedonia symptoms both present — weight 5 */
async function evalSocialAvoidanceAnhedonia(
  patientId: string,
  since: string,
): Promise<RiskFactor> {
  const WEIGHT = 5;
  const rows = await sql<{ name: string }[]>`
    SELECT LOWER(sc.name) AS name
    FROM symptom_logs sl
    JOIN symptom_catalogue sc ON sc.id = sl.symptom_id
    JOIN daily_entries de ON de.id = sl.daily_entry_id
    WHERE sl.patient_id  = ${patientId}
      AND de.entry_date >= ${since}::date
      AND sl.is_present  = TRUE
      AND (
        LOWER(sc.name) LIKE '%social avoidance%'
        OR LOWER(sc.name) LIKE '%anhedonia%'
        OR LOWER(sc.name) LIKE '%loss of interest%'
        OR LOWER(sc.name) LIKE '%withdrawal%'
      )
    GROUP BY LOWER(sc.name)
  `;
  const names = rows.map((r) => r.name);
  const hasSocial   = names.some((n) => n.includes('social') || n.includes('withdrawal'));
  const hasAnhedonia = names.some((n) => n.includes('anhedonia') || n.includes('interest'));
  const fired = hasSocial && hasAnhedonia;
  return {
    rule:   'SOCIAL_ANHEDONIA',
    label:  'Social avoidance + anhedonia both present',
    weight: WEIGHT,
    fired,
    value:  names,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a composite risk score for `patientId` and return the full
 * breakdown.  Designed to be called from the AI insights worker and the
 * nightly scheduler.
 */
export async function computeRiskScore(patientId: string): Promise<RiskScoreResult> {
  const now = new Date();
  const since14d = new Date(now.getTime() - 14 * 86400_000).toISOString().split('T')[0]!;
  const since30d = new Date(now.getTime() - 30 * 86400_000).toISOString().split('T')[0]!;
  const since7d  = new Date(now.getTime() -  7 * 86400_000).toISOString().split('T')[0]!;
  const since5d  = new Date(now.getTime() -  5 * 86400_000).toISOString().split('T')[0]!;

  const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
    evalCSSRS(patientId, since14d),
    evalPHQ9(patientId, since30d),
    evalLowMoodStreak(patientId, since5d),
    evalMissedCheckIns(patientId, since14d),
    evalASRM(patientId, since14d),
    evalMedNonadherence(patientId, since7d),
    evalSocialAvoidanceAnhedonia(patientId, since14d),
  ]);

  const factors: RiskFactor[] = [r1, r2, r3, r4, r5, r6, r7];
  const score = Math.min(
    100,
    factors.filter((f) => f.fired).reduce((sum, f) => sum + f.weight, 0),
  );

  return {
    score,
    band:        scoreToBand(score),
    factors,
    computed_at: now.toISOString(),
  };
}

/**
 * Persist the risk score to `patients.risk_score` and `patients.risk_score_factors`.
 */
export async function persistRiskScore(
  patientId: string,
  result: RiskScoreResult,
): Promise<void> {
  await sql`
    UPDATE patients
    SET risk_score            = ${result.score},
        risk_score_factors    = ${JSON.stringify(result.factors)}::JSONB,
        risk_score_updated_at = ${result.computed_at}
    WHERE id = ${patientId}
  `;
}
