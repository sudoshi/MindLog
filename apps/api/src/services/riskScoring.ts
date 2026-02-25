// =============================================================================
// MindLog API — Evidence-Based Graduated Risk Scoring Service
//
// Computes a composite clinical risk score (0–100) for a patient using
// ten graduated rules grounded in the latest psychiatric literature.
//
// Literature basis:
//   R01  C-SSRS — OR 1.5–6.9 per ideation level (Columbia validation)
//   R02  PHQ-9  — MCID 5 pts; exponential decay model (Jacobson-Truax)
//   R03  Mood streak — digital phenotyping evidence
//   R04  Engagement — post-discharge disengagement as highest risk window
//   R05  ASRM — sensitivity 85.5% at cutoff 6 (Altman validation)
//   R06  Medication — AOR 3.09 for relapse (non-adherence meta-analysis)
//   R07  Social withdrawal — dose-response with SI (MDD studies)
//   R08  Sleep disruption — OR 2.10–3.0 for SI/attempt (meta-analysis)
//   R09  GAD-7 anxiety — comorbid anxiety amplifies depression risk
//   R10  PHQ-9 Item 9 — direct SI screening question
//
// Over-allocation design: max possible = 132, capped at 100.
// This ensures patients with multiple co-occurring risks are appropriately
// flagged at the critical level.
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

export type RiskDomain = 'safety' | 'mood' | 'engagement' | 'physical' | 'medication';

export interface RiskFactor {
  rule:         string;       // e.g. 'CSSRS_GRADUATED'
  label:        string;       // human-readable label for clinician UI
  domain:       RiskDomain;   // grouping domain for UI
  weight:       number;       // maximum contribution to score
  contribution: number;       // actual graduated contribution (0 to weight)
  fired:        boolean;      // backward compat: true if contribution > 0
  value:        unknown;      // raw data that drove the score (for tooltips)
  detail:       string;       // human-readable explanation of graduation
}

export interface RiskScoreResult {
  score:        number;       // 0–100 (capped)
  raw_score:    number;       // uncapped sum of contributions
  band:         'low' | 'moderate' | 'high' | 'critical';
  factors:      RiskFactor[];
  computed_at:  string;       // ISO 8601
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scoreToBand(score: number): RiskScoreResult['band'] {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / 86400_000));
}

// ---------------------------------------------------------------------------
// R01 — C-SSRS Suicidal Ideation (graduated + recency decay) — max 35
//
// Evidence: OR 1.5 per ideation level; OR 6.9 for suicidal behavior.
// Levels 4–5 (intent ± plan) had significantly higher odds of attempt.
// Recency decay: ideation reported recently is more clinically urgent.
// ---------------------------------------------------------------------------

