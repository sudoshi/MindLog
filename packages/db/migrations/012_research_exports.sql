-- =============================================================================
-- Migration 012 — Research Exports & Cohort Definitions
-- De-identified NDJSON exports for IRB-approved research.
-- All PHI removed before export (Safe Harbour method — 18 identifiers stripped).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- cohort_definitions
-- Saved patient-filter presets used by researchers/admins to define a cohort
-- without storing patient IDs directly.
-- ---------------------------------------------------------------------------

CREATE TABLE cohort_definitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  created_by      UUID        NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- Arbitrary JSON filter object:
  --   { diagnoses: ['F31.9'], risk_levels: ['high','critical'],
  --     age_min: 18, age_max: 65, active_only: true }
  filters         JSONB       NOT NULL DEFAULT '{}',

  last_count      INTEGER,                          -- result of most-recent count query
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cohort_definitions_org_idx ON cohort_definitions (organisation_id);
CREATE INDEX cohort_definitions_created_by_idx ON cohort_definitions (created_by);

-- ---------------------------------------------------------------------------
-- research_exports
-- One row per export request.  Status transitions: pending → processing →
-- completed | failed.  Completed rows hold a signed storage URL that expires.
-- ---------------------------------------------------------------------------

CREATE TABLE research_exports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by    UUID        NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  cohort_id       UUID        REFERENCES cohort_definitions(id) ON DELETE SET NULL,

  -- Snapshot of filters at request time (cohort filters may change later)
  filters         JSONB       NOT NULL DEFAULT '{}',

  -- Export configuration
  format          TEXT        NOT NULL DEFAULT 'ndjson'
                               CHECK (format IN ('ndjson', 'csv', 'fhir_bundle')),
  include_fields  TEXT[]      NOT NULL DEFAULT ARRAY[
                    'entry_date','mood','coping','sleep_hours','sleep_quality',
                    'exercise_minutes','suicidal_ideation','anxiety_score',
                    'mania_score','anhedonia_score'
                  ],

  -- Job lifecycle
  status          TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','completed','failed')),
  record_count    INTEGER,                          -- rows included in export
  error_message   TEXT,

  -- Storage
  file_url        TEXT,                             -- presigned URL (expires_at)
  file_size_bytes BIGINT,
  expires_at      TIMESTAMPTZ,                      -- URL expiry (default 7 days)

  -- De-identification certificate
  -- Records which Safe Harbour identifiers were stripped
  deidentification_method  TEXT NOT NULL DEFAULT 'safe_harbour_18',
  deidentified_at          TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX research_exports_requested_by_idx ON research_exports (requested_by, created_at DESC);
CREATE INDEX research_exports_org_idx ON research_exports (organisation_id, created_at DESC);
CREATE INDEX research_exports_status_idx ON research_exports (status) WHERE status IN ('pending','processing');

-- ---------------------------------------------------------------------------
-- Row-level security (service role only — researchers use admin API)
-- ---------------------------------------------------------------------------

ALTER TABLE cohort_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_exports   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON cohort_definitions USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON research_exports   USING (TRUE) WITH CHECK (TRUE);
