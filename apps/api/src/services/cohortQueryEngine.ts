// =============================================================================
// MindLog API — Cohort Query Engine
//
// Converts a CohortFilterGroup DSL → parameterized postgres.js SQL fragments.
// All field names are validated against a whitelist to prevent SQL injection.
// All values are parameterized via postgres.js template literals.
// =============================================================================

import { sql } from '@mindlog/db';
import type { CohortFilterRule, CohortFilterGroup } from '@mindlog/shared';

// ---------------------------------------------------------------------------
// Field whitelist → column mapping (mv_patient_cohort_stats aliased as "mcs")
// ---------------------------------------------------------------------------

const FIELD_MAP: Record<string, string> = {
  // Patient demographics
  age:                'mcs.age',
  gender:             'mcs.gender',
  status:             'mcs.status',
  risk_level:         'mcs.risk_level',
  tracking_streak:    'mcs.tracking_streak',
  is_active:          'mcs.is_active',
  app_installed:      'mcs.app_installed',
  onboarding_complete:'mcs.onboarding_complete',
  // Clinical assessments (latest scores)
  latest_phq9:        'mcs.latest_phq9',
  latest_gad7:        'mcs.latest_gad7',
  latest_asrm:        'mcs.latest_asrm',
  // 30-day daily entry aggregates
  avg_mood_30d:       'mcs.avg_mood_30d',
  avg_coping_30d:     'mcs.avg_coping_30d',
  avg_stress_30d:      'mcs.avg_stress_30d',
  avg_anxiety_30d:    'mcs.avg_anxiety_30d',
  checkins_30d:       'mcs.checkins_30d',
  // Clinical
  active_med_count:   'mcs.active_med_count',
  diagnosis_codes:    'mcs.diagnosis_codes',
};

/** All valid filter field names */
export const ALLOWED_FIELDS = Object.keys(FIELD_MAP);

// Sort field → column mapping
const SORT_MAP: Record<string, string> = {
  name:             'mcs.last_name',
  risk_level:       'mcs.risk_level',
  latest_phq9:      'mcs.latest_phq9',
  latest_gad7:      'mcs.latest_gad7',
  avg_mood_30d:     'mcs.avg_mood_30d',
  tracking_streak:  'mcs.tracking_streak',
};

// ---------------------------------------------------------------------------
// SQL Fragment builders
// ---------------------------------------------------------------------------

type SqlFragment = ReturnType<typeof sql>;

function buildRule(rule: CohortFilterRule): SqlFragment {
  const column = FIELD_MAP[rule.field];
  if (!column) {
    throw new Error(`Invalid filter field: ${rule.field}`);
  }

  // Special handling for diagnosis_codes with 'contains' op
  if (rule.field === 'diagnosis_codes' && rule.op === 'contains') {
    if (typeof rule.value === 'string') {
      return sql`${sql.unsafe(column)} @> ARRAY[${rule.value}]::TEXT[]`;
    }
    if (Array.isArray(rule.value)) {
      return sql`${sql.unsafe(column)} @> ${rule.value}::TEXT[]`;
    }
  }

  // Special handling for 'in' operator
  if (rule.op === 'in') {
    const values = Array.isArray(rule.value) ? rule.value : [String(rule.value)];
    return sql`${sql.unsafe(column)} = ANY(${values})`;
  }

  // Standard comparison operators
  const val = rule.value;
  switch (rule.op) {
    case 'eq':
      return sql`${sql.unsafe(column)} = ${val}`;
    case 'neq':
      return sql`${sql.unsafe(column)} != ${val}`;
    case 'gt':
      return sql`${sql.unsafe(column)} > ${val}`;
    case 'gte':
      return sql`${sql.unsafe(column)} >= ${val}`;
    case 'lt':
      return sql`${sql.unsafe(column)} < ${val}`;
    case 'lte':
      return sql`${sql.unsafe(column)} <= ${val}`;
    default:
      throw new Error(`Unsupported operator: ${rule.op}`);
  }
}

function isFilterGroup(item: CohortFilterRule | CohortFilterGroup): item is CohortFilterGroup {
  return 'logic' in item && 'rules' in item;
}

