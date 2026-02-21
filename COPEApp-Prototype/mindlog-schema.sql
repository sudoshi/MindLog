-- =============================================================================
-- MindLog — Complete Database DDL
-- PostgreSQL 15+
--
-- Schema covers:
--   1. Identity & Auth        (organisations, clinicians, patients)
--   2. Clinical Setup         (diagnoses, medications, care team)
--   3. Patient App — Daily    (daily_entries, sleep_logs, exercise_logs)
--   4. Patient App — Wellness (wellness_strategies, wellness_logs)
--   5. Patient App — Triggers (triggers, trigger_logs)
--   6. Patient App — Symptoms (symptoms, symptom_logs, safety_events)
--   7. Patient App — Journal  (journal_entries, journal_prompts)
--   8. Alerts & Notifications (clinical_alerts, notification_preferences)
--   9. Clinical Workflow      (clinician_notes, appointments, reports)
--  10. Analytics              (population_snapshots, correlation_cache)
--  11. Audit & Consent        (audit_log, consent_records, data_exports)
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy search on patient names
CREATE EXTENSION IF NOT EXISTS "btree_gist";    -- date range exclusion constraints

-- =============================================================================
-- SECTION 1 — IDENTITY & AUTH
-- =============================================================================

-- Organisations (hospital, clinic, or private practice)
CREATE TABLE organisations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL,
    type                TEXT        NOT NULL CHECK (type IN ('hospital', 'clinic', 'private_practice', 'research')),
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    country             CHAR(2),                    -- ISO 3166-1 alpha-2
    timezone            TEXT        NOT NULL DEFAULT 'UTC',
    locale              TEXT        NOT NULL DEFAULT 'en-AU',
    logo_url            TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organisations IS 'Top-level tenant. All clinicians and patients belong to one organisation.';

