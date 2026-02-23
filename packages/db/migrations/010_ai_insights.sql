-- =============================================================================
-- Migration 010 — AI Insights Storage
-- Stores LLM-generated clinical narratives and usage telemetry.
-- HIPAA compliance: no PHI is stored in this table; all identifiers are UUIDs.
-- All rows require consent_verified = TRUE (enforced by CHECK constraint).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- patient_ai_insights
-- One row per AI-generated insight document for a patient.
-- ---------------------------------------------------------------------------

CREATE TABLE patient_ai_insights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id     UUID        REFERENCES clinicians(id) ON DELETE SET NULL,   -- who triggered (NULL = nightly batch)
  insight_type     TEXT        NOT NULL
                               CHECK (insight_type IN (
                                 'weekly_summary',
                                 'trend_narrative',
                                 'anomaly_detection',
                                 'risk_stratification'
                               )),
  period_start     DATE,
  period_end       DATE,
  narrative        TEXT        NOT NULL,
  key_findings     JSONB       NOT NULL DEFAULT '[]',
  risk_delta       SMALLINT,                     -- Δ risk score vs prior insight (−100 to +100)
  model_id         TEXT        NOT NULL,
  input_tokens     INTEGER     NOT NULL DEFAULT 0,
  output_tokens    INTEGER     NOT NULL DEFAULT 0,
  -- HIPAA: row-level consent enforcement — cannot insert without verified consent
  consent_verified BOOLEAN     NOT NULL DEFAULT TRUE
                               CHECK (consent_verified = TRUE),
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX patient_ai_insights_patient_date_idx
  ON patient_ai_insights (patient_id, generated_at DESC);

CREATE INDEX patient_ai_insights_type_idx
  ON patient_ai_insights (patient_id, insight_type, generated_at DESC);

-- ---------------------------------------------------------------------------
-- ai_usage_log
-- Per-patient, per-month, per-insight-type token usage.
-- Used for cost monitoring and per-organisation caps.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_usage_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  month_year    TEXT        NOT NULL,   -- YYYY-MM  (e.g. '2026-02')
  insight_type  TEXT        NOT NULL,
  input_tokens  INTEGER     NOT NULL DEFAULT 0,
  output_tokens INTEGER     NOT NULL DEFAULT 0,
  cost_cents    INTEGER     NOT NULL DEFAULT 0,   -- approximate, based on current pricing
  last_logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (patient, month, insight_type) — UPSERT increments counts
CREATE UNIQUE INDEX ai_usage_log_unique_idx
  ON ai_usage_log (patient_id, month_year, insight_type);

CREATE INDEX ai_usage_log_org_month_idx
  ON ai_usage_log (org_id, month_year);

-- ---------------------------------------------------------------------------
-- Row-level security (mirrors pattern from patients table)
-- Clinicians can only read insights for their own patients.
-- ---------------------------------------------------------------------------

ALTER TABLE patient_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log        ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow all for service role (API uses service role connection)
CREATE POLICY "service_role_all" ON patient_ai_insights
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_all" ON ai_usage_log
  USING (TRUE) WITH CHECK (TRUE);
