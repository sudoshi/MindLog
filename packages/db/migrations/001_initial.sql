-- =============================================================================
-- MindLog — Migration 001: Initial Schema
-- PostgreSQL 15+
-- Run via: npm run db:migrate (from packages/db)
-- =============================================================================
-- NOTE: Market is United States (US). References to AU locale/regulatory bodies
-- in comments have been superseded by DECISIONS.md. See market correction section.
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy search on patient names
CREATE EXTENSION IF NOT EXISTS "btree_gist";    -- date range exclusion constraints

-- =============================================================================
-- SECTION 1 — IDENTITY & AUTH
-- =============================================================================

CREATE TABLE organisations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL,
    type                TEXT        NOT NULL CHECK (type IN ('hospital', 'clinic', 'private_practice', 'research')),
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    state               CHAR(2),                    -- US state abbreviation (e.g. 'CA', 'NY')
    country             CHAR(2)     NOT NULL DEFAULT 'US',
    timezone            TEXT        NOT NULL DEFAULT 'America/New_York',
    locale              TEXT        NOT NULL DEFAULT 'en-US',
    logo_url            TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organisations IS 'Top-level tenant. All clinicians and patients belong to one organisation.';
COMMENT ON COLUMN organisations.state IS 'US state abbreviation. Required for US deployments.';


