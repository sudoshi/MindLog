-- =============================================================================
-- MindLog — Migration 004: Expanded daily entry for evidence-based clinical data
-- Adds 16 new clinical domain columns to daily_entries and sleep_logs,
-- covering all domains from COPEApp-Prototype/MobileAppCoreDesignPrinciples.md:
--   Mania pole (ASRM), Anxiety (GAD-2), Suicidal ideation (C-SSRS),
--   Substance use (AUDIT-C), Social functioning, Cognitive functioning,
--   Appetite, Stress (PSS), Sleep quality detail (PSQI items).
-- Adds new system symptom seeds for clinical domains not yet covered.
-- Adds DB trigger for suicidal ideation escalation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mania pole — Altman Self-Rating Mania Scale (ASRM) items
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS mania_score         SMALLINT CHECK (mania_score BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS racing_thoughts     BOOLEAN,
    ADD COLUMN IF NOT EXISTS decreased_sleep_need BOOLEAN;

COMMENT ON COLUMN daily_entries.mania_score          IS 'Elevated/energised mood (1-10). Adapted from ASRM. NULL = not assessed.';
COMMENT ON COLUMN daily_entries.racing_thoughts      IS 'ASRM item: did thoughts race today?';
COMMENT ON COLUMN daily_entries.decreased_sleep_need IS 'Cardinal hypomanic symptom: less sleep but still felt energised.';

-- ---------------------------------------------------------------------------
-- 2. Depression/anxiety — PHQ-2 + GAD-2 items
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS anhedonia_score  SMALLINT CHECK (anhedonia_score BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS anxiety_score    SMALLINT CHECK (anxiety_score BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS somatic_anxiety  BOOLEAN;

COMMENT ON COLUMN daily_entries.anhedonia_score  IS 'Enjoyment / anhedonia probe (1=no enjoyment, 10=full enjoyment). PHQ-2 item 2.';
COMMENT ON COLUMN daily_entries.anxiety_score    IS 'Anxiety/worry level (1-10). Adapted from GAD-2.';
COMMENT ON COLUMN daily_entries.somatic_anxiety  IS 'Physical anxiety symptoms present today (racing heart, chest tightness, trembling).';

-- ---------------------------------------------------------------------------
-- 3. Suicidal ideation — C-SSRS screener
--    0=none 1=passing thoughts 2=frequent thoughts 3=thoughts with a plan
--    Separate from the symptom_logs pathway — this captures a graded scale
--    on every check-in without requiring a catalogue item selection.
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS suicidal_ideation SMALLINT CHECK (suicidal_ideation BETWEEN 0 AND 3);

COMMENT ON COLUMN daily_entries.suicidal_ideation IS
    'C-SSRS screener: 0=none, 1=passing thoughts, 2=frequent thoughts, 3=thoughts with plan. '
    'Any value > 0 MUST trigger the safety resource card and a clinical alert.';

-- ---------------------------------------------------------------------------
-- 4. Substance use — AUDIT-C single-day diary
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS substance_use      TEXT CHECK (substance_use IN ('none', 'alcohol', 'cannabis', 'other')),
    ADD COLUMN IF NOT EXISTS substance_quantity SMALLINT;

COMMENT ON COLUMN daily_entries.substance_use      IS 'Primary substance used today. NULL = question skipped.';
COMMENT ON COLUMN daily_entries.substance_quantity IS 'Standard drinks or units (alcohol) or sessions (other). Null when substance_use = none.';

-- ---------------------------------------------------------------------------
-- 5. Social functioning
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS social_score     SMALLINT CHECK (social_score BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS social_avoidance BOOLEAN;

COMMENT ON COLUMN daily_entries.social_score     IS 'Time with others today: 1=none (isolated) to 5=a lot. Social withdrawal = prodromal depression signal.';
COMMENT ON COLUMN daily_entries.social_avoidance IS 'Avoided social situations you would normally participate in.';

-- ---------------------------------------------------------------------------
-- 6. Cognitive functioning
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS cognitive_score SMALLINT CHECK (cognitive_score BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS brain_fog       BOOLEAN;

COMMENT ON COLUMN daily_entries.cognitive_score IS 'Concentration / decision-making (1=very poorly, 10=very well).';
COMMENT ON COLUMN daily_entries.brain_fog       IS 'Mind felt foggy or unclear today.';

-- ---------------------------------------------------------------------------
-- 7. Appetite (bidirectional — both loss and increase are diagnostically meaningful)
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS appetite_score SMALLINT CHECK (appetite_score BETWEEN 1 AND 5);

COMMENT ON COLUMN daily_entries.appetite_score IS
    '1=much less than normal, 2=less, 3=normal, 4=more, 5=much more. '
    'Deviations in either direction are clinically meaningful.';

-- ---------------------------------------------------------------------------
-- 8. Stress & life events — PSS single item
-- ---------------------------------------------------------------------------
ALTER TABLE daily_entries
    ADD COLUMN IF NOT EXISTS stress_score    SMALLINT CHECK (stress_score BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS life_event_note TEXT;

COMMENT ON COLUMN daily_entries.stress_score    IS 'Perceived stress today (1-10). Adapted from Perceived Stress Scale single-item.';
COMMENT ON COLUMN daily_entries.life_event_note IS 'Optional free-text: significant event (positive or negative) today.';

-- ---------------------------------------------------------------------------
-- 9. Extended sleep quality — PSQI sub-items (complement sleep_logs)
-- ---------------------------------------------------------------------------
ALTER TABLE sleep_logs
    ADD COLUMN IF NOT EXISTS sleep_onset_mins SMALLINT CHECK (sleep_onset_mins >= 0),
    ADD COLUMN IF NOT EXISTS sleep_wakeups    SMALLINT CHECK (sleep_wakeups >= 0),
    ADD COLUMN IF NOT EXISTS sleep_rested     SMALLINT CHECK (sleep_rested BETWEEN 1 AND 5);

COMMENT ON COLUMN sleep_logs.sleep_onset_mins IS 'Minutes to fall asleep. PSQI component 2.';
COMMENT ON COLUMN sleep_logs.sleep_wakeups    IS 'Number of times woken during the night. PSQI component 5b.';
COMMENT ON COLUMN sleep_logs.sleep_rested     IS 'Felt rested upon waking: 1=not at all to 5=completely. PSQI component 6.';

-- ---------------------------------------------------------------------------
-- 10. DB trigger: suicidal ideation on daily_entries → safety event
--     Mirrors handle_safety_symptom() but for the graded C-SSRS field.
--     Fires when suicidal_ideation changes from NULL/0 to > 0.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_daily_entry_si()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_alert_id    UUID;
    v_patient_name TEXT;
    v_si_label    TEXT;
BEGIN
    -- Only fire when suicidal_ideation transitions to a positive value
    IF NEW.suicidal_ideation IS NULL OR NEW.suicidal_ideation = 0 THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.suicidal_ideation IS NOT DISTINCT FROM NEW.suicidal_ideation THEN
        RETURN NEW;
    END IF;

    v_si_label := CASE NEW.suicidal_ideation
        WHEN 1 THEN 'passing thoughts'
        WHEN 2 THEN 'frequent thoughts'
        WHEN 3 THEN 'thoughts with a plan'
        ELSE 'unknown'
    END;

    SELECT first_name || ' ' || last_name INTO v_patient_name
      FROM patients WHERE id = NEW.patient_id;

    INSERT INTO clinical_alerts (
        patient_id, organisation_id, alert_type, severity,
        title, body, source_table, source_id, source_date, rule_key
    )
    SELECT
        NEW.patient_id,
        p.organisation_id,
        'safety_flag',
        'critical',
        v_patient_name || ' reported suicidal ideation (C-SSRS)',
        'Patient endorsed ' || v_si_label || ' on C-SSRS screener for ' || NEW.entry_date::TEXT ||
        '. Immediate clinical review required. US crisis line: call or text 988.',
        'daily_entries',
        NEW.id,
        NEW.entry_date,
        'si_daily_entry'
    FROM patients p WHERE p.id = NEW.patient_id
    RETURNING id INTO v_alert_id;

    UPDATE patients SET status = 'crisis', updated_at = NOW() WHERE id = NEW.patient_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_daily_entry_si
    AFTER INSERT OR UPDATE OF suicidal_ideation ON daily_entries
    FOR EACH ROW EXECUTE FUNCTION handle_daily_entry_si();


-- ---------------------------------------------------------------------------
-- 11. New system symptoms for mania pole, cognitive, and behavioural domains
--     (Increased Appetite and Decreased Appetite already exist from 001.)
-- ---------------------------------------------------------------------------
INSERT INTO symptom_catalogue (name, category, icon_key, is_safety_symptom, display_order, is_system) VALUES
    ('Racing Thoughts',           'mood',         'racing_thoughts',    FALSE, 160, TRUE),
    ('Elevated Mood',             'mood',         'elevated_mood',      FALSE, 170, TRUE),
    ('Decreased Need for Sleep',  'mood',         'sleep_decrease',     FALSE, 180, TRUE),
    ('Brain Fog',                 'cognitive',    'brain_fog',          FALSE, 190, TRUE),
    ('Social Withdrawal',         'behavioural',  'withdrawal',         FALSE, 200, TRUE),
    ('Impulsivity',               'behavioural',  'impulsivity',        FALSE, 210, TRUE),
    ('Somatic Anxiety',           'physical',     'somatic',            FALSE, 220, TRUE)
ON CONFLICT DO NOTHING;