async function evalCSSRS_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 35;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]!;

  // Get max C-SSRS score and most recent date from validated assessments
  const [assessRow] = await sql<{ max_score: number | null; latest_date: string | null }[]>`
    SELECT MAX(score)::int AS max_score,
           MAX(completed_at)::text AS latest_date
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'C-SSRS'
      AND completed_at >= ${since}::date
  `;

  // Also check daily_entries suicidal_ideation (0–3 graded)
  const [dailyRow] = await sql<{ max_si: number | null; latest_date: string | null }[]>`
    SELECT MAX(suicidal_ideation)::int AS max_si,
           MAX(entry_date)::text AS latest_date
    FROM daily_entries
    WHERE patient_id    = ${patientId}
      AND entry_date   >= ${since}::date
      AND submitted_at IS NOT NULL
      AND suicidal_ideation IS NOT NULL
      AND suicidal_ideation > 0
  `;

  // Use whichever source has the higher score
  const assessScore = assessRow?.max_score ?? 0;
  const dailySI = dailyRow?.max_si ?? 0;
  const maxLevel = Math.max(assessScore, dailySI);
  const latestDateStr = assessScore >= dailySI
    ? assessRow?.latest_date
    : dailyRow?.latest_date;

  // Graduated by level
  let baseContribution = 0;
  if (maxLevel >= 4)      baseContribution = 35;
  else if (maxLevel >= 3) baseContribution = 25;
  else if (maxLevel >= 1) baseContribution = 10;

  // Recency decay
  let recencyMultiplier = 0.4; // > 14 days
  if (latestDateStr) {
    const daysAgo = daysBetween(new Date(), new Date(latestDateStr));
    if (daysAgo <= 2)       recencyMultiplier = 1.0;
    else if (daysAgo <= 7)  recencyMultiplier = 0.8;
    else if (daysAgo <= 14) recencyMultiplier = 0.6;
  }

  const contribution = Math.round(baseContribution * recencyMultiplier);
  const levelLabel = maxLevel >= 4 ? 'intent/plan' : maxLevel >= 3 ? 'method identified'
    : maxLevel >= 1 ? 'passive ideation' : 'none';

  return {
    rule:         'CSSRS_GRADUATED',
    label:        'Suicidal ideation (C-SSRS)',
    domain:       'safety',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { level: maxLevel, daysAgo: latestDateStr ? daysBetween(new Date(), new Date(latestDateStr)) : null },
    detail:       maxLevel > 0
      ? `C-SSRS level ${maxLevel} (${levelLabel}) reported ${latestDateStr ? daysBetween(new Date(), new Date(latestDateStr)) + 'd ago' : 'recently'}`
      : 'No suicidal ideation reported in 30 days',
  };
}

// ---------------------------------------------------------------------------
// R02 — PHQ-9 Severity + Trajectory — max 20
//
// Evidence: MCID 5 points (Jacobson-Truax). Exponential decay model shows
// largest improvements in first 2 weeks; failure to improve by week 4
// predicts treatment non-response.
// ---------------------------------------------------------------------------

async function evalPHQ9_Trajectory(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 20;
  const rows = await sql<{ score: number; completed_at: string }[]>`
    SELECT score::int, completed_at::text
    FROM validated_assessments
    WHERE patient_id = ${patientId}
      AND scale      = 'PHQ-9'
    ORDER BY completed_at DESC
    LIMIT 2
  `;

  const latest = rows[0]?.score ?? 0;
  const prior  = rows[1]?.score ?? null;

  // Graduated severity
  let severityContribution = 0;
  if (latest >= 20)      severityContribution = 15;
  else if (latest >= 15) severityContribution = 10;
  else if (latest >= 10) severityContribution = 5;

  // Trajectory bonus: reliable deterioration (≥5 point increase)
  let trajectoryBonus = 0;
  if (prior !== null && latest - prior >= 5) {
    trajectoryBonus = 5;
  }

  const contribution = Math.min(WEIGHT, severityContribution + trajectoryBonus);
  const severityLabel = latest >= 20 ? 'severe' : latest >= 15 ? 'moderately severe'
    : latest >= 10 ? 'moderate' : 'mild/minimal';

  return {
    rule:         'PHQ9_TRAJECTORY',
    label:        'Depression severity (PHQ-9)',
    domain:       'mood',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { latest, prior, delta: prior !== null ? latest - prior : null },
    detail:       latest >= 10
      ? `PHQ-9 at ${latest} (${severityLabel})${trajectoryBonus > 0 ? `, increased ${latest - prior!} pts from prior` : ''}`
      : `PHQ-9 at ${latest} (${severityLabel})`,
  };
}

// ---------------------------------------------------------------------------
// R03 — Low Mood Streak (graduated by streak length) — max 15
//
// Evidence: digital phenotyping — sustained low mood is a stronger signal
// of clinical deterioration than single-day dips.
// ---------------------------------------------------------------------------