CREATE TABLE clinicians (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    email               TEXT        NOT NULL UNIQUE,
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    title               TEXT,                       -- Dr, Prof, Mr, Ms, etc.
    role                TEXT        NOT NULL CHECK (role IN (
                            'psychiatrist', 'psychologist', 'gp',
                            'care_coordinator', 'nurse', 'researcher', 'admin'
                        )),
    npi                 TEXT,                       -- National Provider Identifier (US)
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

COMMENT ON TABLE clinicians IS 'Licensed clinical practitioners. Auth managed via Supabase Auth (auth.users). NPI for US practitioners.';
COMMENT ON COLUMN clinicians.npi IS 'National Provider Identifier — US regulatory requirement for billing and identity.';

CREATE INDEX idx_clinicians_org ON clinicians(organisation_id);
CREATE INDEX idx_clinicians_email ON clinicians(email);


CREATE TABLE patients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    mrn                 TEXT        NOT NULL,       -- Medical Record Number (unique per org)
    email               TEXT        UNIQUE,
    phone               TEXT,
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    preferred_name      TEXT,
    date_of_birth       DATE        NOT NULL,
    gender              TEXT        CHECK (gender IN ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say')),
    gender_other        TEXT,
    timezone            TEXT        NOT NULL DEFAULT 'America/New_York',
    locale              TEXT        NOT NULL DEFAULT 'en-US',
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
    tracking_streak     INTEGER     NOT NULL DEFAULT 0,
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

COMMENT ON TABLE patients IS 'Patient identity record. 18+ only for v1.0 (see DECISIONS.md OQ-005). US market.';

CREATE INDEX idx_patients_org ON patients(organisation_id);
CREATE INDEX idx_patients_status ON patients(status) WHERE is_active = TRUE;
CREATE INDEX idx_patients_risk ON patients(risk_level) WHERE is_active = TRUE;
CREATE INDEX idx_patients_name_trgm ON patients USING gin((first_name || ' ' || last_name) gin_trgm_ops);


-- =============================================================================
-- SECTION 2 — CLINICAL SETUP
-- =============================================================================

CREATE TABLE icd10_codes (
    code                TEXT        PRIMARY KEY,
    description         TEXT        NOT NULL,
    chapter             TEXT,
    block               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE
);


CREATE TABLE patient_diagnoses (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    icd10_code          TEXT        NOT NULL REFERENCES icd10_codes(code),
    description_override TEXT,
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


CREATE TABLE medications_catalogue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name        TEXT        NOT NULL,
    brand_names         TEXT[],
    drug_class          TEXT,
    typical_dose_unit   TEXT,
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_med_catalogue_name_trgm ON medications_catalogue USING gin(generic_name gin_trgm_ops);


CREATE TABLE patient_medications (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    catalogue_id        UUID        REFERENCES medications_catalogue(id),
    medication_name     TEXT        NOT NULL,
    dose                NUMERIC(8,3),
    dose_unit           TEXT        DEFAULT 'mg',
    frequency           TEXT        NOT NULL CHECK (frequency IN (
                            'once_daily_morning', 'once_daily_evening', 'once_daily_bedtime',
                            'twice_daily', 'three_times_daily', 'as_needed', 'weekly', 'other'
                        )),
    frequency_other     TEXT,
    instructions        TEXT,
    prescribed_by       UUID        REFERENCES clinicians(id),
    prescribed_at       DATE,
    discontinued_at     DATE,
    discontinuation_reason TEXT,
    show_in_app         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_medications_patient ON patient_medications(patient_id) WHERE discontinued_at IS NULL;


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
-- SECTION 3 — DAILY ENTRIES
-- =============================================================================

CREATE TABLE daily_entries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    mood                SMALLINT    CHECK (mood BETWEEN 1 AND 10),
    coping              SMALLINT    CHECK (coping BETWEEN 1 AND 10),
    completion_pct      SMALLINT    NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
    core_complete       BOOLEAN     NOT NULL DEFAULT FALSE,
    wellness_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    triggers_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    symptoms_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
    journal_complete    BOOLEAN     NOT NULL DEFAULT FALSE,
    started_at          TIMESTAMPTZ,
    last_saved_at       TIMESTAMPTZ,
    submitted_at        TIMESTAMPTZ,
    device_platform     TEXT        CHECK (device_platform IN ('ios', 'android', 'web')),
    app_version         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (patient_id, entry_date)
);

CREATE INDEX idx_daily_entries_patient_date ON daily_entries(patient_id, entry_date DESC);
CREATE INDEX idx_daily_entries_date ON daily_entries(entry_date);
CREATE INDEX idx_daily_entries_mood ON daily_entries(patient_id, mood) WHERE mood IS NOT NULL;


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

CREATE INDEX idx_sleep_logs_patient_date ON sleep_logs(patient_id, entry_date DESC);


CREATE TABLE exercise_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL UNIQUE REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    duration_minutes    SMALLINT    NOT NULL DEFAULT 0 CHECK (duration_minutes BETWEEN 0 AND 600),
    exercise_type       TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercise_logs_patient_date ON exercise_logs(patient_id, entry_date DESC);


CREATE TABLE medication_adherence_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_medication_id UUID      NOT NULL REFERENCES patient_medications(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    taken               BOOLEAN     NOT NULL,
    taken_at            TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, patient_medication_id)
);

CREATE INDEX idx_med_adherence_patient_date ON medication_adherence_logs(patient_id, entry_date DESC);
CREATE INDEX idx_med_adherence_taken ON medication_adherence_logs(patient_medication_id, taken);


-- =============================================================================
-- SECTION 4 — WELLNESS STRATEGIES
-- =============================================================================

CREATE TABLE wellness_strategies (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),
    patient_id          UUID        REFERENCES patients(id),
    name                TEXT        NOT NULL,
    category            TEXT        NOT NULL CHECK (category IN (
                            'physical', 'social', 'mental', 'behavioural', 'nutritional', 'custom'
                        )),
    icon_key            TEXT,
    has_quality_rating  BOOLEAN     NOT NULL DEFAULT FALSE,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    is_system           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wellness_strategies_org ON wellness_strategies(organisation_id) WHERE patient_id IS NULL;
CREATE INDEX idx_wellness_strategies_patient ON wellness_strategies(patient_id) WHERE patient_id IS NOT NULL;


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


CREATE TABLE wellness_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    strategy_id         UUID        NOT NULL REFERENCES wellness_strategies(id),
    entry_date          DATE        NOT NULL,
    state               TEXT        NOT NULL CHECK (state IN ('yes', 'no', 'na')),
    quality             SMALLINT    CHECK (quality BETWEEN 1 AND 10),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, strategy_id)
);

