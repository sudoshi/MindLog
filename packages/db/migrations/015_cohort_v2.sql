-- =============================================================================
-- Migration 015 — Cohort Builder v2
--
-- Adds cohort_snapshots for trend tracking, enhances cohort_definitions with
-- filter_version/is_pinned/color, and creates mv_patient_cohort_stats
-- materialized view for fast cohort queries.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Alter cohort_definitions — add v2 columns
-- ---------------------------------------------------------------------------

ALTER TABLE cohort_definitions
  ADD COLUMN IF NOT EXISTS filter_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6edcd0';

COMMENT ON COLUMN cohort_definitions.filter_version IS '1 = v1 flat filters, 2 = v2 structured DSL with AND/OR groups';
COMMENT ON COLUMN cohort_definitions.is_pinned IS 'Quick-access bookmark for clinician dashboard';
COMMENT ON COLUMN cohort_definitions.color IS 'Hex color for cohort comparison chart lines';

-- ---------------------------------------------------------------------------
-- cohort_snapshots — point-in-time aggregate stats for saved cohorts
-- ---------------------------------------------------------------------------

CREATE TABLE cohort_snapshots (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           UUID        NOT NULL REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  patient_count       INT         NOT NULL,
  avg_mood            NUMERIC(4,2),
  avg_phq9            NUMERIC(4,2),
  avg_gad7            NUMERIC(4,2),
  risk_distribution   JSONB,        -- {"low":40,"moderate":30,"high":20,"critical":10}
  med_adherence_pct   NUMERIC(5,2),
  avg_tracking_streak NUMERIC(6,2),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cohort_snapshots_cohort_time ON cohort_snapshots (cohort_id, computed_at DESC);

ALTER TABLE cohort_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON cohort_snapshots USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- mv_patient_cohort_stats — pre-computed 30-day aggregates per patient
-- Used by the cohort query engine for fast filter + aggregate queries.
-- Refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_patient_cohort_stats;
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_patient_cohort_stats AS
SELECT
  p.id AS patient_id,
  p.organisation_id,
  p.status,
  p.risk_level,
  p.gender,
  p.date_of_birth,
  p.tracking_streak,
  p.is_active,
  p.app_installed,
  p.onboarding_complete,
  p.first_name,
  p.last_name,
  EXTRACT(YEAR FROM AGE(NOW(), p.date_of_birth))::INT AS age,
  -- 30-day daily_entries aggregates
  (SELECT AVG(de.mood)::NUMERIC(4,2) FROM daily_entries de WHERE de.patient_id = p.id AND de.entry_date >= CURRENT_DATE - 30 AND de.submitted_at IS NOT NULL) AS avg_mood_30d,
  (SELECT AVG(de.coping)::NUMERIC(4,2) FROM daily_entries de WHERE de.patient_id = p.id AND de.entry_date >= CURRENT_DATE - 30 AND de.submitted_at IS NOT NULL) AS avg_coping_30d,
  (SELECT AVG(de.stress_score)::NUMERIC(4,2) FROM daily_entries de WHERE de.patient_id = p.id AND de.entry_date >= CURRENT_DATE - 30 AND de.submitted_at IS NOT NULL) AS avg_stress_30d,
  (SELECT AVG(de.anxiety_score)::NUMERIC(4,2) FROM daily_entries de WHERE de.patient_id = p.id AND de.entry_date >= CURRENT_DATE - 30 AND de.submitted_at IS NOT NULL) AS avg_anxiety_30d,
  (SELECT COUNT(*)::INT FROM daily_entries de WHERE de.patient_id = p.id AND de.entry_date >= CURRENT_DATE - 30 AND de.submitted_at IS NOT NULL) AS checkins_30d,
  -- Latest assessment scores
  (SELECT va.score FROM validated_assessments va WHERE va.patient_id = p.id AND va.scale = 'PHQ-9' ORDER BY va.completed_at DESC LIMIT 1) AS latest_phq9,
  (SELECT va.score FROM validated_assessments va WHERE va.patient_id = p.id AND va.scale = 'GAD-7' ORDER BY va.completed_at DESC LIMIT 1) AS latest_gad7,
  (SELECT va.score FROM validated_assessments va WHERE va.patient_id = p.id AND va.scale = 'ASRM' ORDER BY va.completed_at DESC LIMIT 1) AS latest_asrm,
  -- Medication count (active only)
  (SELECT COUNT(*)::INT FROM patient_medications pm WHERE pm.patient_id = p.id AND pm.discontinued_at IS NULL) AS active_med_count,
  -- Diagnosis codes (array of active ICD-10)
  (SELECT ARRAY_AGG(DISTINCT pd.icd10_code) FROM patient_diagnoses pd WHERE pd.patient_id = p.id AND pd.resolved_at IS NULL) AS diagnosis_codes
FROM patients p
WHERE p.is_active = TRUE;

CREATE UNIQUE INDEX ON mv_patient_cohort_stats (patient_id);
CREATE INDEX ON mv_patient_cohort_stats (organisation_id);

-- ---------------------------------------------------------------------------
-- Record migration
-- ---------------------------------------------------------------------------

INSERT INTO _migrations (filename) VALUES ('015_cohort_v2.sql');
