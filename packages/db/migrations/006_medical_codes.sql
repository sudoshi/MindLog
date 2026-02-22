-- =============================================================================
-- MindLog — Migration 006: Medical code infrastructure
-- Adds SNOMED-CT, RxNorm/NDC, LOINC columns to catalogue tables.
-- Seeds ICD-10 psychiatric codes (DSM-5-aligned).
-- Seeds SNOMED-CT codes for existing system symptoms.
-- Seeds RxNorm codes for existing medications catalogue entries.
-- Adds OMOP CDM readiness fields and population health metrics.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Symptom catalogue — SNOMED-CT
-- ---------------------------------------------------------------------------
ALTER TABLE symptom_catalogue
    ADD COLUMN IF NOT EXISTS snomed_code    TEXT,
    ADD COLUMN IF NOT EXISTS snomed_display TEXT;

COMMENT ON COLUMN symptom_catalogue.snomed_code    IS 'SNOMED CT concept ID (numeric string)';
COMMENT ON COLUMN symptom_catalogue.snomed_display IS 'SNOMED CT preferred term';

-- ---------------------------------------------------------------------------
-- 2. Trigger catalogue — SNOMED-CT
-- ---------------------------------------------------------------------------
ALTER TABLE trigger_catalogue
    ADD COLUMN IF NOT EXISTS snomed_code    TEXT,
    ADD COLUMN IF NOT EXISTS snomed_display TEXT;

COMMENT ON COLUMN trigger_catalogue.snomed_code    IS 'SNOMED CT concept ID (numeric string)';
COMMENT ON COLUMN trigger_catalogue.snomed_display IS 'SNOMED CT preferred term';

-- ---------------------------------------------------------------------------
-- 3. Medications catalogue — RxNorm + NDC
-- ---------------------------------------------------------------------------
ALTER TABLE medications_catalogue
    ADD COLUMN IF NOT EXISTS rxnorm_code    TEXT,
    ADD COLUMN IF NOT EXISTS rxnorm_display TEXT,
    ADD COLUMN IF NOT EXISTS ndc_code       TEXT;

COMMENT ON COLUMN medications_catalogue.rxnorm_code    IS 'RxNorm concept unique identifier (RXCUI)';
COMMENT ON COLUMN medications_catalogue.rxnorm_display IS 'RxNorm preferred name';
COMMENT ON COLUMN medications_catalogue.ndc_code       IS 'National Drug Code (first NDC for reference)';

ALTER TABLE patient_medications
    ADD COLUMN IF NOT EXISTS rxnorm_code TEXT;

COMMENT ON COLUMN patient_medications.rxnorm_code IS 'RxNorm RXCUI — denormalised for convenience when catalogue_id is null';

-- ---------------------------------------------------------------------------
-- 4. Validated assessments — LOINC (table created in migration 005)
-- ---------------------------------------------------------------------------
ALTER TABLE validated_assessments
    ADD COLUMN IF NOT EXISTS loinc_code TEXT;

COMMENT ON COLUMN validated_assessments.loinc_code IS 'LOINC panel code for the assessment instrument';

-- ---------------------------------------------------------------------------
-- 5. Patients — OMOP CDM + research cohort fields
-- ---------------------------------------------------------------------------
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS omop_person_id     BIGINT UNIQUE,
    ADD COLUMN IF NOT EXISTS research_cohort    TEXT,
    ADD COLUMN IF NOT EXISTS primary_icd10_code TEXT REFERENCES icd10_codes(code);

COMMENT ON COLUMN patients.omop_person_id     IS 'OMOP CDM person_id assigned when patient consents to research data export';
COMMENT ON COLUMN patients.research_cohort    IS 'Derived primary cohort label (bipolar_i, mdd, gad, etc.) for fast population queries';
COMMENT ON COLUMN patients.primary_icd10_code IS 'Denormalised primary diagnosis code for efficient cohort filtering';

-- ---------------------------------------------------------------------------
-- 6. Population snapshots — clinical scale averages + safety metrics
-- ---------------------------------------------------------------------------
ALTER TABLE population_snapshots
    ADD COLUMN IF NOT EXISTS avg_phq9_score         NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS avg_gad7_score         NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS avg_asrm_score         NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS pct_suicidal_ideation  NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS pct_substance_use      NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS med_adherence_rate     NUMERIC(5,2);

COMMENT ON COLUMN population_snapshots.pct_suicidal_ideation IS '% of active patients who endorsed any suicidal ideation in this period';
COMMENT ON COLUMN population_snapshots.med_adherence_rate    IS '% of scheduled medication doses taken across all active patients';