async function evalLowMoodStreak_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 15;

  // Get last 14 daily entries to compute consecutive low-mood streak
  const rows = await sql<{ mood: number; entry_date: string }[]>`
    SELECT mood::int, entry_date::text
    FROM daily_entries
    WHERE patient_id   = ${patientId}
      AND submitted_at IS NOT NULL
      AND mood IS NOT NULL
    ORDER BY entry_date DESC
    LIMIT 14
  `;

  // Count consecutive days with mood <= 3 from most recent
  let streak = 0;
  for (const row of rows) {
    if (row.mood <= 3) streak++;
    else break;
  }

  // Graduated contribution
  let contribution = 0;
  if (streak >= 7)      contribution = 15;
  else if (streak >= 5) contribution = 13;
  else if (streak >= 3) contribution = 10;

  return {
    rule:         'LOW_MOOD_STREAK',
    label:        'Sustained low mood',
    domain:       'mood',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { streak, recentMoods: rows.slice(0, 5).map(r => r.mood) },
    detail:       streak >= 3
      ? `Mood ≤ 3 for ${streak} consecutive days`
      : `No sustained low mood streak (current: ${streak} days)`,
  };
}

// ---------------------------------------------------------------------------
// R04 — Engagement / Missed Check-ins (graduated + trend) — max 12
//
// Evidence: post-discharge suicide risk is highest in the first week;
// disengagement from care is itself a warning signal.
// ---------------------------------------------------------------------------

async function evalEngagement_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 12;
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString().split('T')[0]!;
  const since7d  = new Date(Date.now() -  7 * 86400_000).toISOString().split('T')[0]!;

  // Check-ins in last 14 days and last 7 days for trend
  const [total14] = await sql<{ cnt: number }[]>`
    SELECT COUNT(DISTINCT entry_date)::int AS cnt
    FROM daily_entries
    WHERE patient_id = ${patientId}
      AND entry_date >= ${since14d}::date
      AND submitted_at IS NOT NULL
  `;
  const [total7] = await sql<{ cnt: number }[]>`
    SELECT COUNT(DISTINCT entry_date)::int AS cnt
    FROM daily_entries
    WHERE patient_id = ${patientId}
      AND entry_date >= ${since7d}::date
      AND submitted_at IS NOT NULL
  `;

  const missed14 = Math.max(0, 14 - (total14?.cnt ?? 0));
  const checkins7 = total7?.cnt ?? 0;
  const checkinsPrior7 = (total14?.cnt ?? 0) - checkins7;

  // Graduated base
  let baseContribution = 0;
  if (missed14 >= 5)      baseContribution = 10;
  else if (missed14 >= 3) baseContribution = 5;

  // Declining trend bonus: fewer check-ins this week vs prior week
  let trendBonus = 0;
  if (checkins7 < checkinsPrior7 && checkinsPrior7 > 0) {
    trendBonus = 2;
  }

  const contribution = Math.min(WEIGHT, baseContribution + trendBonus);

  return {
    rule:         'ENGAGEMENT_DECLINE',
    label:        'Missed check-ins',
    domain:       'engagement',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { missed14, checkins7, checkinsPrior7 },
    detail:       missed14 >= 3
      ? `${missed14} check-ins missed in 14 days${trendBonus > 0 ? ', declining trend' : ''}`
      : `${missed14} missed (engagement on track)`,
  };
}

// ---------------------------------------------------------------------------
// R05 — ASRM Mania Screen (graduated) — max 10
//
// Evidence: sensitivity 85.5%, specificity 87.3% at cutoff ≥ 6.
// Score ≥ 14 indicates likely manic episode.
// ---------------------------------------------------------------------------

async function evalASRM_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 10;
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().split('T')[0]!;

  const [row] = await sql<{ max_score: number | null }[]>`
    SELECT MAX(score)::int AS max_score
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'ASRM'
      AND completed_at >= ${since}::date
  `;
  const maxScore = row?.max_score ?? 0;

  let contribution = 0;
  if (maxScore >= 14)      contribution = 10;
  else if (maxScore >= 10) contribution = 8;
  else if (maxScore >= 6)  contribution = 5;

  const levelLabel = maxScore >= 14 ? 'manic' : maxScore >= 10 ? 'elevated'
    : maxScore >= 6 ? 'hypomanic screen' : 'normal';

  return {
    rule:         'ASRM_GRADUATED',
    label:        'Mania screen (ASRM)',
    domain:       'mood',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        maxScore,
    detail:       maxScore >= 6
      ? `ASRM score ${maxScore} (${levelLabel})`
      : `ASRM score ${maxScore} (below threshold)`,
  };
}

