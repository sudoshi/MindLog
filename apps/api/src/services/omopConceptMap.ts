// =============================================================================
// MindLog API — OMOP CDM v5.4 Concept Mappings
//
// Static concept_id mappings for transforming MindLog clinical data into
// OMOP CDM format. All IDs sourced from Athena (OHDSI) vocabulary.
//
// Pure data — no I/O, no side effects. Version-controlled and testable.
// =============================================================================

// ---------------------------------------------------------------------------
// Gender concepts (OMOP standard — Gender domain)
// ---------------------------------------------------------------------------

export const GENDER_CONCEPT: Record<string, number> = {
  male:   8507,
  female: 8532,
  other:  0,      // No matching concept
};

// ---------------------------------------------------------------------------
// Type concepts — provenance of the data
// ---------------------------------------------------------------------------

export const TYPE_CONCEPTS = {
  /** Patient self-report via mobile app */
  patient_self_report:       44818702,
  /** Observation period derived from EHR */
  period_from_ehr:           44814724,
  /** Condition from EHR problem list */
  condition_from_ehr:        32020,
  /** Drug exposure from prescription */
  drug_from_prescription:    38000177,
  /** Visit derived from EHR */
  visit_from_ehr:            44818518,
  /** Note from EHR */
  note_from_ehr:             44814645,
  /** Device inferred from data */
  device_inferred:           44818707,
} as const;

// ---------------------------------------------------------------------------
// Measurement concepts — daily_entries numeric fields → OMOP MEASUREMENT
// ---------------------------------------------------------------------------

export interface MeasurementConceptDef {
  concept_id: number;
  loinc_code: string;
  concept_name: string;
  unit_concept_id: number;
  unit_source_value: string;
}

export const MEASUREMENT_CONCEPTS: Record<string, MeasurementConceptDef> = {
  mood: {
    concept_id:        40758889,
    loinc_code:        '72828-7',
    concept_name:      'Mood score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  sleep_hours: {
    concept_id:        3024171,
    loinc_code:        '65968-7',
    concept_name:      'Sleep duration',
    unit_concept_id:   8505,    // hour
    unit_source_value: 'h',
  },
  exercise_minutes: {
    concept_id:        40762499,
    loinc_code:        '55423-8',
    concept_name:      'Exercise duration',
    unit_concept_id:   8550,    // minute
    unit_source_value: 'min',
  },
  sleep_quality: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Sleep quality score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  anxiety_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Anxiety score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  mania_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Mania score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  coping: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Coping score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  anhedonia_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Anhedonia score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  stress_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Stress score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  cognitive_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Cognitive function score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  appetite_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Appetite score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
  social_score: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Social engagement score',
    unit_concept_id:   0,
    unit_source_value: '{score}',
  },
};

// ---------------------------------------------------------------------------
// Assessment concepts — validated_assessments.scale → OMOP MEASUREMENT
// ---------------------------------------------------------------------------

export interface AssessmentConceptDef {
  concept_id: number;
  loinc_code: string;
  concept_name: string;
}

export const ASSESSMENT_CONCEPTS: Record<string, AssessmentConceptDef> = {
  'PHQ-9': {
    concept_id:   40758882,
    loinc_code:   '44249-1',
    concept_name: 'PHQ-9 total score',
  },
  'GAD-7': {
    concept_id:   40766345,
    loinc_code:   '69737-5',
    concept_name: 'GAD-7 total score',
  },
  'ISI': {
    concept_id:   0,
    loinc_code:   '89794-0',
    concept_name: 'Insomnia Severity Index total score',
  },
  'C-SSRS': {
    concept_id:   0,
    loinc_code:   '89213-1',
    concept_name: 'C-SSRS Screener total score',
  },
  'ASRM': {
    concept_id:   0,
    loinc_code:   '',
    concept_name: 'Altman Self-Rating Mania Scale total score',
  },
  'WHODAS': {
    concept_id:   0,
    loinc_code:   '',
    concept_name: 'WHODAS 2.0 total score',
  },
};

// ---------------------------------------------------------------------------
// Observation concepts — daily_entries categorical fields → OMOP OBSERVATION
// ---------------------------------------------------------------------------

export interface ObservationConceptDef {
  concept_id: number;
  snomed_code: string;
  concept_name: string;
}

