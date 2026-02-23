-- =============================================================================
-- Migration 011 — Risk Score & Full-Text Search
-- Adds composite risk score columns to patients and a generated tsvector column
-- on clinician_notes for full-text search in the web portal.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- patients — risk scoring columns
-- risk_score:         composite 0–100 integer (higher = higher risk)
-- risk_score_factors: JSONB array of { rule, weight, fired, value } objects
-- risk_score_updated_at: timestamp of last rule-engine run
-- ---------------------------------------------------------------------------

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS risk_score            SMALLINT
    CONSTRAINT risk_score_range CHECK (risk_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS risk_score_factors    JSONB,
  ADD COLUMN IF NOT EXISTS risk_score_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS patients_risk_score_idx
  ON patients (risk_score DESC NULLS LAST)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- clinician_notes — generated tsvector for full-text search
-- Stored generated column: automatically updated on INSERT/UPDATE.
-- ---------------------------------------------------------------------------

ALTER TABLE clinician_notes
  ADD COLUMN IF NOT EXISTS body_tsvector TSVECTOR
    GENERATED ALWAYS AS (to_tsvector('english', COALESCE(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS clinician_notes_fts_idx
  ON clinician_notes USING GIN (body_tsvector);

-- ---------------------------------------------------------------------------
-- patient_ai_insights — index for clinician queries
-- (clinician portal: "show all AI insights for my patients")
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS patient_ai_insights_clinician_idx
  ON patient_ai_insights (clinician_id, generated_at DESC)
  WHERE clinician_id IS NOT NULL;