-- Clinicians (psychiatrists, psychologists, GPs, care coordinators)
CREATE TABLE clinicians (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    email               TEXT        NOT NULL UNIQUE,
    password_hash       TEXT        NOT NULL,
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    title               TEXT,                       -- Dr, Prof, Mr, Ms, etc.
    role                TEXT        NOT NULL CHECK (role IN (
                            'psychiatrist', 'psychologist', 'gp',
                            'care_coordinator', 'nurse', 'researcher', 'admin'
                        )),
    ahpra_number        TEXT,                       -- Australian Health Practitioner Regulation Agency
    department          TEXT,
    room_number         TEXT,
    phone               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    mfa_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    mfa_secret          TEXT,                       -- encrypted TOTP secret
    session_timeout_min INTEGER     NOT NULL DEFAULT 30,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinicians IS 'Licensed clinical practitioners. Authentication record + professional details.';
COMMENT ON COLUMN clinicians.ahpra_number IS 'Regulatory registration number; jurisdiction-specific (rename to gmcNumber, npiNumber etc. as needed).';

CREATE INDEX idx_clinicians_org ON clinicians(organisation_id);
CREATE INDEX idx_clinicians_email ON clinicians(email);


-- Patients
CREATE TABLE patients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    mrn                 TEXT        NOT NULL,       -- Medical Record Number (unique per org)
    email               TEXT        UNIQUE,         -- NULL if app-only, no account yet
    phone               TEXT,
    password_hash       TEXT,                       -- NULL until patient activates mobile account
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    preferred_name      TEXT,
    date_of_birth       DATE        NOT NULL,
    gender              TEXT        CHECK (gender IN ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say')),
    gender_other        TEXT,                       -- free text when gender = 'other'
    timezone            TEXT        NOT NULL DEFAULT 'UTC',
    locale              TEXT        NOT NULL DEFAULT 'en-AU',
    -- Status & risk (clinician-managed)
    status              TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive', 'crisis', 'discharged', 'deceased')),
    risk_level          TEXT        NOT NULL DEFAULT 'moderate'
                            CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
    risk_reviewed_at    TIMESTAMPTZ,
    risk_reviewed_by    UUID        REFERENCES clinicians(id),
    -- App engagement
    app_installed       BOOLEAN     NOT NULL DEFAULT FALSE,
    app_last_seen_at    TIMESTAMPTZ,
    tracking_streak     INTEGER     NOT NULL DEFAULT 0,  -- consecutive days with a completed entry
    longest_streak      INTEGER     NOT NULL DEFAULT 0,
    last_checkin_at     TIMESTAMPTZ,
    onboarding_complete BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Soft delete
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    deactivated_at      TIMESTAMPTZ,
    deactivated_by      UUID        REFERENCES clinicians(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organisation_id, mrn)
);

COMMENT ON TABLE patients IS 'Patient identity record. Shared by mobile app and clinician dashboard.';
COMMENT ON COLUMN patients.tracking_streak IS 'Recomputed nightly by a background job after entries are processed.';

CREATE INDEX idx_patients_org ON patients(organisation_id);
CREATE INDEX idx_patients_status ON patients(status) WHERE is_active = TRUE;
CREATE INDEX idx_patients_risk ON patients(risk_level) WHERE is_active = TRUE;
CREATE INDEX idx_patients_name_trgm ON patients USING gin((first_name || ' ' || last_name) gin_trgm_ops);


-- =============================================================================
-- SECTION 2 — CLINICAL SETUP
-- =============================================================================

-- ICD-10 reference (subset loaded from standard; extensible)
CREATE TABLE icd10_codes (
    code                TEXT        PRIMARY KEY,    -- e.g. 'F31.1'
    description         TEXT        NOT NULL,       -- 'Bipolar affective disorder, current episode manic without psychotic symptoms'
    chapter             TEXT,
    block               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE icd10_codes IS 'Reference table for ICD-10-AM codes used in patient diagnoses. Loaded from a standard data feed.';


-- Patient diagnoses (one patient may have multiple)
CREATE TABLE patient_diagnoses (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    icd10_code          TEXT        NOT NULL REFERENCES icd10_codes(code),
    description_override TEXT,                      -- clinician's own label (e.g. "Bipolar I with rapid cycling")
    is_primary          BOOLEAN     NOT NULL DEFAULT FALSE,
    diagnosed_at        DATE,
    diagnosed_by        UUID        REFERENCES clinicians(id),
    resolved_at         DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_diagnoses_patient ON patient_diagnoses(patient_id);
CREATE INDEX idx_patient_diagnoses_primary ON patient_diagnoses(patient_id) WHERE is_primary = TRUE;


-- Medication catalogue (reference; expanded over time)
CREATE TABLE medications_catalogue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name        TEXT        NOT NULL,
    brand_names         TEXT[],
    drug_class          TEXT,                       -- SSRI, mood stabiliser, antipsychotic, etc.
    typical_dose_unit   TEXT,                       -- mg, ml, etc.
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_med_catalogue_name_trgm ON medications_catalogue USING gin(generic_name gin_trgm_ops);


-- Medications prescribed to a patient
CREATE TABLE patient_medications (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    catalogue_id        UUID        REFERENCES medications_catalogue(id),
    -- Allow free-text for medications not yet in catalogue
    medication_name     TEXT        NOT NULL,
    dose                NUMERIC(8,3),
    dose_unit           TEXT        DEFAULT 'mg',
    frequency           TEXT        NOT NULL CHECK (frequency IN (
                            'once_daily_morning', 'once_daily_evening', 'once_daily_bedtime',
                            'twice_daily', 'three_times_daily', 'as_needed', 'weekly', 'other'
                        )),
    frequency_other     TEXT,
    instructions        TEXT,                       -- 'with food', 'avoid grapefruit', etc.
    prescribed_by       UUID        REFERENCES clinicians(id),
    prescribed_at       DATE,
    discontinued_at     DATE,
    discontinuation_reason TEXT,
    show_in_app         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN patient_medications.show_in_app IS 'Controls whether this medication appears on the patient daily check-in screen.';

CREATE INDEX idx_patient_medications_patient ON patient_medications(patient_id) WHERE discontinued_at IS NULL;


-- Care team (which clinicians are responsible for which patients)
CREATE TABLE care_team_members (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
    role                TEXT        NOT NULL CHECK (role IN (
                            'primary', 'secondary', 'covering', 'supervisor', 'researcher'
                        )),
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at       TIMESTAMPTZ,
    UNIQUE (patient_id, clinician_id, role)
);

CREATE INDEX idx_care_team_patient ON care_team_members(patient_id) WHERE unassigned_at IS NULL;
CREATE INDEX idx_care_team_clinician ON care_team_members(clinician_id) WHERE unassigned_at IS NULL;


-- =============================================================================
-- SECTION 3 — DAILY ENTRIES (patient mobile app core)
-- =============================================================================

-- One row per patient per calendar day. The top-level entry record.
CREATE TABLE daily_entries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    -- Core ratings
    mood                SMALLINT    CHECK (mood BETWEEN 1 AND 10),
    coping              SMALLINT    CHECK (coping BETWEEN 1 AND 10),
    -- Completion tracking
    completion_pct      SMALLINT    NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
    core_complete       BOOLEAN     NOT NULL DEFAULT FALSE,   -- mood + coping filled
    wellness_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    triggers_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    symptoms_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    journal_complete    BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Metadata
    started_at          TIMESTAMPTZ,
    last_saved_at       TIMESTAMPTZ,
    submitted_at        TIMESTAMPTZ,                          -- NULL = still in progress
    device_platform     TEXT        CHECK (device_platform IN ('ios', 'android', 'web')),
    app_version         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (patient_id, entry_date)
);

COMMENT ON TABLE daily_entries IS 'Parent record for a patient''s daily check-in. Child tables (sleep, exercise, medications taken) link to this.';
COMMENT ON COLUMN daily_entries.submitted_at IS 'Set when the patient explicitly taps "Submit" or the day rolls over. NULL entries are drafts.';

CREATE INDEX idx_daily_entries_patient_date ON daily_entries(patient_id, entry_date DESC);
CREATE INDEX idx_daily_entries_date ON daily_entries(entry_date);
CREATE INDEX idx_daily_entries_mood ON daily_entries(patient_id, mood) WHERE mood IS NOT NULL;


-- Sleep log (child of daily_entry)
CREATE TABLE sleep_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL UNIQUE REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    hours               SMALLINT    NOT NULL CHECK (hours BETWEEN 0 AND 24),
    minutes             SMALLINT    NOT NULL DEFAULT 0 CHECK (minutes IN (0, 15, 30, 45)),
    total_minutes       SMALLINT    GENERATED ALWAYS AS (hours * 60 + minutes) STORED,
    quality             SMALLINT    CHECK (quality BETWEEN 1 AND 10),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN sleep_logs.total_minutes IS 'Computed column; use for range queries and averages.';

CREATE INDEX idx_sleep_logs_patient_date ON sleep_logs(patient_id, entry_date DESC);


-- Exercise log (child of daily_entry)
CREATE TABLE exercise_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL UNIQUE REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    duration_minutes    SMALLINT    NOT NULL DEFAULT 0 CHECK (duration_minutes BETWEEN 0 AND 600),
    exercise_type       TEXT,                       -- free text; 'walk', 'gym', 'yoga', etc.
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercise_logs_patient_date ON exercise_logs(patient_id, entry_date DESC);


-- Medication adherence log (one row per medication per day)
CREATE TABLE medication_adherence_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_medication_id UUID      NOT NULL REFERENCES patient_medications(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    taken               BOOLEAN     NOT NULL,
    taken_at            TIMESTAMPTZ,                -- actual time if patient logs it
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, patient_medication_id)
);

CREATE INDEX idx_med_adherence_patient_date ON medication_adherence_logs(patient_id, entry_date DESC);
CREATE INDEX idx_med_adherence_taken ON medication_adherence_logs(patient_medication_id, taken);


-- =============================================================================
-- SECTION 4 — WELLNESS STRATEGIES
-- =============================================================================

-- Catalogue of wellness strategies (system-defined + patient custom)
CREATE TABLE wellness_strategies (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),  -- NULL = global
    patient_id          UUID        REFERENCES patients(id),       -- NULL = shared/system
    name                TEXT        NOT NULL,
    category            TEXT        NOT NULL CHECK (category IN (
                            'physical', 'social', 'mental', 'behavioural', 'nutritional', 'custom'
                        )),
    icon_key            TEXT,                       -- maps to an emoji or icon identifier in the app
    has_quality_rating  BOOLEAN     NOT NULL DEFAULT FALSE,  -- whether a 1–10 quality slider is shown
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    is_system           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN wellness_strategies.patient_id IS 'Set for patient-created custom strategies; NULL for system/org strategies.';

CREATE INDEX idx_wellness_strategies_org ON wellness_strategies(organisation_id) WHERE patient_id IS NULL;
CREATE INDEX idx_wellness_strategies_patient ON wellness_strategies(patient_id) WHERE patient_id IS NOT NULL;


-- Which strategies each patient tracks (their personal list)
CREATE TABLE patient_wellness_strategies (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    strategy_id         UUID        NOT NULL REFERENCES wellness_strategies(id) ON DELETE CASCADE,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at          TIMESTAMPTZ,
    UNIQUE (patient_id, strategy_id)
);

CREATE INDEX idx_pws_patient ON patient_wellness_strategies(patient_id) WHERE removed_at IS NULL;


-- Daily wellness log entries (one row per strategy per day)
CREATE TABLE wellness_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    strategy_id         UUID        NOT NULL REFERENCES wellness_strategies(id),
    entry_date          DATE        NOT NULL,
    state               TEXT        NOT NULL CHECK (state IN ('yes', 'no', 'na')),
    quality             SMALLINT    CHECK (quality BETWEEN 1 AND 10),  -- only set when state = 'yes' and strategy has_quality_rating
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, strategy_id)
);