CREATE INDEX idx_wellness_logs_patient_date ON wellness_logs(patient_id, entry_date DESC);
CREATE INDEX idx_wellness_logs_strategy ON wellness_logs(strategy_id, state);


-- =============================================================================
-- SECTION 5 — TRIGGERS
-- =============================================================================

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


CREATE TABLE trigger_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    trigger_id          UUID        NOT NULL REFERENCES trigger_catalogue(id),
    entry_date          DATE        NOT NULL,
    is_active           BOOLEAN     NOT NULL,
    severity            SMALLINT    CHECK (severity BETWEEN 1 AND 10),
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

CREATE TABLE symptom_catalogue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),
    patient_id          UUID        REFERENCES patients(id),
    name                TEXT        NOT NULL,
    category            TEXT        NOT NULL CHECK (category IN (
                            'mood', 'cognitive', 'physical', 'behavioural', 'safety', 'custom'
                        )),
    is_safety_symptom   BOOLEAN     NOT NULL DEFAULT FALSE,
    icon_key            TEXT,
    display_order       SMALLINT    NOT NULL DEFAULT 100,
    is_system           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN symptom_catalogue.is_safety_symptom IS 'TRUE triggers an immediate clinical alert and safety resource card showing 988 Suicide & Crisis Lifeline.';

CREATE INDEX idx_symptom_catalogue_safety ON symptom_catalogue(organisation_id) WHERE is_safety_symptom = TRUE;


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


CREATE TABLE symptom_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    symptom_id          UUID        NOT NULL REFERENCES symptom_catalogue(id),
    entry_date          DATE        NOT NULL,
    is_present          BOOLEAN     NOT NULL,
    intensity           SMALLINT    CHECK (intensity BETWEEN 1 AND 10),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (daily_entry_id, symptom_id)
);

CREATE INDEX idx_symptom_logs_patient_date ON symptom_logs(patient_id, entry_date DESC);
CREATE INDEX idx_symptom_logs_present ON symptom_logs(symptom_id, is_present) WHERE is_present = TRUE;


