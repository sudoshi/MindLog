-- =============================================================================
-- Migration 017 — Deep Insights & Risk History
-- Adds structured findings and clinical trajectory to AI insights.
-- Creates risk history table for longitudinal risk score tracking.
-- Expands insight_type to include nightly_deep_analysis.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add new columns to patient_ai_insights
-- ---------------------------------------------------------------------------
ALTER TABLE patient_ai_insights
  ADD COLUMN IF NOT EXISTS structured_findings JSONB,
  ADD COLUMN IF NOT EXISTS clinical_trajectory TEXT
    CHECK (clinical_trajectory IN ('improving', 'stable', 'declining', 'acute'));

COMMENT ON COLUMN patient_ai_insights.structured_findings IS
  'Structured deep analysis output: domain_findings, early_warnings, treatment_response, recommended_focus, cross_domain_patterns.';

COMMENT ON COLUMN patient_ai_insights.clinical_trajectory IS
  'Overall patient trajectory assessment: improving, stable, declining, or acute.';

-- ---------------------------------------------------------------------------
-- 2. Expand insight_type CHECK constraint to include nightly_deep_analysis
-- ---------------------------------------------------------------------------
ALTER TABLE patient_ai_insights
  DROP CONSTRAINT IF EXISTS patient_ai_insights_insight_type_check;

ALTER TABLE patient_ai_insights
  ADD CONSTRAINT patient_ai_insights_insight_type_check
    CHECK (insight_type IN (
      'weekly_summary',
      'trend_narrative',
      'anomaly_detection',
      'risk_stratification',
      'nightly_deep_analysis'
    ));

-- ---------------------------------------------------------------------------
-- 3. Risk history table — longitudinal risk score tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_risk_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  score           SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
  band            TEXT        NOT NULL CHECK (band IN ('low', 'moderate', 'high', 'critical')),
  factors         JSONB       NOT NULL DEFAULT '[]',
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_history_patient_date
  ON patient_risk_history (patient_id, computed_at DESC);

-- RLS
ALTER TABLE patient_risk_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON patient_risk_history
  USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- 4. Performance index for "new data since last insight" queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_entries_submitted_at
  ON daily_entries (patient_id, submitted_at DESC)
  WHERE submitted_at IS NOT NULL;

COMMIT;
