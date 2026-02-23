-- =============================================================================
-- MindLog — Migration 008: Patient invite system + clinical intake fields
-- Creates patient_invites table (invite-only registration) and extends patients
-- with intake tracking columns (primary concern, emergency contact, intake flag).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: patient_invites
-- Clinicians create invite records; patients redeem them to self-register.
-- Tokens are URL-safe base64 (24 random bytes → 32 chars, no padding issues).
-- ---------------------------------------------------------------------------

CREATE TABLE patient_invites (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT        NOT NULL UNIQUE
                               DEFAULT encode(gen_random_bytes(24), 'base64url'),
  clinician_id     UUID        NOT NULL REFERENCES clinicians(id),
  org_id           UUID        NOT NULL REFERENCES organisations(id),
  email            TEXT        NOT NULL,
  patient_id       UUID        REFERENCES patients(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  personal_message TEXT,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at      TIMESTAMPTZ,
  resent_at        TIMESTAMPTZ,
  resend_count     SMALLINT    NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for clinician's own invite list filtered by status
CREATE INDEX patient_invites_clinician_status_idx
  ON patient_invites (clinician_id, status);

-- Partial index: token lookups only need to scan pending invites
CREATE INDEX patient_invites_token_pending_idx
  ON patient_invites (token)
  WHERE status = 'pending';

-- Prevent a clinician from sending multiple pending invites to the same email
CREATE UNIQUE INDEX patient_invites_clinician_email_pending_uniq
  ON patient_invites (clinician_id, lower(email))
  WHERE status = 'pending';

COMMENT ON TABLE patient_invites IS
  'Invite tokens sent by clinicians to prospective patients. Tokens are single-use '
  'and expire after 7 days. Status transitions: pending → accepted | expired | cancelled.';

COMMENT ON COLUMN patient_invites.token IS
  'URL-safe base64-encoded 24 random bytes. Embedded in deep-link as '
  '?token=<value>. Never returned to any party other than the invited email.';

-- ---------------------------------------------------------------------------
-- Extend patients: intake tracking + emergency contact + invite backlink
-- ---------------------------------------------------------------------------

-- Clinical intake fields — collected during the post-registration onboarding wizard
ALTER TABLE patients
  ADD COLUMN primary_concern               TEXT,
  ADD COLUMN emergency_contact_name        TEXT,
  ADD COLUMN emergency_contact_phone       TEXT,
  ADD COLUMN emergency_contact_relationship TEXT,
  ADD COLUMN intake_complete               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN invite_id                     UUID REFERENCES patient_invites(id);

COMMENT ON COLUMN patients.primary_concern IS
  'Patient-stated primary reason for seeking care (e.g. Depression, Anxiety, PTSD). '
  'Collected during onboarding intake wizard Step 1.';

COMMENT ON COLUMN patients.emergency_contact_name IS
  'Emergency contact full name — shared with care team only in safety events.';

COMMENT ON COLUMN patients.intake_complete IS
  'TRUE once the patient has completed the post-registration clinical intake wizard '
  'and the notification preferences step. Used as a navigation gate in _layout.tsx.';

COMMENT ON COLUMN patients.invite_id IS
  'References the patient_invites row used to register this patient. NULL for '
  'patients created via admin tooling before this migration.';

-- ---------------------------------------------------------------------------
-- Audit log support: add 'patient_registered' to alert_type enum alternatives
-- ---------------------------------------------------------------------------

-- The existing clinical_alerts.alert_type CHECK already covers: missed_checkin,
-- mood_decline, safety_flag, trigger_escalation, med_nonadherence,
-- symptom_emergence, streak_broken, risk_level_change, appointment_reminder, custom.
-- We add 'patient_registered' to allow the rules engine to notify clinicians
-- when their invited patient completes registration.

-- Drop and recreate constraint (Postgres requires this for CHECK updates)
ALTER TABLE clinical_alerts
  DROP CONSTRAINT IF EXISTS clinical_alerts_alert_type_check;

ALTER TABLE clinical_alerts
  ADD CONSTRAINT clinical_alerts_alert_type_check
  CHECK (alert_type IN (
    'missed_checkin', 'mood_decline', 'safety_flag',
    'trigger_escalation', 'med_nonadherence', 'symptom_emergence',
    'streak_broken', 'risk_level_change', 'appointment_reminder',
    'custom', 'patient_registered'
  ));