function buildGroup(group: CohortFilterGroup, depth = 0): SqlFragment {
  if (depth > 2) {
    throw new Error('Filter nesting too deep (max 2 levels)');
  }

  const fragments: SqlFragment[] = group.rules.map((item) =>
    isFilterGroup(item) ? buildGroup(item, depth + 1) : buildRule(item)
  );

  if (fragments.length === 0) {
    return sql`TRUE`;
  }

  if (fragments.length === 1) {
    return fragments[0]!;
  }

  // Join fragments with AND/OR
  if (group.logic === 'AND') {
    let result = sql`(${fragments[0]!}`;
    for (let i = 1; i < fragments.length; i++) {
      result = sql`${result} AND ${fragments[i]!}`;
    }
    return sql`${result})`;
  } else {
    let result = sql`(${fragments[0]!}`;
    for (let i = 1; i < fragments.length; i++) {
      result = sql`${result} OR ${fragments[i]!}`;
    }
    return sql`${result})`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CohortQueryOptions {
  orgId: string;
  filters: CohortFilterGroup;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CohortPatientRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  risk_level: string;
  status: string;
  latest_phq9: number | null;
  latest_gad7: number | null;
  latest_asrm: number | null;
  avg_mood_30d: number | null;
  tracking_streak: number;
  diagnosis_codes: string[] | null;
  active_med_count: number;
  age: number;
  gender: string | null;
  checkins_30d: number;
}

export interface CohortAggregates {
  total_count: number;
  avg_mood: number | null;
  avg_phq9: number | null;
  avg_gad7: number | null;
  risk_distribution: Record<string, number>;
  gender_distribution: Record<string, number>;
  avg_tracking_streak: number | null;
  avg_med_count: number | null;
}

/**
 * Execute a cohort query: returns matching patients + aggregate stats.
 */
export async function queryCohort(opts: CohortQueryOptions): Promise<{
  patients: CohortPatientRow[];
  aggregates: CohortAggregates;
  pagination: { total: number; limit: number; offset: number; has_next: boolean };
}> {
  const { orgId, filters, limit = 50, offset = 0, sortBy = 'name', sortDir = 'asc' } = opts;
  const whereClause = buildGroup(filters);
  const sortColumn = SORT_MAP[sortBy] ?? 'mcs.last_name';
  const sortDirection = sortDir === 'desc' ? sql`DESC` : sql`ASC`;

  // Run patient query and aggregate query in parallel
  const [patients, aggRows, countRows] = await Promise.all([
    // Paginated patient list
    sql<CohortPatientRow[]>`
      SELECT
        mcs.patient_id,
        mcs.first_name,
        mcs.last_name,
        mcs.risk_level,
        mcs.status,
        mcs.latest_phq9,
        mcs.latest_gad7,
        mcs.latest_asrm,
        mcs.avg_mood_30d,
        mcs.tracking_streak,
        mcs.diagnosis_codes,
        mcs.active_med_count,
        mcs.age,
        mcs.gender,
        mcs.checkins_30d
      FROM mv_patient_cohort_stats mcs
      WHERE mcs.organisation_id = ${orgId}::UUID
        AND ${whereClause}
      ORDER BY ${sql.unsafe(sortColumn)} ${sortDirection} NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `,
    // Aggregates
    sql`
      SELECT
        AVG(mcs.avg_mood_30d)::NUMERIC(4,2) AS avg_mood,
        AVG(mcs.latest_phq9)::NUMERIC(4,2) AS avg_phq9,
        AVG(mcs.latest_gad7)::NUMERIC(4,2) AS avg_gad7,
        AVG(mcs.tracking_streak)::NUMERIC(6,2) AS avg_tracking_streak,
        AVG(mcs.active_med_count)::NUMERIC(4,2) AS avg_med_count,
        COUNT(*)::INT AS total_count,
        COUNT(*) FILTER (WHERE mcs.risk_level = 'low')::INT AS risk_low,
        COUNT(*) FILTER (WHERE mcs.risk_level = 'moderate')::INT AS risk_moderate,
        COUNT(*) FILTER (WHERE mcs.risk_level = 'high')::INT AS risk_high,
        COUNT(*) FILTER (WHERE mcs.risk_level = 'critical')::INT AS risk_critical,
        COUNT(*) FILTER (WHERE mcs.gender = 'male')::INT AS gender_male,
        COUNT(*) FILTER (WHERE mcs.gender = 'female')::INT AS gender_female,
        COUNT(*) FILTER (WHERE mcs.gender = 'non_binary')::INT AS gender_non_binary,
        COUNT(*) FILTER (WHERE mcs.gender = 'other' OR mcs.gender = 'prefer_not_to_say')::INT AS gender_other
      FROM mv_patient_cohort_stats mcs
      WHERE mcs.organisation_id = ${orgId}::UUID
        AND ${whereClause}
    `,
    // Total count (for pagination)
    sql<{ count: number }[]>`
      SELECT COUNT(*)::INT AS count
      FROM mv_patient_cohort_stats mcs
      WHERE mcs.organisation_id = ${orgId}::UUID
        AND ${whereClause}
    `,
  ]);

  const agg = aggRows[0];
  const total = countRows[0]?.count ?? 0;

  return {
    patients,
    aggregates: {
      total_count: total,
      avg_mood: agg?.avg_mood ?? null,
      avg_phq9: agg?.avg_phq9 ?? null,
      avg_gad7: agg?.avg_gad7 ?? null,
      avg_tracking_streak: agg?.avg_tracking_streak ?? null,
      avg_med_count: agg?.avg_med_count ?? null,
      risk_distribution: {
        low: agg?.risk_low ?? 0,
        moderate: agg?.risk_moderate ?? 0,
        high: agg?.risk_high ?? 0,
        critical: agg?.risk_critical ?? 0,
      },
      gender_distribution: {
        male: agg?.gender_male ?? 0,
        female: agg?.gender_female ?? 0,
        non_binary: agg?.gender_non_binary ?? 0,
        other: agg?.gender_other ?? 0,
      },
    },
    pagination: { total, limit, offset, has_next: offset + patients.length < total },
  };
}

/**
 * Count matching patients for a filter group (live preview).
 */
export async function countCohort(orgId: string, filters: CohortFilterGroup): Promise<number> {
  const whereClause = buildGroup(filters);
  const [row] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::INT AS count
    FROM mv_patient_cohort_stats mcs
    WHERE mcs.organisation_id = ${orgId}::UUID
      AND ${whereClause}
  `;
  return row?.count ?? 0;
}

/**
 * Compute aggregates for a saved cohort and insert a snapshot row.
 */
export async function captureCohortSnapshot(
  cohortId: string,
  orgId: string,
  filters: CohortFilterGroup,
): Promise<void> {
  const whereClause = buildGroup(filters);

  const [agg] = await sql`
    SELECT
      COUNT(*)::INT AS patient_count,
      AVG(mcs.avg_mood_30d)::NUMERIC(4,2) AS avg_mood,
      AVG(mcs.latest_phq9)::NUMERIC(4,2) AS avg_phq9,
      AVG(mcs.latest_gad7)::NUMERIC(4,2) AS avg_gad7,
      AVG(mcs.tracking_streak)::NUMERIC(6,2) AS avg_tracking_streak,
      COUNT(*) FILTER (WHERE mcs.risk_level = 'low')::INT AS risk_low,
      COUNT(*) FILTER (WHERE mcs.risk_level = 'moderate')::INT AS risk_moderate,
      COUNT(*) FILTER (WHERE mcs.risk_level = 'high')::INT AS risk_high,
      COUNT(*) FILTER (WHERE mcs.risk_level = 'critical')::INT AS risk_critical
    FROM mv_patient_cohort_stats mcs
    WHERE mcs.organisation_id = ${orgId}::UUID
      AND ${whereClause}
  `;

  if (!agg) return;

  const riskDist = {
    low: agg.risk_low ?? 0,
    moderate: agg.risk_moderate ?? 0,
    high: agg.risk_high ?? 0,
    critical: agg.risk_critical ?? 0,
  };

  await sql`
    INSERT INTO cohort_snapshots (cohort_id, patient_count, avg_mood, avg_phq9, avg_gad7, risk_distribution, avg_tracking_streak)
    VALUES (
      ${cohortId}::UUID,
      ${agg.patient_count},
      ${agg.avg_mood},
      ${agg.avg_phq9},
      ${agg.avg_gad7},
      ${sql`${JSON.stringify(riskDist)}::jsonb`},
      ${agg.avg_tracking_streak}
    )
  `;

  // Also update last_count on the cohort definition
  await sql`
    UPDATE cohort_definitions
    SET last_count = ${agg.patient_count}, last_run_at = NOW()
    WHERE id = ${cohortId}::UUID
  `;
}
