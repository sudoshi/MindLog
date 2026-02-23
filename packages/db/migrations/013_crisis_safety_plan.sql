-- =============================================================================
-- Migration 013 — Crisis Safety Plans
-- Patient-specific collaborative safety plans created by the clinical team.
-- One plan per patient (UNIQUE on patient_id); updated in-place with versioned
-- history stored in the JSONB audit column.
-- =============================================================================

CREATE TABLE crisis_safety_plans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  organisation_id  UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  completed_by     UUID        REFERENCES clinicians(id) ON DELETE SET NULL,

  -- ── Stanley-Brown Collaborative Safety Plan sections ──────────────────────

  -- Step 1: Warning signs (thoughts, feelings, behaviours that signal a crisis)
  warning_signs              TEXT[]     NOT NULL DEFAULT '{}',

  -- Step 2: Internal coping strategies (things to do alone to take mind off pain)
  internal_coping_strategies TEXT[]     NOT NULL DEFAULT '{}',

  -- Step 3: People and social settings that provide distraction
  social_distractions        JSONB      NOT NULL DEFAULT '[]',
  -- [{name: 'Jake', phone: '555-...'}, {place: 'Coffee shop on Main St'}]

  -- Step 4: People to ask for help
  support_contacts           JSONB      NOT NULL DEFAULT '[]',
  -- [{name: 'Mom', phone: '555-...', relationship: 'parent'}]

  -- Step 5: Professionals and agencies to contact during crisis
  professional_contact_name  TEXT,
  professional_contact_phone TEXT,
  professional_contact_agency TEXT,

  -- Emergency services
  crisis_line_phone          TEXT       NOT NULL DEFAULT '988',
  crisis_line_name           TEXT       NOT NULL DEFAULT '988 Suicide & Crisis Lifeline',
  er_address                 TEXT,

  -- Step 6: Making the environment safe (means restriction)
  means_restriction_notes    TEXT,        -- e.g. "Firearms stored at relative's home"

  -- Free-text emergency steps (clinician-authored)
  emergency_steps            TEXT,

  -- Patient strengths / reasons for living (motivational foundation)
  reasons_for_living         TEXT[]     NOT NULL DEFAULT '{}',

  -- Plan metadata
  is_active                  BOOLEAN    NOT NULL DEFAULT TRUE,
  last_reviewed_at           TIMESTAMPTZ,
  patient_signature_at       TIMESTAMPTZ,   -- records patient agreement
  clinician_signature_at     TIMESTAMPTZ,

  -- Lightweight version history: each update appends a snapshot
  version                    SMALLINT   NOT NULL DEFAULT 1,
  version_history            JSONB      NOT NULL DEFAULT '[]',

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by clinician's patients
CREATE INDEX crisis_safety_plans_org_idx ON crisis_safety_plans (organisation_id);
CREATE INDEX crisis_safety_plans_completed_by_idx ON crisis_safety_plans (completed_by);

-- Trigger: auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_crisis_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crisis_safety_plans_updated_at
  BEFORE UPDATE ON crisis_safety_plans
  FOR EACH ROW EXECUTE FUNCTION update_crisis_plan_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE crisis_safety_plans ENABLE ROW LEVEL SECURITY;

-- Service role (API) can read/write all rows
CREATE POLICY "service_role_all" ON crisis_safety_plans USING (TRUE) WITH CHECK (TRUE);
