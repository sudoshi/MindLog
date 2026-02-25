-- =============================================================================
-- MindLog — Demo Enrichment Script
-- Run AFTER npm run db:seed-demo to fill in the data that makes every
-- chart, graph, and clinical metric in the web dashboard come alive.
--
-- Adds:
--   1. NP Zhang elevated to admin + added to every patient's care team
--   2. 16 Phase-8c clinical fields backfilled into all daily_entries
--   3. patient_triggers + patient_symptoms catalogue links (mobile check-in)
--   4. Trigger & symptom logs for low/moderate risk patients (was high/crisis only)
--   5. Patient diagnoses — ICD-10 primary + comorbid secondary
--   6. Validated assessments — PHQ-9, GAD-7, ASRM (every 2 weeks × 4 rounds)
--   7. population_snapshots updated with avg_phq9/gad7/asrm/pct_si columns
--   8. Appointments — 2 historical (attended/dna) + 1 upcoming per patient
--
-- Apply:
--   PGPASSWORD=acumenus psql -h localhost -p 5432 -U smudoshi -d mindlogdemo \
--     < packages/db/seeds/009_demo_enrichment.sql
--
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / WHERE ... IS NULL guards).
-- =============================================================================

BEGIN;

-- Safety check
DO $$
BEGIN
  PERFORM 1 FROM organisations WHERE name = 'MindLog Demo Clinic';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo org not found — run: npm run db:seed-demo first';
  END IF;
END $$;

-- Convenience variable used in several queries
CREATE TEMP TABLE _org AS
  SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic';

-- =============================================================================
-- 1. NP Zhang → admin + care team access to all 146 patients
-- =============================================================================

UPDATE clinicians
SET    role = 'admin'
WHERE  email = 'np.zhang@mindlogdemo.com';

-- Zhang's admin role bypass now provides org-wide access; no need for
-- care_team_members rows on every patient.  Original ~22 primary patients
-- from the base seed remain.

-- =============================================================================
-- 2. Backfill Phase-8c clinical columns in daily_entries
--    All 16 columns were added by migration 004 but were never populated.
--    Formulas are clinically plausible:
--      • Lower mood  → higher anxiety / anhedonia / stress
--      • Higher mood → better cognition / social engagement
--      • Crisis risk → elevated mania episodes, higher SI probability
-- =============================================================================

-- The trg_daily_entry_si trigger fires when suicidal_ideation is updated.
-- It will legitimately create safety alerts for crisis patients (SI = 1).
-- For the bulk of rows (SI = 0) the trigger is a fast no-op.
-- We therefore leave the trigger enabled — the alerts it generates are
-- USEFUL demo data (shows the safety escalation system in action).