-- ---------------------------------------------------------------------------
-- 7. ICD-10 psychiatric code seed (DSM-5-aligned)
-- ---------------------------------------------------------------------------
INSERT INTO icd10_codes (code, description, chapter, block) VALUES
    ('F31.0',  'Bipolar disorder, current episode hypomanic',                                'V', 'F30-F39'),
    ('F31.1',  'Bipolar disorder, current episode manic without psychotic features',         'V', 'F30-F39'),
    ('F31.2',  'Bipolar disorder, current episode manic with psychotic features',            'V', 'F30-F39'),
    ('F31.30', 'Bipolar disorder, current episode depressed, mild or moderate severity',     'V', 'F30-F39'),
    ('F31.31', 'Bipolar disorder, current episode depressed, mild',                          'V', 'F30-F39'),
    ('F31.32', 'Bipolar disorder, current episode depressed, moderate',                      'V', 'F30-F39'),
    ('F31.4',  'Bipolar disorder, current episode depressed, severe without psychotic features', 'V', 'F30-F39'),
    ('F31.5',  'Bipolar disorder, current episode depressed, severe with psychotic features','V', 'F30-F39'),
    ('F31.9',  'Bipolar disorder, unspecified',                                               'V', 'F30-F39'),
    ('F32.0',  'Major depressive disorder, single episode, mild',                            'V', 'F30-F39'),
    ('F32.1',  'Major depressive disorder, single episode, moderate',                        'V', 'F30-F39'),
    ('F32.2',  'Major depressive disorder, single episode, severe without psychotic features','V', 'F30-F39'),
    ('F32.3',  'Major depressive disorder, single episode, severe with psychotic features',  'V', 'F30-F39'),
    ('F32.9',  'Major depressive disorder, single episode, unspecified',                     'V', 'F30-F39'),
    ('F33.0',  'Major depressive disorder, recurrent, mild',                                 'V', 'F30-F39'),
    ('F33.1',  'Major depressive disorder, recurrent, moderate',                             'V', 'F30-F39'),
    ('F33.2',  'Major depressive disorder, recurrent, severe without psychotic features',    'V', 'F30-F39'),
    ('F33.9',  'Major depressive disorder, recurrent, unspecified',                          'V', 'F30-F39'),
    ('F41.0',  'Panic disorder without agoraphobia',                                         'V', 'F40-F48'),
    ('F41.1',  'Generalized anxiety disorder',                                               'V', 'F40-F48'),
    ('F41.9',  'Anxiety disorder, unspecified',                                              'V', 'F40-F48'),
    ('F42.2',  'Mixed obsessional thoughts and acts',                                        'V', 'F40-F48'),
    ('F43.10', 'Post-traumatic stress disorder, unspecified',                                'V', 'F40-F48'),
    ('F43.12', 'Post-traumatic stress disorder, chronic',                                    'V', 'F40-F48'),
    ('F90.0',  'Attention-deficit hyperactivity disorder, predominantly inattentive type',   'V', 'F90-F98'),
    ('F90.2',  'Attention-deficit hyperactivity disorder, combined type',                    'V', 'F90-F98')
ON CONFLICT (code) DO UPDATE
    SET description = EXCLUDED.description,
        chapter     = EXCLUDED.chapter,
        block       = EXCLUDED.block;

-- ---------------------------------------------------------------------------
-- 8. SNOMED-CT codes for system symptoms
--    Names must match exactly what is seeded in 001_initial.sql
--    plus what is added in 004_expanded_daily_entry.sql.
-- ---------------------------------------------------------------------------
UPDATE symptom_catalogue SET snomed_code = '40979000',  snomed_display = 'Irritable mood'               WHERE name = 'Irritability'              AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '7895008',   snomed_display = 'Aggressive behaviour'         WHERE name = 'Anger'                     AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '366979004', snomed_display = 'Depressed mood'               WHERE name = 'Sadness'                   AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '48694002',  snomed_display = 'Anxiety'                      WHERE name = 'Anxiety'                   AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '35489007',  snomed_display = 'Depressive disorder'          WHERE name = 'Feeling Hopeless'          AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '84229001',  snomed_display = 'Fatigue'                      WHERE name = 'Loss of Energy'            AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '6471006',   snomed_display = 'Suicidal ideation'            WHERE name = 'Suicidal Thoughts'         AND is_system = TRUE;
-- Existing seeds use 'Insufficient Sleep' / 'Excessive Sleep' (not Insomnia/Hypersomnia)
UPDATE symptom_catalogue SET snomed_code = '193462001', snomed_display = 'Insomnia'                     WHERE name = 'Insufficient Sleep'        AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '271782001', snomed_display = 'Hypersomnia'                  WHERE name = 'Excessive Sleep'           AND is_system = TRUE;
-- Additional symptoms added in migration 004
UPDATE symptom_catalogue SET snomed_code = '71978007',  snomed_display = 'Racing thoughts'              WHERE name = 'Racing Thoughts'           AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '13791008',  snomed_display = 'Elevated mood'                WHERE name = 'Elevated Mood'             AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '386806002', snomed_display = 'Impaired cognition'           WHERE name = 'Poor Concentration'        AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '247592009', snomed_display = 'Social withdrawal'            WHERE name = 'Social Withdrawal'         AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '44548000',  snomed_display = 'Impulsive behaviour'          WHERE name = 'Impulsivity'               AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '248255006', snomed_display = 'Decreased need for sleep'     WHERE name = 'Decreased Need for Sleep'  AND is_system = TRUE;
-- Appetite (already seeded in 001)
UPDATE symptom_catalogue SET snomed_code = '64379006',  snomed_display = 'Increased appetite'           WHERE name = 'Increased Appetite'        AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '79890006',  snomed_display = 'Loss of appetite'             WHERE name = 'Decreased Appetite'        AND is_system = TRUE;
-- Brain Fog and Somatic Anxiety added in 004
UPDATE symptom_catalogue SET snomed_code = '386806002', snomed_display = 'Impaired cognition'           WHERE name = 'Brain Fog'                 AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '272430001', snomed_display = 'Physical symptom'             WHERE name = 'Somatic Anxiety'           AND is_system = TRUE;
-- Original seeds also have these
UPDATE symptom_catalogue SET snomed_code = '225609004', snomed_display = 'Feeling guilty'               WHERE name = 'Feeling Guilty'            AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '225608007', snomed_display = 'Feeling worthless'            WHERE name = 'Feeling Worthless'         AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '263821009', snomed_display = 'Negative self-concept'        WHERE name = 'Negative Self Talk'        AND is_system = TRUE;
UPDATE symptom_catalogue SET snomed_code = '309356006', snomed_display = 'Loss of interest'             WHERE name = 'Loss of Interest'          AND is_system = TRUE;

