-- =============================================================================
-- MindLog — Migration 005: Validated clinical scale assessments
-- Stores full responses and total scores for periodic standardised instruments:
--   PHQ-9 (weekly), GAD-7 (weekly), ASRM (weekly), ISI (biweekly),
--   C-SSRS (weekly), WHODAS 2.0 (monthly), QIDS-SR (biweekly).
-- See COPEApp-Prototype/MobileAppCoreDesignPrinciples.md for instrument details.
-- LOINC codes are added by migration 006.
-- =============================================================================

CREATE TABLE IF NOT EXISTS validated_assessments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    scale           TEXT        NOT NULL CHECK (scale IN (
                        'PHQ-9', 'GAD-7', 'ASRM', 'ISI', 'C-SSRS', 'WHODAS', 'QIDS-SR'
                    )),
    score           SMALLINT    NOT NULL,       -- total score for the instrument
    item_responses  JSONB       NOT NULL,       -- { "q1": 2, "q2": 0, ... }
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT,                       -- optional clinician or patient note
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE validated_assessments IS
    'Full validated scale responses. Periodic anchor assessments that complement daily micro-entries. '
    'item_responses stores { qN: 0-3 } for Likert instruments, { qN: boolean } for screening instruments.';

COMMENT ON COLUMN validated_assessments.score IS
    'Total instrument score. Interpretation: '
    'PHQ-9: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20+ severe depression. '
    'GAD-7: 0-4 minimal, 5-9 mild, 10-14 moderate, 15+ severe anxiety. '
    'ASRM: >= 6 suggests possible hypomanic/manic episode.';

CREATE INDEX idx_validated_assessments_patient_scale
    ON validated_assessments (patient_id, scale, completed_at DESC);

CREATE INDEX idx_validated_assessments_patient_recent
    ON validated_assessments (patient_id, completed_at DESC);

-- ---------------------------------------------------------------------------
-- Trigger: alert on clinically significant PHQ-9 / GAD-7 / ASRM scores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_validated_assessment_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_alert_id    UUID;
    v_patient_name TEXT;
    v_severity    TEXT;
    v_body        TEXT;
    v_should_alert BOOLEAN := FALSE;
BEGIN
    SELECT first_name || ' ' || last_name INTO v_patient_name
      FROM patients WHERE id = NEW.patient_id;

    -- PHQ-9: score >= 15 = moderately severe / severe depression
    IF NEW.scale = 'PHQ-9' AND NEW.score >= 15 THEN
        v_should_alert := TRUE;
        v_severity := CASE WHEN NEW.score >= 20 THEN 'critical' ELSE 'warning' END;
        v_body := v_patient_name || ' scored ' || NEW.score || ' on PHQ-9 (' ||
            CASE WHEN NEW.score >= 20 THEN 'severe' ELSE 'moderately severe' END ||
            ' depression). Clinical review recommended.';
    END IF;

    -- GAD-7: score >= 15 = severe anxiety
    IF NEW.scale = 'GAD-7' AND NEW.score >= 15 THEN
        v_should_alert := TRUE;
        v_severity := 'warning';
        v_body := v_patient_name || ' scored ' || NEW.score || ' on GAD-7 (severe anxiety). Clinical review recommended.';
    END IF;

    -- ASRM: score >= 6 = possible hypomanic/manic episode
    IF NEW.scale = 'ASRM' AND NEW.score >= 6 THEN
        v_should_alert := TRUE;
        v_severity := CASE WHEN NEW.score >= 14 THEN 'critical' ELSE 'warning' END;
        v_body := v_patient_name || ' scored ' || NEW.score || ' on ASRM (possible ' ||
            CASE WHEN NEW.score >= 14 THEN 'manic' ELSE 'hypomanic' END ||
            ' episode). Clinical review recommended.';
    END IF;

    -- C-SSRS: any endorsement of item 3-5 (ideation with some intent)
    IF NEW.scale = 'C-SSRS' AND NEW.score >= 3 THEN
        v_should_alert := TRUE;
        v_severity := 'critical';
        v_body := v_patient_name || ' C-SSRS score ' || NEW.score || ' indicates active suicidal ideation with intent. Immediate clinical review required. US crisis line: call or text 988.';
    END IF;

    IF NOT v_should_alert THEN
        RETURN NEW;
    END IF;

    INSERT INTO clinical_alerts (
        patient_id, organisation_id, alert_type, severity,
        title, body, source_table, source_id, source_date, rule_key
    )
    SELECT
        NEW.patient_id,
        p.organisation_id,
        CASE WHEN NEW.scale IN ('C-SSRS') OR (NEW.scale = 'PHQ-9' AND NEW.score >= 20)
             THEN 'safety_flag' ELSE 'mood_decline' END,
        v_severity,
        v_patient_name || ' — ' || NEW.scale || ' score ' || NEW.score,
        v_body,
        'validated_assessments',
        NEW.id,
        NEW.completed_at::DATE,
        'validated_assessment_threshold'
    FROM patients p WHERE p.id = NEW.patient_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validated_assessment_alert
    AFTER INSERT ON validated_assessments
    FOR EACH ROW EXECUTE FUNCTION handle_validated_assessment_alert();