// ---------------------------------------------------------------------------
// R06 — Medication Non-Adherence (graduated + streak) — max 10
//
// Evidence: AOR 3.09 for psychiatric relapse when non-adherent.
// Consecutive missed days (effective discontinuation) is higher risk
// than intermittent misses.
// ---------------------------------------------------------------------------

async function evalMedAdherence_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 10;
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString().split('T')[0]!;

  // Total missed days and max consecutive missed streak
  const rows = await sql<{ entry_date: string; taken: boolean }[]>`
    SELECT mal.entry_date::text, mal.taken
    FROM medication_adherence_logs mal
    JOIN patient_medications pm ON pm.id = mal.patient_medication_id
    WHERE pm.patient_id       = ${patientId}
      AND pm.discontinued_at IS NULL
      AND pm.show_in_app      = TRUE
      AND mal.entry_date     >= ${since14d}::date
    ORDER BY mal.entry_date DESC
  `;

  // Count missed days (distinct dates where any med was not taken)
  const missedDates = new Set<string>();
  for (const r of rows) {
    if (!r.taken) missedDates.add(r.entry_date);
  }
  const missedDays = missedDates.size;

  // Compute max consecutive missed streak
  const sortedDates = [...missedDates].sort().reverse();
  let maxStreak = 0;
  let currentStreak = 0;
  let lastDate: Date | null = null;
  for (const dateStr of sortedDates) {
    const d = new Date(dateStr);
    if (lastDate && daysBetween(lastDate, d) === 1) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
    lastDate = d;
  }

  // Graduated base
  let baseContribution = 0;
  if (missedDays >= 5)      baseContribution = 8;
  else if (missedDays >= 3) baseContribution = 5;
  else if (missedDays >= 2) baseContribution = 2;

  // Consecutive streak bonus
  let streakBonus = 0;
  if (maxStreak >= 3) streakBonus = 2;

  const contribution = Math.min(WEIGHT, baseContribution + streakBonus);

  return {
    rule:         'MED_NONADHERENCE',
    label:        'Medication non-adherence',
    domain:       'medication',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { missedDays, maxStreak },
    detail:       missedDays >= 2
      ? `${missedDays} days non-adherent in 14 days${maxStreak >= 3 ? `, ${maxStreak}-day consecutive streak` : ''}`
      : 'Medication adherence on track',
  };
}

// ---------------------------------------------------------------------------
// R07 — Social Withdrawal (graduated + acute onset) — max 8
//
// Evidence: dose-response relationship between social withdrawal frequency
// and suicidal ideation (p-trend < 0.001). Acute withdrawal (sudden onset)
// is a stronger prodromal signal than chronic baseline isolation.
// ---------------------------------------------------------------------------