CREATE INDEX idx_wellness_logs_patient_date ON wellness_logs(patient_id, entry_date DESC);
CREATE INDEX idx_wellness_logs_strategy ON wellness_logs(strategy_id, state);


-- =============================================================================
-- SECTION 5 — TRIGGERS
-- =============================================================================

-- Trigger catalogue (system-defined + patient custom)
CREATE TABLE trigger_catalogue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),
    patient_id          UUID        REFERENCES patients(id),
    name                TEXT        NOT NULL,
    category            TEXT        NOT NULL CHECK (category IN (
                            'work_home', 'behavioural', 'life_events', 'health', 'relationship', 'custom'
                        )),
    icon_key            TEXT,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    is_system           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trigger_catalogue_org ON trigger_catalogue(organisation_id) WHERE patient_id IS NULL;


-- Which triggers each patient monitors
CREATE TABLE patient_triggers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    trigger_id          UUID        NOT NULL REFERENCES trigger_catalogue(id) ON DELETE CASCADE,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at          TIMESTAMPTZ,
    UNIQUE (patient_id, trigger_id)
);

CREATE INDEX idx_patient_triggers_patient ON patient_triggers(patient_id) WHERE removed_at IS NULL;


-- Daily trigger log (one row per trigger per day)
CREATE TABLE trigger_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    trigger_id          UUID        NOT NULL REFERENCES trigger_catalogue(id),
    entry_date          DATE        NOT NULL,
    is_active           BOOLEAN     NOT NULL,           -- TRUE = present today; FALSE/absent = 'na'
    severity            SMALLINT    CHECK (severity BETWEEN 1 AND 10),  -- only set when is_active = TRUE
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, trigger_id)
);

CREATE INDEX idx_trigger_logs_patient_date ON trigger_logs(patient_id, entry_date DESC);
CREATE INDEX idx_trigger_logs_active ON trigger_logs(trigger_id, is_active) WHERE is_active = TRUE;


-- =============================================================================
-- SECTION 6 — SYMPTOMS & SAFETY
-- =============================================================================

-- Symptom catalogue
CREATE TABLE symptom_catalogue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),
    patient_id          UUID        REFERENCES patients(id),
    name                TEXT        NOT NULL,
    category            TEXT        NOT NULL CHECK (category IN (
                            'mood', 'cognitive', 'physical', 'behavioural', 'safety', 'custom'
                        )),
    is_safety_symptom   BOOLEAN     NOT NULL DEFAULT FALSE,  -- special handling for suicidal ideation etc.
    icon_key            TEXT,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    is_system           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN symptom_catalogue.is_safety_symptom IS 'TRUE triggers an immediate clinical alert and safety resource card in the patient app.';

CREATE INDEX idx_symptom_catalogue_safety ON symptom_catalogue(organisation_id) WHERE is_safety_symptom = TRUE;


-- Which symptoms each patient monitors
CREATE TABLE patient_symptoms (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    symptom_id          UUID        NOT NULL REFERENCES symptom_catalogue(id) ON DELETE CASCADE,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at          TIMESTAMPTZ,
    UNIQUE (patient_id, symptom_id)
);

CREATE INDEX idx_patient_symptoms_patient ON patient_symptoms(patient_id) WHERE removed_at IS NULL;


-- Daily symptom log (one row per symptom per day)
CREATE TABLE symptom_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    symptom_id          UUID        NOT NULL REFERENCES symptom_catalogue(id),
    entry_date          DATE        NOT NULL,
    is_present          BOOLEAN     NOT NULL,
    intensity           SMALLINT    CHECK (intensity BETWEEN 1 AND 10),  -- only when is_present = TRUE
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, symptom_id)
);