CREATE TABLE safety_events (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    symptom_log_id      UUID        NOT NULL REFERENCES symptom_logs(id) ON DELETE RESTRICT,
    daily_entry_id      UUID        NOT NULL REFERENCES daily_entries(id) ON DELETE RESTRICT,
    entry_date          DATE        NOT NULL,
    intensity           SMALLINT    CHECK (intensity BETWEEN 1 AND 10),
    alert_raised_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_id            UUID,
    acknowledged_by     UUID        REFERENCES clinicians(id),
    acknowledged_at     TIMESTAMPTZ,
    response_notes      TEXT,
    crisis_protocol_activated BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE safety_events IS 'High-sensitivity table. Restricted to care team via RLS. US crisis line: 988 Suicide & Crisis Lifeline.';

CREATE INDEX idx_safety_events_patient ON safety_events(patient_id, entry_date DESC);
CREATE INDEX idx_safety_events_unresolved ON safety_events(patient_id) WHERE resolved_at IS NULL;


-- =============================================================================
-- SECTION 7 — JOURNAL
-- =============================================================================

CREATE TABLE journal_prompts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        REFERENCES organisations(id),
    prompt_text         TEXT        NOT NULL,
    category            TEXT        CHECK (category IN (
                            'gratitude', 'reflection', 'coping', 'goals', 'general'
                        )),
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE journal_entries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_entry_id      UUID        NOT NULL UNIQUE REFERENCES daily_entries(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    entry_date          DATE        NOT NULL,
    prompt_id           UUID        REFERENCES journal_prompts(id),
    body                TEXT,
    body_format         TEXT        NOT NULL DEFAULT 'markdown' CHECK (body_format IN ('plain', 'markdown')),
    word_count          INTEGER     NOT NULL DEFAULT 0,
    input_method        TEXT        CHECK (input_method IN ('keyboard', 'voice', 'imported')),
    shared_with_clinician BOOLEAN   NOT NULL DEFAULT FALSE,
    shared_at           TIMESTAMPTZ,
    is_encrypted        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN journal_entries.shared_with_clinician IS 'Patient explicitly consents to share this entry. FALSE by default. See OQ-001 and OQ-009.';
COMMENT ON COLUMN journal_entries.is_encrypted IS 'Reserved for future E2EE migration path. See OQ-001.';

CREATE INDEX idx_journal_entries_patient_date ON journal_entries(patient_id, entry_date DESC);
CREATE INDEX idx_journal_entries_shared ON journal_entries(patient_id) WHERE shared_with_clinician = TRUE;


-- =============================================================================
-- SECTION 8 — ALERTS & NOTIFICATIONS
-- =============================================================================

CREATE TABLE clinical_alerts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
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
    source_table        TEXT,
    source_id           UUID,
    source_date         DATE,
    rule_key            TEXT,
    rule_context        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    auto_resolved       BOOLEAN     NOT NULL DEFAULT FALSE,
    auto_resolved_at    TIMESTAMPTZ,
    acknowledged_by     UUID        REFERENCES clinicians(id),
    acknowledged_at     TIMESTAMPTZ,
    acknowledgement_note TEXT,
    escalated_to        UUID        REFERENCES clinicians(id),
    escalated_at        TIMESTAMPTZ
);

CREATE INDEX idx_clinical_alerts_patient ON clinical_alerts(patient_id, created_at DESC);
CREATE INDEX idx_clinical_alerts_org_unack ON clinical_alerts(organisation_id)
    WHERE acknowledged_at IS NULL AND auto_resolved = FALSE;
CREATE INDEX idx_clinical_alerts_severity ON clinical_alerts(severity, created_at DESC)
    WHERE acknowledged_at IS NULL;


CREATE TABLE alert_routing_rules (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    patient_id          UUID        REFERENCES patients(id),
    alert_type          TEXT,
    min_severity        TEXT        NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('info', 'warning', 'critical')),
    channel             TEXT        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_routing_clinician ON alert_routing_rules(clinician_id) WHERE is_active = TRUE;


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
    push_token          TEXT,
    push_token_updated_at TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 9 — CLINICAL WORKFLOW
-- =============================================================================

CREATE TABLE clinician_notes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    note_type           TEXT        NOT NULL CHECK (note_type IN (
                            'observation', 'intervention', 'appointment_summary',
                            'risk_assessment', 'handover', 'custom'
                        )),
    body                TEXT        NOT NULL,
    linked_date         DATE,
    linked_entry_id     UUID        REFERENCES daily_entries(id),
    is_private          BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_clinician_notes_patient ON clinician_notes(patient_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_clinician_notes_clinician ON clinician_notes(clinician_id, created_at DESC) WHERE deleted_at IS NULL;


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


CREATE TABLE clinical_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        REFERENCES patients(id),
    clinician_id        UUID        NOT NULL REFERENCES clinicians(id),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    report_type         TEXT        NOT NULL CHECK (report_type IN (
                            'individual_patient', 'population_summary', 'handover', 'custom'
                        )),
    title               TEXT        NOT NULL,
    date_range_start    DATE,
    date_range_end      DATE,
    parameters          JSONB,
    status              TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    file_url            TEXT,
    file_size_bytes     INTEGER,
    generated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinical_reports_patient ON clinical_reports(patient_id, created_at DESC);
CREATE INDEX idx_clinical_reports_clinician ON clinical_reports(clinician_id, created_at DESC);


-- =============================================================================
-- SECTION 10 — ANALYTICS & AGGREGATIONS
-- =============================================================================

CREATE TABLE population_snapshots (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID        NOT NULL REFERENCES organisations(id),
    clinician_id        UUID        REFERENCES clinicians(id),
    snapshot_date       DATE        NOT NULL,
    total_patients      SMALLINT    NOT NULL,
    active_patients     SMALLINT    NOT NULL,
    crisis_patients     SMALLINT    NOT NULL DEFAULT 0,
    avg_mood_x10        SMALLINT,
    avg_coping_x10      SMALLINT,
    avg_sleep_minutes   SMALLINT,
    avg_exercise_minutes SMALLINT,
    risk_critical_count SMALLINT    NOT NULL DEFAULT 0,
    risk_high_count     SMALLINT    NOT NULL DEFAULT 0,
    risk_moderate_count SMALLINT    NOT NULL DEFAULT 0,
    risk_low_count      SMALLINT    NOT NULL DEFAULT 0,
    critical_alerts_count SMALLINT  NOT NULL DEFAULT 0,
    warning_alerts_count  SMALLINT  NOT NULL DEFAULT 0,
    med_adherence_pct   SMALLINT    CHECK (med_adherence_pct BETWEEN 0 AND 100),
    checkin_rate_pct    SMALLINT    CHECK (checkin_rate_pct BETWEEN 0 AND 100),
    mood_distribution   JSONB,
    top_triggers        JSONB,
    top_symptoms        JSONB,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organisation_id, clinician_id, snapshot_date)
);

COMMENT ON TABLE population_snapshots IS 'Pre-aggregated nightly. clinician_id NULL = org-wide snapshot (OQ-010).';

CREATE INDEX idx_pop_snapshots_org_date ON population_snapshots(organisation_id, snapshot_date DESC);
CREATE INDEX idx_pop_snapshots_clinician_date ON population_snapshots(clinician_id, snapshot_date DESC)
    WHERE clinician_id IS NOT NULL;


CREATE TABLE patient_correlation_cache (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    factor_type         TEXT        NOT NULL CHECK (factor_type IN (
                            'wellness_strategy', 'trigger', 'sleep_above_target',
                            'exercise_above_threshold', 'medication_adherent'
                        )),
    factor_id           UUID,
    factor_label        TEXT        NOT NULL,
    mood_delta_x10      SMALLINT    NOT NULL,
    sample_size         SMALLINT    NOT NULL,
    window_days         SMALLINT    NOT NULL DEFAULT 30,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (patient_id, factor_type, factor_id, window_days)
);

CREATE INDEX idx_correlation_cache_patient ON patient_correlation_cache(patient_id, mood_delta_x10 DESC);


-- =============================================================================
-- SECTION 11 — AUDIT, CONSENT & DATA GOVERNANCE
-- =============================================================================

CREATE TABLE audit_log (
    id                  BIGSERIAL   PRIMARY KEY,
    organisation_id     UUID        NOT NULL,
    actor_type          TEXT        NOT NULL CHECK (actor_type IN ('clinician', 'patient', 'system', 'admin')),
    actor_id            UUID        NOT NULL,
    action              TEXT        NOT NULL CHECK (action IN (
                            'read', 'create', 'update', 'delete',
                            'export', 'share', 'acknowledge', 'login', 'logout',
                            'consent_granted', 'consent_revoked'
                        )),
    resource_type       TEXT        NOT NULL,
    resource_id         UUID,
    patient_id          UUID,
    ip_address          INET,
    user_agent          TEXT,
    session_id          TEXT,
    old_values          JSONB,
    new_values          JSONB,
    success             BOOLEAN     NOT NULL DEFAULT TRUE,
    failure_reason      TEXT,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Append-only HIPAA audit trail. No UPDATE or DELETE on this table. Partition by occurred_at monthly at scale.';

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_log_patient ON audit_log(patient_id, occurred_at DESC) WHERE patient_id IS NOT NULL;
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, occurred_at DESC);


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
    granted_to_clinician_id UUID    REFERENCES clinicians(id),
    granted_to_organisation_id UUID REFERENCES organisations(id),
    consent_version     TEXT        NOT NULL,
    consent_text_snapshot TEXT,
    ip_address          INET,
    granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      TEXT
);

