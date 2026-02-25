-- =============================================================================
-- Migration 016 — OMOP CDM Nightly Export
--
-- Creates tables for tracking OMOP CDM export runs and high-water marks
-- for incremental nightly exports.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- omop_export_runs — one row per export job
-- ---------------------------------------------------------------------------

CREATE TABLE omop_export_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  triggered_by      TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (triggered_by IN ('nightly', 'manual')),
  output_mode       TEXT        NOT NULL DEFAULT 'tsv_upload'
                                CHECK (output_mode IN ('tsv_upload')),
  full_refresh      BOOLEAN     NOT NULL DEFAULT FALSE,
  record_counts     JSONB,         -- {"person":146,"measurement":4500,...}
  file_urls         JSONB,         -- {"person":"https://...","measurement":"https://...",...}
  error_message     TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_omop_export_runs_status     ON omop_export_runs (status);
CREATE INDEX idx_omop_export_runs_created_at ON omop_export_runs (created_at DESC);

ALTER TABLE omop_export_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON omop_export_runs USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- omop_export_hwm — singleton row with per-source-table high-water marks
-- ---------------------------------------------------------------------------

CREATE TABLE omop_export_hwm (
  id                    INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  patients_hwm          TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  daily_entries_hwm     TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  validated_assessments_hwm TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  patient_medications_hwm   TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  patient_diagnoses_hwm     TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  appointments_hwm          TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  passive_health_hwm        TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  journal_entries_hwm       TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE omop_export_hwm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON omop_export_hwm USING (TRUE) WITH CHECK (TRUE);

-- Seed the singleton row
INSERT INTO omop_export_hwm (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Record migration
-- ---------------------------------------------------------------------------

INSERT INTO _migrations (filename) VALUES ('016_omop_export.sql');