CREATE INDEX idx_symptom_logs_patient_date ON symptom_logs(patient_id, entry_date DESC);
CREATE INDEX idx_symptom_logs_present ON symptom_logs(symptom_id, is_present) WHERE is_present = TRUE;


-- Safety events — raised whenever a safety symptom is logged as present
-- Separated from symptom_logs for stricter access control and audit
CREATE TABLE safety_events (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    symptom_log_id      UUID        NOT NULL REFERENCES symptom_logs(id) ON DELETE RESTRICT,
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE RESTRICT,
    entry_date          DATE        NOT NULL,
    intensity           SMALLINT    CHECK (intensity BETWEEN 1 AND 10),
    -- Response tracking
    alert_raised_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_id            UUID,                       -- FK to clinical_alerts (set after insert)
    acknowledged_by     UUID        REFERENCES clinicians(id),
    acknowledged_at     TIMESTAMPTZ,
    response_notes      TEXT,
    crisis_protocol_activated BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE safety_events IS 'High-sensitivity table. Row-level security should restrict read access to care team only.';

CREATE INDEX idx_safety_events_patient ON safety_events(patient_id, entry_date DESC);
CREATE INDEX idx_safety_events_unresolved ON safety_events(patient_id) WHERE resolved_at IS NULL;


-- =============================================================================
-- SECTION 7 — JOURNAL
-- =============================================================================

-- Journal prompts (rotated daily; can be org-specific)
CREATE TABLE journal_prompts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),  -- NULL = global
    prompt_text         TEXT        NOT NULL,
    category            TEXT        CHECK (category IN (
                            'gratitude', 'reflection', 'coping', 'goals', 'general'
                        )),
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Journal entries (one per patient per day; rich text stored as plain text or markdown)
CREATE TABLE journal_entries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL UNIQUE REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    prompt_id           UUID        REFERENCES journal_prompts(id),
    body                TEXT,                       -- plaintext or markdown
    body_format         TEXT        NOT NULL DEFAULT 'markdown' CHECK (body_format IN ('plain', 'markdown')),
    word_count          INTEGER     NOT NULL DEFAULT 0,
    input_method        TEXT        CHECK (input_method IN ('keyboard', 'voice', 'imported')),
    -- Clinician visibility
    shared_with_clinician BOOLEAN   NOT NULL DEFAULT FALSE,
    shared_at           TIMESTAMPTZ,
    -- Encryption flag (body may be E2E encrypted at rest)
    is_encrypted        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN journal_entries.shared_with_clinician IS 'Patient explicitly consents to share this entry. FALSE by default — clinicians cannot read journals without patient consent.';
COMMENT ON COLUMN journal_entries.is_encrypted IS 'When TRUE, body field contains ciphertext and cannot be searched or analysed server-side.';

CREATE INDEX idx_journal_entries_patient_date ON journal_entries(patient_id, entry_date DESC);
CREATE INDEX idx_journal_entries_shared ON journal_entries(patient_id) WHERE shared_with_clinician = TRUE;


-- =============================================================================
-- SECTION 8 — ALERTS & NOTIFICATIONS
-- =============================================================================

-- Clinical alerts (auto-generated by rules engine; surfaced in clinician dashboard)
CREATE TABLE clinical_alerts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    -- Alert classification
    alert_type          TEXT        NOT NULL CHECK (alert_type IN (
                            'missed_checkin',
                            'mood_decline',
                            'safety_flag',
                            'trigger_escalation',
                            'med_nonadherence',
                            'symptom_emergence',
                            'streak_broken',
                            'risk_level_change',
                            'appointment_reminder',
                            'custom'
                        )),
    severity            TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title               TEXT        NOT NULL,
    body                TEXT        NOT NULL,
    -- Source linkage (what caused this alert)
    source_table        TEXT,                       -- 'daily_entries', 'safety_events', etc.
    source_id           UUID,                       -- id in source_table
    source_date         DATE,
    -- Rule that fired
    rule_key            TEXT,                       -- e.g. 'mood_decline_3day', 'missed_checkin_5day'
    rule_context        JSONB,                      -- parameters used by the rule at time of firing
    -- Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    auto_resolved       BOOLEAN     NOT NULL DEFAULT FALSE,
    auto_resolved_at    TIMESTAMPTZ,
    -- Acknowledgement
    acknowledged_by     UUID        REFERENCES clinicians(id),
    acknowledged_at     TIMESTAMPTZ,
    acknowledgement_note TEXT,
    -- Escalation
    escalated_to        UUID        REFERENCES clinicians(id),
    escalated_at        TIMESTAMPTZ
);

COMMENT ON TABLE clinical_alerts IS 'Generated by the rules engine (background job). Severity = critical requires acknowledgement.';
COMMENT ON COLUMN clinical_alerts.rule_context IS 'Snapshot of computed values at time of alert, e.g. {mood_7d_avg: 3.2, baseline: 6.5, delta: -3.3}.';

CREATE INDEX idx_clinical_alerts_patient ON clinical_alerts(patient_id, created_at DESC);
CREATE INDEX idx_clinical_alerts_org_unack ON clinical_alerts(organisation_id)
    WHERE acknowledged_at IS NULL AND auto_resolved = FALSE;
CREATE INDEX idx_clinical_alerts_severity ON clinical_alerts(severity, created_at DESC)
    WHERE acknowledged_at IS NULL;


-- Alert routing (which clinicians receive which alerts for which patients)
CREATE TABLE alert_routing_rules (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    patient_id          UUID        REFERENCES patients(id),   -- NULL = all patients on their list
    alert_type          TEXT,                                   -- NULL = all types
    min_severity        TEXT        NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('info', 'warning', 'critical')),
    channel             TEXT        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_routing_clinician ON alert_routing_rules(clinician_id) WHERE is_active = TRUE;