async function evalSocialWithdrawal_Graduated(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 8;
  const since7d  = new Date(Date.now() -  7 * 86400_000).toISOString().split('T')[0]!;
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString().split('T')[0]!;

  // Check social_avoidance from daily_entries (last 7 days)
  const [avoidanceRow] = await sql<{ avoidance_days: number; total_days: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE social_avoidance = TRUE)::int AS avoidance_days,
      COUNT(*)::int AS total_days
    FROM daily_entries
    WHERE patient_id   = ${patientId}
      AND entry_date  >= ${since7d}::date
      AND submitted_at IS NOT NULL
  `;

  // Check for anhedonia symptoms
  const [anhedoniaRow] = await sql<{ has_anhedonia: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM symptom_logs sl
      JOIN symptom_catalogue sc ON sc.id = sl.symptom_id
      JOIN daily_entries de ON de.id = sl.daily_entry_id
      WHERE sl.patient_id  = ${patientId}
        AND de.entry_date >= ${since14d}::date
        AND sl.is_present  = TRUE
        AND (LOWER(sc.name) LIKE '%anhedonia%' OR LOWER(sc.name) LIKE '%loss of interest%')
    ) AS has_anhedonia
  `;

  const avoidanceDays = avoidanceRow?.avoidance_days ?? 0;
  const hasAnhedonia = anhedoniaRow?.has_anhedonia ?? false;

  // Graduated: acute onset (5+/7 days) > avoidance + anhedonia > avoidance alone
  let contribution = 0;
  if (avoidanceDays >= 5)                 contribution = 8;  // acute onset
  else if (avoidanceDays >= 1 && hasAnhedonia) contribution = 5;  // avoidance + anhedonia
  else if (avoidanceDays >= 1)            contribution = 3;  // avoidance alone

  return {
    rule:         'SOCIAL_WITHDRAWAL',
    label:        'Social withdrawal',
    domain:       'engagement',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { avoidanceDays, hasAnhedonia },
    detail:       avoidanceDays >= 1
      ? `Social avoidance on ${avoidanceDays}/7 days${hasAnhedonia ? ', anhedonia present' : ''}`
      : 'No social withdrawal signals',
  };
}

// ---------------------------------------------------------------------------
// R08 — Sleep Disruption (NEW) — max 7
//
// Evidence: OR 2.10 for suicidal ideation with insomnia; OR 3.0 for
// suicide attempt with sleep disturbances. Sleep disruption is a
// transdiagnostic risk factor across mood, anxiety, and psychotic disorders.
// ---------------------------------------------------------------------------

async function evalSleepDisruption(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 7;
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0]!;

  const rows = await sql<{ total_minutes: number | null; quality: number | null }[]>`
    SELECT sl.total_minutes, sl.quality
    FROM sleep_logs sl
    WHERE sl.patient_id = ${patientId}
      AND sl.entry_date >= ${since7d}::date
  `;

  if (rows.length === 0) {
    return {
      rule: 'SLEEP_DISRUPTION', label: 'Sleep disruption', domain: 'physical',
      weight: WEIGHT, contribution: 0, fired: false,
      value: { dataPoints: 0 },
      detail: 'No sleep data in last 7 days',
    };
  }

  // Short sleep: < 5 hours (300 min) on 3+ nights
  const shortNights = rows.filter(r => r.total_minutes !== null && r.total_minutes < 300).length;
  const shortContribution = shortNights >= 3 ? 4 : 0;

  // Poor quality: quality ≤ 2 on 4+ nights
  const poorNights = rows.filter(r => r.quality !== null && r.quality <= 2).length;
  const qualityContribution = poorNights >= 4 ? 3 : 0;

  const contribution = Math.min(WEIGHT, shortContribution + qualityContribution);

  return {
    rule:         'SLEEP_DISRUPTION',
    label:        'Sleep disruption',
    domain:       'physical',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { shortNights, poorNights, totalNights: rows.length },
    detail:       contribution > 0
      ? `Short sleep (<5h) ${shortNights}/7 nights, poor quality ${poorNights}/7 nights`
      : `Sleep within normal range (${rows.length} nights recorded)`,
  };
}

// ---------------------------------------------------------------------------
// R09 — GAD-7 Anxiety Trajectory (NEW) — max 7
//
// Evidence: comorbid anxiety amplifies depression severity, suicidal
// ideation, and treatment resistance. MCID = 4 points.
// ---------------------------------------------------------------------------