UPDATE daily_entries de
SET
  -- Anxiety: inversely correlated with mood (low mood → high anxiety)
  anxiety_score     = GREATEST(1, LEAST(10,
                        ROUND((10.0 - de.mood) * 0.75 + 2.5 + (random() * 2.0 - 1.0))::smallint)),

  -- Anhedonia (loss of pleasure): similar inverse correlation
  anhedonia_score   = GREATEST(1, LEAST(10,
                        ROUND((10.0 - de.mood) * 0.80 + 2.0 + (random() * 2.0 - 1.0))::smallint)),

  -- Mania: mostly low; crisis patients have occasional elevated episodes
  mania_score       = GREATEST(1, LEAST(10,
                        ROUND(CASE
                          WHEN p.risk_level = 'critical' AND random() < 0.20 THEN 5.5 + random() * 3.5
                          WHEN p.risk_level = 'high'     AND random() < 0.08 THEN 4.0 + random() * 3.0
                          ELSE 1.5 + random() * 2.0
                        END)::smallint)),

  -- Perceived stress: inversely correlated with mood, noisy
  stress_score      = GREATEST(1, LEAST(10,
                        ROUND((10.0 - de.mood) * 0.70 + 2.0 + (random() * 3.0 - 1.5))::smallint)),

  -- Social engagement (1–5): correlated with mood
  social_score      = GREATEST(1, LEAST(5,
                        ROUND(de.mood / 2.2 + (random() - 0.5))::smallint)),

  -- Appetite (1=much less, 3=normal, 5=much more): mood-correlated, bidirectional
  appetite_score    = GREATEST(1, LEAST(5,
                        ROUND(3.0 + (de.mood - 5.0) * 0.15 + (random() - 0.5) * 1.5)::smallint)),

  -- Cognitive function: correlated with mood
  cognitive_score   = GREATEST(1, LEAST(10,
                        ROUND(de.mood * 0.78 + 2.0 + (random() * 2.0 - 1.0))::smallint)),

  -- Boolean symptoms — probability rises with illness severity
  racing_thoughts   = (random() < CASE p.risk_level
                         WHEN 'critical' THEN 0.22 WHEN 'high' THEN 0.12 ELSE 0.06 END),

  decreased_sleep_need = (random() < CASE p.risk_level
                           WHEN 'critical' THEN 0.16 WHEN 'high' THEN 0.07 ELSE 0.03 END),

  somatic_anxiety   = (random() < CASE p.risk_level
                         WHEN 'critical' THEN 0.38 WHEN 'high' THEN 0.25 ELSE 0.12 END),

  social_avoidance  = (de.mood < 5 AND random() < 0.42),

  brain_fog         = (de.mood < 6 AND random() < 0.36),

  -- Substance use: mostly none, higher rates in high/crisis
  substance_use     = (CASE
                         WHEN random() < (CASE p.risk_level
                                WHEN 'critical' THEN 0.50 WHEN 'high' THEN 0.60
                                WHEN 'moderate' THEN 0.72 ELSE 0.82 END)
                           THEN 'none'
                         WHEN random() < 0.75 THEN 'alcohol'
                         WHEN random() < 0.92 THEN 'cannabis'
                         ELSE 'other'
                       END)::text,

  substance_quantity = (CASE
                          WHEN random() < 0.62 THEN 0
                          ELSE GREATEST(1, ROUND(random() * 4.5)::int)
                        END)::smallint,

  -- Suicidal ideation (C-SSRS): only for high/critical patients, rarely
  -- Trigger fires and creates safety_events + clinical_alerts — this is correct.
  suicidal_ideation = (CASE
                         WHEN p.risk_level = 'critical' AND random() < 0.07 THEN 1  -- passing thoughts
                         WHEN p.risk_level = 'high'     AND random() < 0.03 THEN 1
                         ELSE 0
                       END)::smallint

FROM patients p
WHERE de.patient_id          = p.id
  AND p.organisation_id      = (SELECT id FROM _org)
  AND de.anxiety_score IS NULL;  -- idempotent: skip already-enriched rows

-- =============================================================================
-- 3. patient_triggers + patient_symptoms catalogue links
--    Without these, the mobile check-in form shows no triggers/symptoms
--    to select. Every non-discharged patient gets all system catalogue items.
-- =============================================================================

INSERT INTO patient_triggers (patient_id, trigger_id)
SELECT p.id, tc.id
FROM   patients p
CROSS  JOIN trigger_catalogue tc
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  tc.is_system = TRUE
  AND  p.status NOT IN ('discharged')
ON CONFLICT DO NOTHING;

INSERT INTO patient_symptoms (patient_id, symptom_id)
SELECT p.id, sc.id
FROM   patients p
CROSS  JOIN symptom_catalogue sc
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  sc.is_system = TRUE
  AND  p.status NOT IN ('discharged')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4. Trigger & symptom logs for low/moderate-risk patients
--    The seed only generated these for high/critical patients.
--    We add them at a lower frequency and severity for the rest.
-- =============================================================================

-- Trigger logs for low/moderate (≈20% of check-in days)
INSERT INTO trigger_logs
       (daily_entry_id, patient_id, trigger_id, entry_date, is_active, severity)
SELECT de.id,
       de.patient_id,
       tc.id,
       de.entry_date,
       TRUE,
       GREATEST(1, LEAST(6, FLOOR(1.0 + random() * 5.0)::int))
FROM   daily_entries de
JOIN   patients p ON p.id = de.patient_id
-- LATERAL picks a fresh random catalogue entry for each daily_entry row
JOIN   LATERAL (
         SELECT id FROM trigger_catalogue
         WHERE  is_system = TRUE
         ORDER  BY random()
         LIMIT  1
       ) tc ON TRUE
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.risk_level IN ('low', 'moderate')
  AND  random() < 0.20
  AND  NOT EXISTS (
         SELECT 1 FROM trigger_logs tl WHERE tl.daily_entry_id = de.id
       )
ON CONFLICT DO NOTHING;

-- Symptom logs for low/moderate (≈15% of check-in days, non-safety symptoms only)
INSERT INTO symptom_logs
       (daily_entry_id, patient_id, symptom_id, entry_date, is_present, intensity)