-- Patient notification preferences (for their own app notifications)
CREATE TABLE patient_notification_preferences (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
    daily_reminder_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
    daily_reminder_time TIME        NOT NULL DEFAULT '20:00:00',
    medication_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    med_reminder_morning TIME       DEFAULT '08:00:00',
    med_reminder_evening TIME       DEFAULT '20:00:00',
    streak_notifications BOOLEAN    NOT NULL DEFAULT TRUE,
    appointment_reminders BOOLEAN   NOT NULL DEFAULT TRUE,
    push_token          TEXT,                       -- FCM or APNs token
    push_token_updated_at TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 9 — CLINICAL WORKFLOW
-- =============================================================================

-- Clinician notes on patients
CREATE TABLE clinician_notes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    note_type           TEXT        NOT NULL CHECK (note_type IN (
                            'observation', 'intervention', 'appointment_summary',
                            'risk_assessment', 'handover', 'custom'
                        )),
    body                TEXT        NOT NULL,
    -- Optional linkage to a specific day's entry
    linked_date         DATE,
    linked_entry_id     UUID        REFERENCES daily_entries(id),
    -- Visibility
    is_private          BOOLEAN     NOT NULL DEFAULT FALSE,     -- private = only author can see
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_clinician_notes_patient ON clinician_notes(patient_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_clinician_notes_clinician ON clinician_notes(clinician_id, created_at DESC) WHERE deleted_at IS NULL;


-- Appointments
CREATE TABLE appointments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    scheduled_at        TIMESTAMPTZ NOT NULL,
    duration_minutes    SMALLINT    NOT NULL DEFAULT 50,
    appointment_type    TEXT        NOT NULL CHECK (appointment_type IN (
                            'initial_assessment', 'review', 'crisis', 'medication_review',
                            'therapy', 'group', 'telehealth', 'other'
                        )),
    location            TEXT,
    telehealth_url      TEXT,
    status              TEXT        NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'confirmed', 'attended', 'dna', 'cancelled', 'rescheduled')),
    reminder_sent_at    TIMESTAMPTZ,
    notes               TEXT,
    created_by          UUID        REFERENCES clinicians(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_patient ON appointments(patient_id, scheduled_at DESC);
CREATE INDEX idx_appointments_clinician ON appointments(clinician_id, scheduled_at)
    WHERE status IN ('scheduled', 'confirmed');


-- Clinical reports (generated on demand or scheduled)
CREATE TABLE clinical_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        REFERENCES patients(id),        -- NULL for population reports
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    report_type         TEXT        NOT NULL CHECK (report_type IN (
                            'individual_patient', 'population_summary', 'handover', 'custom'
                        )),
    title               TEXT        NOT NULL,
    date_range_start    DATE,
    date_range_end      DATE,
    parameters          JSONB,                      -- filter/config used to generate
    status              TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    file_url            TEXT,                       -- signed S3 URL
    file_size_bytes     INTEGER,
    generated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,                -- URL expiry
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinical_reports_patient ON clinical_reports(patient_id, created_at DESC);
CREATE INDEX idx_clinical_reports_clinician ON clinical_reports(clinician_id, created_at DESC);


-- =============================================================================
-- SECTION 10 — ANALYTICS & AGGREGATIONS
-- =============================================================================

-- Nightly population snapshots (pre-aggregated for fast dashboard load)
CREATE TABLE population_snapshots (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    clinician_id        UUID        REFERENCES clinicians(id),      -- NULL = org-wide; set = clinician's caseload
    snapshot_date       DATE        NOT NULL,
    -- Counts
    total_patients      SMALLINT    NOT NULL,
    active_patients     SMALLINT    NOT NULL,                       -- checked in today
    crisis_patients     SMALLINT    NOT NULL DEFAULT 0,
    -- Averages (scaled x10 to avoid float, e.g. 64 = 6.4)
    avg_mood_x10        SMALLINT,
    avg_coping_x10      SMALLINT,
    avg_sleep_minutes   SMALLINT,
    avg_exercise_minutes SMALLINT,
    -- Risk distribution
    risk_critical_count SMALLINT    NOT NULL DEFAULT 0,
    risk_high_count     SMALLINT    NOT NULL DEFAULT 0,
    risk_moderate_count SMALLINT    NOT NULL DEFAULT 0,
    risk_low_count      SMALLINT    NOT NULL DEFAULT 0,
    -- Alerts
    critical_alerts_count SMALLINT  NOT NULL DEFAULT 0,
    warning_alerts_count  SMALLINT  NOT NULL DEFAULT 0,
    -- Engagement
    med_adherence_pct   SMALLINT    CHECK (med_adherence_pct BETWEEN 0 AND 100),
    checkin_rate_pct    SMALLINT    CHECK (checkin_rate_pct BETWEEN 0 AND 100),
    -- Serialised distributions (for chart rendering without query)
    mood_distribution   JSONB,                      -- [{bucket: 1, count: 2}, ...]
    top_triggers        JSONB,                      -- [{trigger_id, name, count, prevalence_pct}, ...]
    top_symptoms        JSONB,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organisation_id, clinician_id, snapshot_date)
);

COMMENT ON TABLE population_snapshots IS 'Pre-aggregated nightly. Clinician dashboard reads from here rather than scanning raw logs.';
COMMENT ON COLUMN population_snapshots.avg_mood_x10 IS 'Stored as integer x10 to avoid NUMERIC precision issues. Divide by 10 in application.';

CREATE INDEX idx_pop_snapshots_org_date ON population_snapshots(organisation_id, snapshot_date DESC);
CREATE INDEX idx_pop_snapshots_clinician_date ON population_snapshots(clinician_id, snapshot_date DESC)
    WHERE clinician_id IS NOT NULL;