COMMENT ON TABLE consent_records IS 'Immutable HIPAA consent history. Insert new row to revoke; never update old rows.';

CREATE INDEX idx_consent_patient ON consent_records(patient_id, consent_type, granted_at DESC);
CREATE INDEX idx_consent_active ON consent_records(patient_id, consent_type)
    WHERE granted = TRUE AND revoked_at IS NULL;


CREATE TABLE data_export_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        NOT NULL REFERENCES patients(id),
    requested_by        UUID        NOT NULL REFERENCES patients(id),
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


CREATE OR REPLACE FUNCTION recompute_entry_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_entry daily_entries%ROWTYPE;
    v_pct   SMALLINT;
BEGIN
    SELECT * INTO v_entry FROM daily_entries WHERE id = NEW.daily_entry_id;

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


-- SAF-001: Auto-raise safety_event + clinical_alert when a safety symptom is logged as present.
-- Sets patient status to 'crisis' atomically in a single transaction.
CREATE OR REPLACE FUNCTION handle_safety_symptom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_is_safety BOOLEAN;
    v_alert_id  UUID;
    v_patient_name TEXT;
BEGIN
    IF NEW.is_present = FALSE OR (TG_OP = 'UPDATE' AND OLD.is_present = TRUE) THEN
        RETURN NEW;
    END IF;

    SELECT is_safety_symptom INTO v_is_safety
      FROM symptom_catalogue WHERE id = NEW.symptom_id;

    IF NOT v_is_safety THEN
        RETURN NEW;
    END IF;

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
        'Patient logged a safety symptom (intensity ' || COALESCE(NEW.intensity::TEXT, '—') || '/10). Immediate clinical review required. US crisis line: call or text 988.',
        'symptom_logs',
        NEW.id,
        NEW.entry_date,
        'safety_symptom_present'
    FROM patients p WHERE p.id = NEW.patient_id
    RETURNING id INTO v_alert_id;

    INSERT INTO safety_events (
        patient_id, symptom_log_id, daily_entry_id, entry_date, intensity, alert_id
    ) VALUES (
        NEW.patient_id, NEW.id, NEW.daily_entry_id, NEW.entry_date, NEW.intensity, v_alert_id
    );

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