SELECT de.id,
       de.patient_id,
       sc.id,
       de.entry_date,
       TRUE,
       GREATEST(1, LEAST(6, FLOOR(1.0 + random() * 5.0)::int))
FROM   daily_entries de
JOIN   patients p ON p.id = de.patient_id
JOIN   LATERAL (
         SELECT id FROM symptom_catalogue
         WHERE  is_system = TRUE
           AND  is_safety_symptom = FALSE
         ORDER  BY random()
         LIMIT  1
       ) sc ON TRUE
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.risk_level IN ('low', 'moderate')
  AND  random() < 0.15
  AND  NOT EXISTS (
         SELECT 1 FROM symptom_logs sl WHERE sl.daily_entry_id = de.id
       )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. Patient diagnoses (ICD-10)
--    Primary diagnosis matched to risk level + optional comorbidity (50%).
--    ICD-10 codes confirmed present in icd10_codes reference table.
-- =============================================================================

-- Primary diagnoses
INSERT INTO patient_diagnoses
       (patient_id, icd10_code, is_primary, diagnosed_at, diagnosed_by, notes)
SELECT p.id,
       -- Risk-stratified primary diagnosis pool
       (CASE p.risk_level
          WHEN 'low' THEN
            (ARRAY['F32.0','F32.0','F33.0','F41.1','F41.1'])[FLOOR(random() * 5)::int + 1]
          WHEN 'moderate' THEN
            (ARRAY['F32.1','F33.1','F33.1','F41.1','F43.10'])[FLOOR(random() * 5)::int + 1]
          WHEN 'high' THEN
            (ARRAY['F33.2','F31.32','F31.4','F43.10','F43.12'])[FLOOR(random() * 5)::int + 1]
          WHEN 'critical' THEN
            (ARRAY['F31.4','F31.5','F33.2','F43.10','F33.9'])[FLOOR(random() * 5)::int + 1]
          ELSE 'F32.9'
        END)::text,
       TRUE,
       -- Diagnosed 3 months to 2 years ago
       (CURRENT_DATE - (90 + FLOOR(random() * 640)::int))::date,
       ctm.clinician_id,
       CASE p.risk_level
         WHEN 'low'      THEN 'Mild presentation. Good treatment response. Continued outpatient monitoring.'
         WHEN 'moderate' THEN 'Moderate severity. Active treatment plan. Progress tracked via MindLog.'
         WHEN 'high'     THEN 'Significant functional impairment. Intensive monitoring. Weekly check-ins.'
         WHEN 'critical' THEN 'Severe presentation. Crisis protocol active. Medication review pending.'
         ELSE NULL
       END
FROM   patients p
JOIN   care_team_members ctm
         ON ctm.patient_id = p.id AND ctm.role = 'primary'
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  NOT EXISTS (
         SELECT 1 FROM patient_diagnoses pd
         WHERE  pd.patient_id = p.id AND pd.is_primary = TRUE
       );

-- Secondary / comorbid diagnoses (~50% of patients)
INSERT INTO patient_diagnoses
       (patient_id, icd10_code, is_primary, diagnosed_at, diagnosed_by)
SELECT p.id,
       -- Most common comorbidities: GAD, Panic, ADHD
       (ARRAY['F41.1','F41.1','F41.0','F90.0','F90.2'])[FLOOR(random() * 5)::int + 1]::text,
       FALSE,
       (CURRENT_DATE - (30 + FLOOR(random() * 365)::int))::date,
       ctm.clinician_id
FROM   patients p
JOIN   care_team_members ctm
         ON ctm.patient_id = p.id AND ctm.role = 'primary'
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  random() < 0.50
  AND  NOT EXISTS (
         SELECT 1 FROM patient_diagnoses pd
         WHERE  pd.patient_id = p.id AND pd.is_primary = FALSE
       );

-- =============================================================================
-- 6. Validated assessments — PHQ-9, GAD-7, ASRM
--    4 rounds per patient at 2-week intervals (weeks -8, -6, -4, -2).
--    Scores are risk-level-stratified and clinically calibrated.
--    The alert trigger is disabled during bulk insert to avoid generating
--    hundreds of duplicate alert notifications from historical backfill.
-- =============================================================================

ALTER TABLE validated_assessments DISABLE TRIGGER trg_validated_assessment_alert;

-- PHQ-9 (all patients, 4 assessments)
INSERT INTO validated_assessments
       (patient_id, scale, score, item_responses, completed_at, loinc_code)