-- Correlation cache (per patient; recomputed weekly)
-- Stores the "what moves the needle" data shown in patient Insights screen
CREATE TABLE patient_correlation_cache (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    factor_type         TEXT        NOT NULL CHECK (factor_type IN (
                            'wellness_strategy', 'trigger', 'sleep_above_target',
                            'exercise_above_threshold', 'medication_adherent'
                        )),
    factor_id           UUID,                       -- strategy_id, trigger_id, etc.
    factor_label        TEXT        NOT NULL,
    mood_delta_x10      SMALLINT    NOT NULL,        -- mood change, x10, signed (e.g. +18 = +1.8)
    sample_size         SMALLINT    NOT NULL,        -- days in the comparison
    window_days         SMALLINT    NOT NULL DEFAULT 30,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (patient_id, factor_type, factor_id, window_days)
);

CREATE INDEX idx_correlation_cache_patient ON patient_correlation_cache(patient_id, mood_delta_x10 DESC);


-- =============================================================================
-- SECTION 11 — AUDIT, CONSENT & DATA GOVERNANCE
-- =============================================================================

-- Immutable audit log for all sensitive data access and mutations
CREATE TABLE audit_log (
    id                  BIGSERIAL   PRIMARY KEY,    -- sequential for efficient append
    organisation_id     UUID        NOT NULL,
    actor_type          TEXT        NOT NULL CHECK (actor_type IN ('clinician', 'patient', 'system', 'admin')),
    actor_id            UUID        NOT NULL,
    action              TEXT        NOT NULL CHECK (action IN (
                            'read', 'create', 'update', 'delete',
                            'export', 'share', 'acknowledge', 'login', 'logout',
                            'consent_granted', 'consent_revoked'
                        )),
    resource_type       TEXT        NOT NULL,       -- table name: 'patients', 'journal_entries', etc.
    resource_id         UUID,
    patient_id          UUID,                       -- denormalised for fast patient-centric queries
    -- Request context
    ip_address          INET,
    user_agent          TEXT,
    session_id          TEXT,
    -- Change data
    old_values          JSONB,
    new_values          JSONB,
    -- Outcome
    success             BOOLEAN     NOT NULL DEFAULT TRUE,
    failure_reason      TEXT,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Append-only. No UPDATE or DELETE should ever touch this table. Partition by occurred_at monthly for scale.';
COMMENT ON COLUMN audit_log.old_values IS 'Previous field values for updates; NULL for creates. PII should be hashed in long-term storage.';

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_log_patient ON audit_log(patient_id, occurred_at DESC) WHERE patient_id IS NOT NULL;
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, occurred_at DESC);
-- Partition candidate: CREATE INDEX idx_audit_log_time ON audit_log(occurred_at DESC);


-- Consent records (patient consent to share data with clinicians / researchers)
CREATE TABLE consent_records (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    consent_type        TEXT        NOT NULL CHECK (consent_type IN (
                            'share_with_clinician',
                            'share_journal_with_clinician',
                            'research_participation',
                            'data_export',
                            'push_notifications',
                            'terms_of_service',
                            'privacy_policy'
                        )),
    granted             BOOLEAN     NOT NULL,
    -- Who and what was consented to
    granted_to_clinician_id UUID    REFERENCES clinicians(id),
    granted_to_organisation_id UUID REFERENCES organisations(id),
    -- Legal/compliance
    consent_version     TEXT        NOT NULL,       -- version of the consent document shown
    consent_text_snapshot TEXT,                     -- exact text shown at time of consent
    ip_address          INET,
    -- Lifecycle
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      TEXT
);

COMMENT ON TABLE consent_records IS 'Immutable consent history. To revoke, insert a new row with granted = FALSE; never update old rows.';

CREATE INDEX idx_consent_patient ON consent_records(patient_id, consent_type, granted_at DESC);
CREATE INDEX idx_consent_active ON consent_records(patient_id, consent_type)
    WHERE granted = TRUE AND revoked_at IS NULL;


-- Data export requests (GDPR/Privacy Act right to data portability)
CREATE TABLE data_export_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id),
    requested_by        UUID        NOT NULL REFERENCES patients(id),  -- self-request
    format              TEXT        NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
    date_range_start    DATE,
    date_range_end      DATE,
    status              TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'ready', 'downloaded', 'expired', 'failed')),
    file_url            TEXT,
    file_size_bytes     INTEGER,
    generated_at        TIMESTAMPTZ,
    downloaded_at       TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- TRIGGERS & FUNCTIONS
-- =============================================================================

-- Auto-update updated_at on any table that has it
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'organisations', 'clinicians', 'patients',
        'patient_diagnoses', 'patient_medications',
        'daily_entries', 'sleep_logs', 'exercise_logs',
        'wellness_logs', 'trigger_logs', 'symptom_logs',
        'journal_entries', 'clinician_notes', 'appointments',
        'patient_notification_preferences'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;


-- Auto-update daily_entry completion_pct when child tables change
CREATE OR REPLACE FUNCTION recompute_entry_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_entry daily_entries%ROWTYPE;
    v_pct   SMALLINT;
BEGIN
    SELECT * INTO v_entry FROM daily_entries WHERE id = NEW.daily_entry_id;

    -- Simple weighted formula: each section = 20%
    v_pct := (
        (CASE WHEN v_entry.core_complete     THEN 20 ELSE 0 END) +
        (CASE WHEN v_entry.wellness_complete  THEN 20 ELSE 0 END) +
        (CASE WHEN v_entry.triggers_complete  THEN 20 ELSE 0 END) +
        (CASE WHEN v_entry.symptoms_complete  THEN 20 ELSE 0 END) +
        (CASE WHEN v_entry.journal_complete   THEN 20 ELSE 0 END)
    );

    UPDATE daily_entries
       SET completion_pct = v_pct,
           last_saved_at  = NOW()
     WHERE id = NEW.daily_entry_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wellness_log_completion
    AFTER INSERT OR UPDATE ON wellness_logs
    FOR EACH ROW EXECUTE FUNCTION recompute_entry_completion();