-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE patients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_notes     ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinician_reads_own_patients ON patients
    FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM care_team_members ctm
            WHERE ctm.patient_id = patients.id
              AND ctm.clinician_id = current_setting('app.current_user_id', TRUE)::UUID
              AND ctm.unassigned_at IS NULL
        )
    );

CREATE POLICY patient_owns_entries ON daily_entries
    FOR ALL TO PUBLIC
    USING (patient_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY clinician_reads_shared_journals ON journal_entries
    FOR SELECT TO PUBLIC
    USING (
        patient_id = current_setting('app.current_user_id', TRUE)::UUID
        OR (
            shared_with_clinician = TRUE
            AND EXISTS (
                SELECT 1 FROM care_team_members ctm
                WHERE ctm.patient_id = journal_entries.patient_id
                  AND ctm.clinician_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND ctm.unassigned_at IS NULL
            )
        )
    );

CREATE POLICY care_team_reads_safety_events ON safety_events
    FOR SELECT TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM care_team_members ctm
            WHERE ctm.patient_id = safety_events.patient_id
              AND ctm.clinician_id = current_setting('app.current_user_id', TRUE)::UUID
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

-- Suicidal Thoughts has is_safety_symptom = TRUE.
-- Logging this as present triggers handle_safety_symptom():
--   1. Creates CRITICAL clinical_alert
--   2. Inserts safety_event record
--   3. Sets patient.status = 'crisis'
-- The patient app MUST immediately display the safety resource card:
--   US crisis line: Call or text 988 (988 Suicide & Crisis Lifeline)
--   Crisis Text Line: Text HOME to 741741