async function evalGAD7_Trajectory(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 7;
  const rows = await sql<{ score: number }[]>`
    SELECT score::int
    FROM validated_assessments
    WHERE patient_id = ${patientId}
      AND scale      = 'GAD-7'
    ORDER BY completed_at DESC
    LIMIT 2
  `;

  const latest = rows[0]?.score ?? 0;
  const prior  = rows[1]?.score ?? null;

  // Graduated severity
  let severityContribution = 0;
  if (latest >= 15)      severityContribution = 5;
  else if (latest >= 10) severityContribution = 3;

  // Trajectory bonus: deterioration ≥ 5 points
  let trajectoryBonus = 0;
  if (prior !== null && latest - prior >= 5) {
    trajectoryBonus = 2;
  }

  const contribution = Math.min(WEIGHT, severityContribution + trajectoryBonus);

  return {
    rule:         'GAD7_TRAJECTORY',
    label:        'Anxiety severity (GAD-7)',
    domain:       'mood',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { latest, prior, delta: prior !== null ? latest - prior : null },
    detail:       latest >= 10
      ? `GAD-7 at ${latest}${trajectoryBonus > 0 ? `, increased ${latest - prior!} pts` : ''}`
      : `GAD-7 at ${latest} (below threshold)`,
  };
}

// ---------------------------------------------------------------------------
// R10 — PHQ-9 Item 9 SI Screen (NEW) — max 8
//
// Evidence: PHQ-9 item 9 ("Thoughts that you would be better off dead,
// or of hurting yourself") is an independent SI screen, validated as
// a standalone risk indicator across multiple studies.
// ---------------------------------------------------------------------------

async function evalPHQ9Item9(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 8;
  const since90d = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]!;

  const [row] = await sql<{ item9: string | null; completed_at: string | null }[]>`
    SELECT item_responses->>'q9' AS item9,
           completed_at::text
    FROM validated_assessments
    WHERE patient_id    = ${patientId}
      AND scale         = 'PHQ-9'
      AND completed_at >= ${since90d}::date
    ORDER BY completed_at DESC
    LIMIT 1
  `;

  const item9Value = row?.item9 !== null ? parseInt(row!.item9!, 10) : 0;

  // Graduated: 0=not at all, 1=several days, 2=more than half the days, 3=nearly every day
  let contribution = 0;
  if (item9Value >= 3)      contribution = 8;
  else if (item9Value >= 2) contribution = 5;
  else if (item9Value >= 1) contribution = 3;

  const levelLabel = item9Value >= 3 ? 'nearly every day' : item9Value >= 2 ? 'more than half the days'
    : item9Value >= 1 ? 'several days' : 'not at all';

  return {
    rule:         'PHQ9_ITEM9_SI',
    label:        'PHQ-9 item 9 (SI screen)',
    domain:       'safety',
    weight:       WEIGHT,
    contribution,
    fired:        contribution > 0,
    value:        { item9: item9Value },
    detail:       item9Value > 0
      ? `PHQ-9 item 9 endorsed: "${levelLabel}" (${item9Value}/3)`
      : 'PHQ-9 item 9 not endorsed',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a composite risk score for `patientId` and return the full
 * breakdown with graduated contributions. All 10 rules run in parallel.
 */
export async function computeRiskScore(patientId: string): Promise<RiskScoreResult> {
  const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.all([
    evalCSSRS_Graduated(patientId),
    evalPHQ9_Trajectory(patientId),
    evalLowMoodStreak_Graduated(patientId),
    evalEngagement_Graduated(patientId),
    evalASRM_Graduated(patientId),
    evalMedAdherence_Graduated(patientId),
    evalSocialWithdrawal_Graduated(patientId),
    evalSleepDisruption(patientId),
    evalGAD7_Trajectory(patientId),
    evalPHQ9Item9(patientId),
  ]);

  const factors: RiskFactor[] = [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10];
  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.min(100, rawScore);

  return {
    score,
    raw_score: rawScore,
    band:        scoreToBand(score),
    factors,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Persist the risk score to `patients.risk_score`, `patients.risk_score_factors`,
 * and append to `patient_risk_history` for longitudinal tracking.
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

  await sql`
    INSERT INTO patient_risk_history (patient_id, score, band, factors, computed_at)
    VALUES (${patientId}, ${result.score}, ${result.band},
            ${JSON.stringify(result.factors)}::JSONB, ${result.computed_at})
  `;
}
