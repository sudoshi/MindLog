-- =============================================================================
-- MindLog Migration 002 — notification_logs + consent_type expansion
-- Run after 001_initial.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Notification logs table (push/email delivery audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID        REFERENCES patients(id) ON DELETE CASCADE,
    clinician_id        UUID        REFERENCES clinicians(id) ON DELETE SET NULL,
    notification_type   TEXT        NOT NULL CHECK (notification_type IN (
                            'alert_push', 'alert_email', 'daily_reminder',
                            'medication_reminder', 'streak_milestone', 'appointment'
                        )),
    channel             TEXT        NOT NULL CHECK (channel IN ('push', 'email', 'sms')),
    title               TEXT,
    body                TEXT,
    status              TEXT        NOT NULL DEFAULT 'sent'
                            CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
    external_id         TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at        TIMESTAMPTZ,
    failure_reason      TEXT
);

COMMENT ON TABLE notification_logs IS 'Delivery audit log for push/email notifications. Append-only.';

CREATE INDEX IF NOT EXISTS idx_notification_logs_patient
    ON notification_logs(patient_id, sent_at DESC)
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_clinician
    ON notification_logs(clinician_id, sent_at DESC)
    WHERE clinician_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Expand consent_records.consent_type to include mobile-app types
--    The original CHECK only has server-side types; the mobile app uses
--    'journal_sharing', 'data_research', 'ai_insights', 'emergency_contact'.
-- ---------------------------------------------------------------------------

ALTER TABLE consent_records
    DROP CONSTRAINT IF EXISTS consent_records_consent_type_check;

ALTER TABLE consent_records
    ADD CONSTRAINT consent_records_consent_type_check
    CHECK (consent_type IN (
        -- Original server-side types
        'share_with_clinician',
        'share_journal_with_clinician',
        'research_participation',
        'data_export',
        'push_notifications',
        'terms_of_service',
        'privacy_policy',
        -- Mobile app types (Zod ConsentTypeSchema)
        'journal_sharing',
        'data_research',
        'ai_insights',
        'emergency_contact'
    ));

-- ---------------------------------------------------------------------------
-- 3. Clinician notification preferences (alert delivery settings)
--    Separate from patient_notification_preferences which is for patients.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinician_notification_preferences (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clinician_id        UUID        NOT NULL UNIQUE REFERENCES clinicians(id) ON DELETE CASCADE,
    alert_push_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
    alert_email_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    push_token          TEXT,
    push_token_updated_at TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinician_notification_preferences IS 'Per-clinician alert delivery channel settings.';