CREATE TRIGGER trg_symptom_log_completion
    AFTER INSERT OR UPDATE ON symptom_logs
    FOR EACH ROW EXECUTE FUNCTION recompute_entry_completion();


-- Auto-raise a safety_event and clinical_alert when a safety symptom is logged as present
CREATE OR REPLACE FUNCTION handle_safety_symptom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_is_safety BOOLEAN;
    v_alert_id  UUID;
    v_patient_name TEXT;
BEGIN
    -- Only act on safety symptoms that are newly present
    IF NEW.is_present = FALSE OR (TG_OP = 'UPDATE' AND OLD.is_present = TRUE) THEN
        RETURN NEW;
    END IF;

    SELECT is_safety_symptom INTO v_is_safety
      FROM symptom_catalogue WHERE id = NEW.symptom_id;

    IF NOT v_is_safety THEN
        RETURN NEW;
    END IF;

    -- Insert clinical alert
    SELECT first_name || ' ' || last_name INTO v_patient_name FROM patients WHERE id = NEW.patient_id;

    INSERT INTO clinical_alerts (
        patient_id, organisation_id, alert_type, severity,
        title, body, source_table, source_id, source_date, rule_key
    )
    SELECT
        NEW.patient_id,
        p.organisation_id,
        'safety_flag',
        'critical',
        v_patient_name || ' reported suicidal ideation',
        'Patient logged a safety symptom (intensity ' || COALESCE(NEW.intensity::TEXT, '—') || '/10). Immediate clinical review required.',
        'symptom_logs',
        NEW.id,
        NEW.entry_date,
        'safety_symptom_present'
    FROM patients p WHERE p.id = NEW.patient_id
    RETURNING id INTO v_alert_id;

    -- Insert safety event
    INSERT INTO safety_events (
        patient_id, symptom_log_id, daily_entry_id, entry_date, intensity, alert_id
    ) VALUES (
        NEW.patient_id, NEW.id, NEW.daily_entry_id, NEW.entry_date, NEW.intensity, v_alert_id
    );

    -- Update patient status to crisis
    UPDATE patients SET status = 'crisis', updated_at = NOW() WHERE id = NEW.patient_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_symptom
    AFTER INSERT OR UPDATE ON symptom_logs
    FOR EACH ROW EXECUTE FUNCTION handle_safety_symptom();


-- =============================================================================
-- VIEWS
-- =============================================================================

-- Clinician's active caseload with today's entry status
CREATE VIEW v_caseload_today AS
SELECT
    p.id                            AS patient_id,
    p.mrn,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.gender,
    p.status,
    p.risk_level,
    p.tracking_streak,
    p.last_checkin_at,
    ctm.clinician_id,
    ctm.role                        AS care_team_role,
    de.id                           AS todays_entry_id,
    de.mood                         AS todays_mood,
    de.coping                       AS todays_coping,
    de.completion_pct               AS todays_completion_pct,
    de.submitted_at                 AS todays_submitted_at,
    sl.total_minutes                AS todays_sleep_minutes,
    el.duration_minutes             AS todays_exercise_minutes,
    (SELECT COUNT(*) FROM clinical_alerts ca
        WHERE ca.patient_id = p.id
          AND ca.acknowledged_at IS NULL
          AND ca.auto_resolved = FALSE)  AS unacknowledged_alert_count,
    (SELECT MAX(ca.severity)
        FROM clinical_alerts ca
        WHERE ca.patient_id = p.id
          AND ca.acknowledged_at IS NULL
          AND ca.auto_resolved = FALSE)  AS highest_alert_severity
FROM patients p
JOIN care_team_members ctm ON ctm.patient_id = p.id AND ctm.unassigned_at IS NULL
LEFT JOIN daily_entries de  ON de.patient_id = p.id AND de.entry_date = CURRENT_DATE
LEFT JOIN sleep_logs sl     ON sl.daily_entry_id = de.id
LEFT JOIN exercise_logs el  ON el.daily_entry_id = de.id
WHERE p.is_active = TRUE;

COMMENT ON VIEW v_caseload_today IS 'Primary read target for the clinician population dashboard. One row per patient per clinician on their care team.';


-- 30-day mood trend per patient (for heatmap)
CREATE VIEW v_mood_heatmap_30d AS
SELECT
    p.id                AS patient_id,
    p.first_name,
    p.last_name,
    gs.d                AS entry_date,
    de.mood,
    de.completion_pct,
    CASE WHEN EXISTS (
        SELECT 1 FROM safety_events se
        WHERE se.patient_id = p.id AND se.entry_date = gs.d
          AND se.resolved_at IS NULL
    ) THEN TRUE ELSE FALSE END  AS has_safety_flag
FROM patients p
CROSS JOIN LATERAL generate_series(
    CURRENT_DATE - INTERVAL '29 days',
    CURRENT_DATE,
    INTERVAL '1 day'
) AS gs(d)
LEFT JOIN daily_entries de ON de.patient_id = p.id AND de.entry_date = gs.d
WHERE p.is_active = TRUE;

COMMENT ON VIEW v_mood_heatmap_30d IS 'Returns one row per patient per day for the last 30 days, including NULL mood where no entry exists.';


-- =============================================================================
-- ROW-LEVEL SECURITY POLICIES (templates)
-- =============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE patients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_notes     ENABLE ROW LEVEL SECURITY;

-- Clinicians can only read patients on their active care team
-- (Assumes current_setting('app.clinician_id') is set at connection time)
CREATE POLICY clinician_reads_own_patients ON patients
    FOR SELECT
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM care_team_members ctm
            WHERE ctm.patient_id = patients.id
              AND ctm.clinician_id = current_setting('app.clinician_id', TRUE)::UUID
              AND ctm.unassigned_at IS NULL
        )
    );