export const OBSERVATION_CONCEPTS: Record<string, ObservationConceptDef> = {
  suicidal_ideation: {
    concept_id:   4150489,
    snomed_code:  '6471006',
    concept_name: 'Suicidal ideation',
  },
  substance_use: {
    concept_id:   4041306,
    snomed_code:  '',
    concept_name: 'Substance use',
  },
  racing_thoughts: {
    concept_id:   4326432,
    snomed_code:  '71978007',
    concept_name: 'Racing thoughts',
  },
  decreased_sleep_need: {
    concept_id:   0,
    snomed_code:  '',
    concept_name: 'Decreased need for sleep',
  },
};

// ---------------------------------------------------------------------------
// Visit concepts — appointment type → OMOP VISIT_OCCURRENCE
// ---------------------------------------------------------------------------

export const VISIT_CONCEPTS: Record<string, number> = {
  telehealth: 5083,
  in_person:  9202,
  phone:      5083,   // Telehealth equivalent
  other:      0,
};

// ---------------------------------------------------------------------------
// ICD-10 condition concepts — seeded ICD-10 codes → OMOP CONDITION concept_ids
// Maps ICD-10-CM codes to OMOP standard concept_ids (SNOMED domain).
// ---------------------------------------------------------------------------

export const ICD10_CONDITION_CONCEPTS: Record<string, number> = {
  'F32.0':  4152280,   // Major depressive disorder, single episode, mild
  'F32.1':  4153428,   // Major depressive disorder, single episode, moderate
  'F32.2':  4152011,   // Major depressive disorder, single episode, severe
  'F32.9':  440383,    // Major depressive disorder, single episode, unspecified
  'F33.0':  4282096,   // Major depressive disorder, recurrent, mild
  'F33.1':  4283893,   // Major depressive disorder, recurrent, moderate
  'F33.2':  4281438,   // Major depressive disorder, recurrent, severe
  'F33.9':  4152011,   // Major depressive disorder, recurrent, unspecified
  'F41.0':  436676,    // Panic disorder
  'F41.1':  441542,    // Generalized anxiety disorder
  'F41.9':  441542,    // Anxiety disorder, unspecified
  'F31.0':  436665,    // Bipolar disorder, current episode hypomanic
  'F31.1':  436665,    // Bipolar disorder, current episode manic, mild
  'F31.2':  436665,    // Bipolar disorder, current episode manic, moderate
  'F31.9':  436665,    // Bipolar disorder, unspecified
  'F43.10': 4245975,   // Post-traumatic stress disorder
  'F43.11': 4245975,   // PTSD, acute
  'F43.12': 4245975,   // PTSD, chronic
  'F42.2':  435783,    // Obsessive-compulsive disorder, mixed
  'F42.9':  435783,    // OCD, unspecified
  'F50.00': 436073,    // Anorexia nervosa, unspecified
  'F50.01': 436073,    // Anorexia nervosa, restricting type
  'F50.02': 436073,    // Anorexia nervosa, binge-purge type
  'F50.2':  440704,    // Bulimia nervosa
  'F50.81': 4068838,   // Binge eating disorder
  'F51.01': 436962,    // Primary insomnia
  'F51.02': 436962,    // Adjustment insomnia
};

// ---------------------------------------------------------------------------
// Passive health concepts — wearable data → OMOP MEASUREMENT
// ---------------------------------------------------------------------------

export const PASSIVE_HEALTH_CONCEPTS: Record<string, MeasurementConceptDef> = {
  step_count: {
    concept_id:        40771067,
    loinc_code:        '55423-8',
    concept_name:      'Step count',
    unit_concept_id:   8510,    // {count}
    unit_source_value: 'steps',
  },
  heart_rate_avg: {
    concept_id:        3027018,
    loinc_code:        '8867-4',
    concept_name:      'Heart rate',
    unit_concept_id:   8541,    // beats/min
    unit_source_value: 'bpm',
  },
  hrv_sdnn: {
    concept_id:        0,
    loinc_code:        '',
    concept_name:      'Heart rate variability SDNN',
    unit_concept_id:   8529,    // millisecond
    unit_source_value: 'ms',
  },
};

// ---------------------------------------------------------------------------
// OMOP table offsets for deterministic ID generation
// personId * 1_000_000 + tableOffset * 100_000 + sequence
// ---------------------------------------------------------------------------

export const TABLE_OFFSETS = {
  observation_period:   0,
  measurement:          1,
  observation:          2,
  drug_exposure:        3,
  condition_occurrence: 4,
  visit_occurrence:     5,
  device_exposure:      6,
  note:                 7,
} as const;