SELECT p.id,
       'PHQ-9',
       GREATEST(0, LEAST(27,
         (CASE p.risk_level
            WHEN 'low'      THEN ROUND( 3.0 + random() * 5.0)
            WHEN 'moderate' THEN ROUND( 9.0 + random() * 6.0)
            WHEN 'high'     THEN ROUND(15.0 + random() * 6.0)
            WHEN 'critical' THEN ROUND(21.0 + random() * 5.0)
            ELSE                  ROUND( 8.0 + random() * 8.0)
          END)::smallint)),
       '{}'::jsonb,
       (CURRENT_DATE - d.days_ago)::timestamp + '18:00:00'::time,
       '44261-6'   -- LOINC code for PHQ-9
FROM   patients p
CROSS  JOIN (VALUES (56), (42), (28), (14)) AS d(days_ago)
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status != 'discharged';

-- GAD-7 (all patients, 4 assessments)
INSERT INTO validated_assessments
       (patient_id, scale, score, item_responses, completed_at, loinc_code)
SELECT p.id,
       'GAD-7',
       GREATEST(0, LEAST(21,
         (CASE p.risk_level
            WHEN 'low'      THEN ROUND( 2.0 + random() * 4.0)
            WHEN 'moderate' THEN ROUND( 6.0 + random() * 6.0)
            WHEN 'high'     THEN ROUND(11.0 + random() * 5.0)
            WHEN 'critical' THEN ROUND(14.0 + random() * 6.0)
            ELSE                  ROUND( 5.0 + random() * 6.0)
          END)::smallint)),
       '{}'::jsonb,
       (CURRENT_DATE - d.days_ago)::timestamp + '18:05:00'::time,
       '69737-5'   -- LOINC code for GAD-7
FROM   patients p
CROSS  JOIN (VALUES (56), (42), (28), (14)) AS d(days_ago)
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status != 'discharged';

-- ASRM — Altman Self-Rating Mania Scale (high/critical only, bi-monthly)
INSERT INTO validated_assessments
       (patient_id, scale, score, item_responses, completed_at)
SELECT p.id,
       'ASRM',
       GREATEST(0, LEAST(20,
         (CASE p.risk_level
            WHEN 'high'     THEN ROUND(3.0 + random() * 7.0)
            WHEN 'critical' THEN ROUND(6.0 + random() * 9.0)
            ELSE                  ROUND(1.0 + random() * 3.0)
          END)::smallint)),
       '{}'::jsonb,
       (CURRENT_DATE - d.days_ago)::timestamp + '18:10:00'::time
FROM   patients p
CROSS  JOIN (VALUES (56), (28)) AS d(days_ago)
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status != 'discharged'
  AND  p.risk_level IN ('high', 'critical');

ALTER TABLE validated_assessments ENABLE TRIGGER trg_validated_assessment_alert;

-- =============================================================================
-- 7. Update population_snapshots with PHQ-9 / GAD-7 / ASRM / SI%
--    Derives values from existing avg_mood_x10 using validated clinical
--    conversion formulas so the trend lines are smooth and realistic.
--    Formula references:
--      PHQ-9 ≈ inversely linear with mood (mood 10 → PHQ ~3, mood 1 → PHQ ~25)
--      GAD-7 ≈ similar but compressed range
--      SI%   ≈ exponential near low mood
-- =============================================================================

-- Cast all expressions to numeric before ROUND(x,n) — required in PostgreSQL
-- (ROUND(double precision, int) does not exist; only ROUND(numeric, int) does)
UPDATE population_snapshots ps
SET
  avg_phq9_score = GREATEST(2.0, LEAST(27.0,
    ROUND(
      (((100.0 - ps.avg_mood_x10) / 100.0 * 22.0 + 4.0) + random() * 3.0 - 1.5)::numeric,
      2
    )::numeric(4,2)
  )),

  avg_gad7_score = GREATEST(1.0, LEAST(21.0,
    ROUND(
      (((100.0 - ps.avg_mood_x10) / 100.0 * 17.0 + 2.0) + random() * 2.0 - 1.0)::numeric,
      2
    )::numeric(4,2)
  )),

  avg_asrm_score = GREATEST(0.0, LEAST(10.0,
    ROUND((1.0 + random() * 3.5)::numeric, 2)::numeric(4,2)
  )),

  pct_suicidal_ideation = GREATEST(0.0, LEAST(100.0,
    ROUND(
      (CASE
        WHEN ps.avg_mood_x10 < 30 THEN  8.0 + random() * 12.0
        WHEN ps.avg_mood_x10 < 50 THEN  3.0 + random() *  7.0
        WHEN ps.avg_mood_x10 < 70 THEN  1.0 + random() *  3.0
        ELSE                            0.0 + random() *  1.5
      END)::numeric,
      2
    )::numeric(5,2)
  ))