-- Patients can only read and write their own entries
CREATE POLICY patient_owns_entries ON daily_entries
    FOR ALL
    TO PUBLIC
    USING (patient_id = current_setting('app.patient_id', TRUE)::UUID);

-- Journal entries are private unless patient explicitly shared
CREATE POLICY clinician_reads_shared_journals ON journal_entries
    FOR SELECT
    TO PUBLIC
    USING (
        patient_id = current_setting('app.patient_id', TRUE)::UUID
        OR (
            shared_with_clinician = TRUE
            AND EXISTS (
                SELECT 1 FROM care_team_members ctm
                WHERE ctm.patient_id = journal_entries.patient_id
                  AND ctm.clinician_id = current_setting('app.clinician_id', TRUE)::UUID
                  AND ctm.unassigned_at IS NULL
            )
        )
    );

-- Safety events are restricted to care team and org admins
CREATE POLICY care_team_reads_safety_events ON safety_events
    FOR SELECT
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM care_team_members ctm
            WHERE ctm.patient_id = safety_events.patient_id
              AND ctm.clinician_id = current_setting('app.clinician_id', TRUE)::UUID
              AND ctm.unassigned_at IS NULL
        )
    );


-- =============================================================================
-- SEED: SYSTEM WELLNESS STRATEGIES
-- =============================================================================

INSERT INTO wellness_strategies (name, category, icon_key, has_quality_rating, display_order, is_system) VALUES
('Adequate Sleep',            'physical',    'sleep',         TRUE,  10, TRUE),
('Exercise',                  'physical',    'exercise',      FALSE, 20, TRUE),
('Relaxation / Meditation',   'physical',    'meditation',    FALSE, 30, TRUE),
('Healthy Meals',             'nutritional', 'meals',         FALSE, 40, TRUE),
('Plenty of Water',           'nutritional', 'water',         FALSE, 50, TRUE),
('Minimal Caffeine',          'nutritional', 'caffeine',      FALSE, 60, TRUE),
('Minimal Alcohol',           'nutritional', 'alcohol',       FALSE, 70, TRUE),
('Professional Support',      'social',      'clinician',     FALSE, 80, TRUE),
('Social Support',            'social',      'social',        FALSE, 90, TRUE),
('Enjoyable Activities',      'mental',      'activities',    FALSE,100, TRUE),
('Time Outside',              'physical',    'outside',       FALSE,110, TRUE),
('Positive Thinking',         'mental',      'positive',      FALSE,120, TRUE),
('Routine Day',               'behavioural', 'routine',       FALSE,130, TRUE);


-- =============================================================================
-- SEED: SYSTEM TRIGGERS
-- =============================================================================

INSERT INTO trigger_catalogue (name, category, icon_key, display_order, is_system) VALUES
('Stress at Work',            'work_home',    'work',          10, TRUE),
('Stress at Home',            'work_home',    'home',          20, TRUE),
('Too Much To Do',            'work_home',    'todo',          30, TRUE),
('Relationship Problem',      'relationship', 'relationship',  40, TRUE),
('Arguing',                   'relationship', 'argue',         50, TRUE),
('Lack of Sleep',             'behavioural',  'sleep',         60, TRUE),
('Lack of Exercise',          'behavioural',  'exercise',      70, TRUE),
('Negative Self Talk',        'behavioural',  'self_talk',     80, TRUE),
('Alcohol Consumption',       'behavioural',  'alcohol',       90, TRUE),
('Poor Diet',                 'behavioural',  'diet',         100, TRUE),
('Medicine Not Taken',        'health',       'medicine',     110, TRUE),
('Ill-health or Pain',        'health',       'health',       120, TRUE),
('Difficult Life Changes',    'life_events',  'change',       130, TRUE),
('Workplace Changes',         'life_events',  'workplace',    140, TRUE),
('Change in Treatment',       'life_events',  'treatment',    150, TRUE),
('Financial Stress',          'work_home',    'finance',      160, TRUE),
('Social Isolation',          'relationship', 'isolation',    170, TRUE);


-- =============================================================================
-- SEED: SYSTEM SYMPTOMS
-- =============================================================================

INSERT INTO symptom_catalogue (name, category, icon_key, is_safety_symptom, display_order, is_system) VALUES
('Irritability',              'mood',         'irritability',  FALSE,  10, TRUE),
('Anger',                     'mood',         'anger',         FALSE,  20, TRUE),
('Sadness',                   'mood',         'sadness',       FALSE,  30, TRUE),
('Anxiety',                   'mood',         'anxiety',       FALSE,  40, TRUE),
('Feeling Guilty',            'mood',         'guilt',         FALSE,  50, TRUE),
('Feeling Hopeless',          'mood',         'hopeless',      FALSE,  60, TRUE),
('Feeling Worthless',         'cognitive',    'worthless',     FALSE,  70, TRUE),
('Negative Self Talk',        'cognitive',    'self_talk',     FALSE,  80, TRUE),
('Poor Concentration',        'cognitive',    'concentration', FALSE,  90, TRUE),
('Loss of Interest',          'behavioural',  'interest',      FALSE, 100, TRUE),
('Loss of Energy',            'physical',     'energy',        FALSE, 110, TRUE),
('Insufficient Sleep',        'physical',     'sleep_low',     FALSE, 120, TRUE),
('Excessive Sleep',           'physical',     'sleep_high',    FALSE, 130, TRUE),
('Increased Appetite',        'physical',     'appetite_up',   FALSE, 140, TRUE),
('Decreased Appetite',        'physical',     'appetite_down', FALSE, 150, TRUE),
('Suicidal Thoughts',         'safety',       'safety',        TRUE,  999, TRUE);

COMMENT ON TABLE symptom_catalogue IS 'Suicidal Thoughts has is_safety_symptom = TRUE. This triggers handle_safety_symptom() on insert.';
