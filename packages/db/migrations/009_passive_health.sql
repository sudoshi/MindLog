-- =============================================================================
-- Migration 009 — Passive Health Snapshots
-- Stores HealthKit (iOS) and Google Health Connect (Android) passive data
-- synced from the patient mobile app on a daily basis.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- passive_health_snapshots
-- One row per patient per day per source.  UPSERT-friendly (UNIQUE constraint).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS passive_health_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  snapshot_date   DATE        NOT NULL,
  source          TEXT        NOT NULL CHECK (source IN ('healthkit', 'health_connect', 'manual')),

  -- Activity
  step_count      INTEGER     CHECK (step_count     >= 0),
  active_calories INTEGER     CHECK (active_calories >= 0),

  -- Cardiovascular
  resting_hr      SMALLINT    CHECK (resting_hr     BETWEEN 20 AND 300),  -- bpm
  hrv_ms          NUMERIC(6,2) CHECK (hrv_ms        >= 0),                -- RMSSD ms

  -- Sleep (sourced from Sleep stages API)
  sleep_hours     NUMERIC(4,2) CHECK (sleep_hours   BETWEEN 0 AND 24),    -- total
  sleep_deep_pct  NUMERIC(5,2) CHECK (sleep_deep_pct BETWEEN 0 AND 100),  -- % deep
  sleep_rem_pct   NUMERIC(5,2) CHECK (sleep_rem_pct  BETWEEN 0 AND 100),  -- % REM

  -- Pulse oximetry
  o2_saturation   NUMERIC(4,1) CHECK (o2_saturation  BETWEEN 50 AND 100), -- SpO2 %

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (patient_id, snapshot_date, source)
);

CREATE INDEX IF NOT EXISTS idx_passive_health_patient_date
  ON passive_health_snapshots (patient_id, snapshot_date DESC);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_passive_health_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_passive_health_updated_at ON passive_health_snapshots;
CREATE TRIGGER trg_passive_health_updated_at
  BEFORE UPDATE ON passive_health_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_passive_health_updated_at();

-- ---------------------------------------------------------------------------
-- patients: colour_scheme_preference — persists dark/light/system preference
-- ---------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS colour_scheme TEXT DEFAULT 'system'
    CHECK (colour_scheme IN ('system', 'light', 'dark'));

-- ---------------------------------------------------------------------------
-- Add voice_transcription to audit_logs action enum (if it's a CHECK constraint)
-- We use a permissive text column in audit_logs so no migration needed there.
-- ---------------------------------------------------------------------------

COMMIT;