-- ---------------------------------------------------------------------------
-- 9. RxNorm codes for common psychiatric medications
--    Matches on generic_name (case-insensitive) — safe because catalogue
--    uses standardised generic names.
-- ---------------------------------------------------------------------------
UPDATE medications_catalogue SET rxnorm_code = '6450',   rxnorm_display = 'Lithium Carbonate'  WHERE generic_name ILIKE '%lithium%';
UPDATE medications_catalogue SET rxnorm_code = '51249',  rxnorm_display = 'Quetiapine'         WHERE generic_name ILIKE '%quetiapine%';
UPDATE medications_catalogue SET rxnorm_code = '28439',  rxnorm_display = 'Lamotrigine'        WHERE generic_name ILIKE '%lamotrigine%';
UPDATE medications_catalogue SET rxnorm_code = '36437',  rxnorm_display = 'Sertraline'         WHERE generic_name ILIKE '%sertraline%';
UPDATE medications_catalogue SET rxnorm_code = '321988', rxnorm_display = 'Escitalopram'       WHERE generic_name ILIKE '%escitalopram%';
UPDATE medications_catalogue SET rxnorm_code = '89013',  rxnorm_display = 'Aripiprazole'       WHERE generic_name ILIKE '%aripiprazole%';
UPDATE medications_catalogue SET rxnorm_code = '11118',  rxnorm_display = 'Valproic Acid'      WHERE generic_name ILIKE '%valproic%' OR generic_name ILIKE '%valproate%';
UPDATE medications_catalogue SET rxnorm_code = '61381',  rxnorm_display = 'Olanzapine'         WHERE generic_name ILIKE '%olanzapine%';
UPDATE medications_catalogue SET rxnorm_code = '42347',  rxnorm_display = 'Bupropion'          WHERE generic_name ILIKE '%bupropion%';
UPDATE medications_catalogue SET rxnorm_code = '39786',  rxnorm_display = 'Venlafaxine'        WHERE generic_name ILIKE '%venlafaxine%';
UPDATE medications_catalogue SET rxnorm_code = '2403',   rxnorm_display = 'Clonazepam'         WHERE generic_name ILIKE '%clonazepam%';
UPDATE medications_catalogue SET rxnorm_code = '17174',  rxnorm_display = 'Lorazepam'          WHERE generic_name ILIKE '%lorazepam%';
UPDATE medications_catalogue SET rxnorm_code = '41493',  rxnorm_display = 'Fluoxetine'         WHERE generic_name ILIKE '%fluoxetine%';
UPDATE medications_catalogue SET rxnorm_code = '32937',  rxnorm_display = 'Risperidone'        WHERE generic_name ILIKE '%risperidone%';
UPDATE medications_catalogue SET rxnorm_code = '3498',   rxnorm_display = 'Clozapine'          WHERE generic_name ILIKE '%clozapine%';
UPDATE medications_catalogue SET rxnorm_code = '58827',  rxnorm_display = 'Lurasidone'         WHERE generic_name ILIKE '%lurasidone%';
UPDATE medications_catalogue SET rxnorm_code = '50121',  rxnorm_display = 'Ziprasidone'        WHERE generic_name ILIKE '%ziprasidone%';
UPDATE medications_catalogue SET rxnorm_code = '72625',  rxnorm_display = 'Paliperidone'       WHERE generic_name ILIKE '%paliperidone%';