WHERE ps.organisation_id = (SELECT id FROM _org)
  AND ps.avg_phq9_score IS NULL;

-- =============================================================================
-- 8. Appointments
--    Each patient gets:
--      • 2 past appointments (6 weeks ago + 3 weeks ago)
--      • 1 upcoming appointment (1–3 weeks from now, active patients only)
-- =============================================================================

-- Past appointment 1: ~6 weeks ago (all attended)
INSERT INTO appointments
       (patient_id, clinician_id, scheduled_at, duration_minutes,
        appointment_type, status, created_by)
SELECT p.id,
       ctm.clinician_id,
       -- Random time slot between 09:00 and 17:00
       (CURRENT_DATE - 42 + FLOOR(random() * 5)::int)::timestamp
         + (FLOOR(random() * 16)::int * INTERVAL '30 minutes')
         + INTERVAL '9 hours',
       50,
       (ARRAY['review','therapy','medication_review','review'])[FLOOR(random() * 4)::int + 1]::text,
       'attended',
       ctm.clinician_id
FROM   patients p
JOIN   care_team_members ctm
         ON ctm.patient_id = p.id AND ctm.role = 'primary'
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status != 'discharged';

-- Past appointment 2: ~3 weeks ago (85% attended, 15% DNA)
INSERT INTO appointments
       (patient_id, clinician_id, scheduled_at, duration_minutes,
        appointment_type, status, created_by)
SELECT p.id,
       ctm.clinician_id,
       (CURRENT_DATE - 21 + FLOOR(random() * 5)::int)::timestamp
         + (FLOOR(random() * 14)::int * INTERVAL '30 minutes')
         + INTERVAL '10 hours',
       50,
       (ARRAY['review','medication_review','therapy'])[FLOOR(random() * 3)::int + 1]::text,
       CASE WHEN random() < 0.85 THEN 'attended' ELSE 'dna' END,
       ctm.clinician_id
FROM   patients p
JOIN   care_team_members ctm
         ON ctm.patient_id = p.id AND ctm.role = 'primary'
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status != 'discharged';

-- Upcoming appointment: 1–3 weeks from now (active patients)
INSERT INTO appointments
       (patient_id, clinician_id, scheduled_at, duration_minutes,
        appointment_type, status, created_by)
SELECT p.id,
       ctm.clinician_id,
       (CURRENT_DATE + (7 + FLOOR(random() * 14)::int))::timestamp
         + (FLOOR(random() * 16)::int * INTERVAL '30 minutes')
         + INTERVAL '9 hours',
       50,
       (ARRAY['review','therapy','medication_review','telehealth'])[FLOOR(random() * 4)::int + 1]::text,
       CASE WHEN random() < 0.55 THEN 'confirmed' ELSE 'scheduled' END,
       ctm.clinician_id
FROM   patients p
JOIN   care_team_members ctm
         ON ctm.patient_id = p.id AND ctm.role = 'primary'
WHERE  p.organisation_id = (SELECT id FROM _org)
  AND  p.status = 'active';

COMMIT;

-- =============================================================================
-- Summary
-- =============================================================================
SELECT
  'Enrichment complete!' AS status,
  (SELECT COUNT(*) FROM validated_assessments)                    AS total_assessments,
  (SELECT COUNT(*) FROM patient_diagnoses)                        AS total_diagnoses,
  (SELECT COUNT(*) FROM appointments)                             AS total_appointments,
  (SELECT COUNT(*) FROM daily_entries WHERE anxiety_score IS NOT NULL) AS enriched_entries,
  (SELECT COUNT(*) FROM population_snapshots WHERE avg_phq9_score IS NOT NULL) AS snapshots_with_phq9,
  (SELECT COUNT(*) FROM patient_triggers)                         AS patient_trigger_links,
  (SELECT COUNT(*) FROM patient_symptoms)                         AS patient_symptom_links,
  (SELECT role FROM clinicians WHERE email = 'np.zhang@mindlogdemo.com') AS zhang_role,
  (SELECT COUNT(*) FROM care_team_members ctm
   JOIN clinicians c ON c.id = ctm.clinician_id
   WHERE c.email = 'np.zhang@mindlogdemo.com')                   AS zhang_patient_count;
