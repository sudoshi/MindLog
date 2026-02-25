// =============================================================================
// MindLog API — OMOP CDM v5.4 Exporter
//
// Pure mapper functions: MindLog DB rows → OMOP CDM table rows.
// No I/O.  All functions are stateless and side-effect-free.
//
// Output: Tab-separated values (TSV) suitable for bulk-loading into any
// OMOP CDM v5.4 instance via PostgreSQL \COPY, White Rabbit, or ATLAS.
//
// De-identification: person_source_value uses FNV-1a pseudonymisation.
// No PHI fields (name, email, phone, address) appear in any output.
// =============================================================================

import {
  GENDER_CONCEPT,
  TYPE_CONCEPTS,
  MEASUREMENT_CONCEPTS,
  ASSESSMENT_CONCEPTS,
  OBSERVATION_CONCEPTS,
  VISIT_CONCEPTS,
  ICD10_CONDITION_CONCEPTS,
  PASSIVE_HEALTH_CONCEPTS,
  TABLE_OFFSETS,
  type MeasurementConceptDef,
} from './omopConceptMap.js';

// ---------------------------------------------------------------------------
// DB row interfaces (shapes coming from PostgreSQL queries)
// ---------------------------------------------------------------------------

export interface PatientRow {
  id: string;
  omop_person_id: number;
  date_of_birth: string;
  gender: string | null;
  state: string | null;
  updated_at: string;
}

export interface DailyEntryRow {
  id: string;
  patient_id: string;
  entry_date: string;
  mood: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  sleep_quality: number | null;
  anxiety_score: number | null;
  mania_score: number | null;
  coping: number | null;
  anhedonia_score: number | null;
  stress_score: number | null;
  cognitive_score: number | null;
  appetite_score: number | null;
  social_score: number | null;
  suicidal_ideation: number | null;
  substance_use: boolean | null;
  racing_thoughts: boolean | null;
  decreased_sleep_need: boolean | null;
  updated_at: string;
}

export interface AssessmentRow {
  id: string;
  patient_id: string;
  scale: string;
  score: number;
  completed_at: string;
  updated_at: string;
}

export interface MedicationRow {
  id: string;
  patient_id: string;
  medication_name: string;
  rxnorm_code: string | null;
  dosage: string | null;
  prescribed_at: string;
  discontinued_at: string | null;
  updated_at: string;
}

export interface DiagnosisRow {
  id: string;
  patient_id: string;
  icd10_code: string;
  diagnosis_name: string;
  diagnosed_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  appointment_type: string | null;
  scheduled_at: string;
  ended_at: string | null;
  updated_at: string;
}

export interface PassiveHealthRow {
  id: string;
  patient_id: string;
  snapshot_date: string;
  step_count: number | null;
  heart_rate_avg: number | null;
  hrv_sdnn: number | null;
  data_source: string | null;
  updated_at: string;
}

export interface JournalEntryRow {
  id: string;
  patient_id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// OMOP CDM output interfaces
// ---------------------------------------------------------------------------

export interface OmopPerson {
  person_id: number;
  gender_concept_id: number;
  year_of_birth: number;
  month_of_birth: number;
  day_of_birth: number;
  birth_datetime: string;
  race_concept_id: number;
  ethnicity_concept_id: number;
  location_id: string;
  provider_id: string;
  care_site_id: string;
  person_source_value: string;
  gender_source_value: string;
  gender_source_concept_id: number;
  race_source_value: string;
  race_source_concept_id: number;
  ethnicity_source_value: string;
  ethnicity_source_concept_id: number;
}

export interface OmopObservationPeriod {
  observation_period_id: number;
  person_id: number;
  observation_period_start_date: string;
  observation_period_end_date: string;
  period_type_concept_id: number;
}

export interface OmopMeasurement {
  measurement_id: number;
  person_id: number;
  measurement_concept_id: number;
  measurement_date: string;
  measurement_datetime: string;
  measurement_time: string;
  measurement_type_concept_id: number;
  operator_concept_id: number;
  value_as_number: number | null;
  value_as_concept_id: number;
  unit_concept_id: number;
  range_low: string;
  range_high: string;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  measurement_source_value: string;
  measurement_source_concept_id: number;
  unit_source_value: string;
  unit_source_concept_id: number;
  value_source_value: string;
  measurement_event_id: string;
  meas_event_field_concept_id: number;
}

export interface OmopObservation {
  observation_id: number;
  person_id: number;
  observation_concept_id: number;
  observation_date: string;
  observation_datetime: string;
  observation_type_concept_id: number;
  value_as_number: number | null;
  value_as_string: string;
  value_as_concept_id: number;
  qualifier_concept_id: number;
  unit_concept_id: number;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  observation_source_value: string;
  observation_source_concept_id: number;
  unit_source_value: string;
  qualifier_source_value: string;
  value_source_value: string;
  observation_event_id: string;
  obs_event_field_concept_id: number;
}

export interface OmopDrugExposure {
  drug_exposure_id: number;
  person_id: number;
  drug_concept_id: number;
  drug_exposure_start_date: string;
  drug_exposure_start_datetime: string;
  drug_exposure_end_date: string;
  drug_exposure_end_datetime: string;
  verbatim_end_date: string;
  drug_type_concept_id: number;
  stop_reason: string;
  refills: string;
  quantity: string;
  days_supply: string;
  sig: string;
  route_concept_id: number;
  lot_number: string;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  drug_source_value: string;
  drug_source_concept_id: number;
  route_source_value: string;
  dose_unit_source_value: string;
}

export interface OmopConditionOccurrence {
  condition_occurrence_id: number;
  person_id: number;
  condition_concept_id: number;
  condition_start_date: string;
  condition_start_datetime: string;
  condition_end_date: string;
  condition_end_datetime: string;
  condition_type_concept_id: number;
  condition_status_concept_id: number;
  stop_reason: string;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  condition_source_value: string;
  condition_source_concept_id: number;
  condition_status_source_value: string;
}

export interface OmopVisitOccurrence {
  visit_occurrence_id: number;
  person_id: number;
  visit_concept_id: number;
  visit_start_date: string;
  visit_start_datetime: string;
  visit_end_date: string;
  visit_end_datetime: string;
  visit_type_concept_id: number;
  provider_id: string;
  care_site_id: string;
  visit_source_value: string;
  visit_source_concept_id: number;
  admitted_from_concept_id: number;
  admitted_from_source_value: string;
  discharged_to_concept_id: number;
  discharged_to_source_value: string;
  preceding_visit_occurrence_id: string;
}

export interface OmopDeviceExposure {
  device_exposure_id: number;
  person_id: number;
  device_concept_id: number;
  device_exposure_start_date: string;
  device_exposure_start_datetime: string;
  device_exposure_end_date: string;
  device_exposure_end_datetime: string;
  device_type_concept_id: number;
  unique_device_id: string;
  production_id: string;
  quantity: string;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  device_source_value: string;
  device_source_concept_id: number;
  unit_concept_id: number;
  unit_source_value: string;
  unit_source_concept_id: number;
}

export interface OmopNote {
  note_id: number;
  person_id: number;
  note_date: string;
  note_datetime: string;
  note_type_concept_id: number;
  note_class_concept_id: number;
  note_title: string;
  note_text: string;
  encoding_concept_id: number;
  language_concept_id: number;
  provider_id: string;
  visit_occurrence_id: string;
  visit_detail_id: string;
  note_source_value: string;
  note_event_id: string;
  note_event_field_concept_id: number;
}

// ---------------------------------------------------------------------------
// ID generation — deterministic, idempotent, collision-free
// personId * 1_000_000 + tableOffset * 100_000 + sequence
// Supports up to 100K records per person per OMOP table.
// ---------------------------------------------------------------------------

export function makeOmopId(personId: number, tableOffset: number, sequence: number): number {
  return personId * 1_000_000 + tableOffset * 100_000 + sequence;
}

// ---------------------------------------------------------------------------
// Pseudonymisation (FNV-1a hash — same as research exports)
// ---------------------------------------------------------------------------

export function pseudonymise(patientId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < patientId.length; i++) {
    h ^= patientId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `P${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDateStr(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toDateTimeStr(d: string | Date): string {
  if (typeof d === 'string') {
    return d.includes('T') ? d.slice(0, 19) : `${d}T00:00:00`;
  }
  return d.toISOString().slice(0, 19);
}

// ---------------------------------------------------------------------------
// Mapper: patients → PERSON
// ---------------------------------------------------------------------------

export function mapPerson(patient: PatientRow): OmopPerson {
  const dob = new Date(patient.date_of_birth);
  return {
    person_id:                    patient.omop_person_id,
    gender_concept_id:            GENDER_CONCEPT[patient.gender ?? 'other'] ?? 0,
    year_of_birth:                dob.getFullYear(),
    month_of_birth:               dob.getMonth() + 1,
    day_of_birth:                 dob.getDate(),
    birth_datetime:               toDateTimeStr(patient.date_of_birth),
    race_concept_id:              0,
    ethnicity_concept_id:         0,
    location_id:                  '',
    provider_id:                  '',
    care_site_id:                 '',
    person_source_value:          pseudonymise(patient.id),
    gender_source_value:          patient.gender ?? '',
    gender_source_concept_id:     0,
    race_source_value:            '',
    race_source_concept_id:       0,
    ethnicity_source_value:       '',
    ethnicity_source_concept_id:  0,
  };
}

// ---------------------------------------------------------------------------
// Mapper: date range → OBSERVATION_PERIOD
// ---------------------------------------------------------------------------

export function mapObservationPeriod(
  personId: number,
  earliestDate: string,
  latestDate: string,
  seqId: number,
): OmopObservationPeriod {
  return {
    observation_period_id:           makeOmopId(personId, TABLE_OFFSETS.observation_period, seqId),
    person_id:                       personId,
    observation_period_start_date:   toDateStr(earliestDate),
    observation_period_end_date:     toDateStr(latestDate),
    period_type_concept_id:          TYPE_CONCEPTS.period_from_ehr,
  };
}

// ---------------------------------------------------------------------------
// Mapper: daily_entries numeric → MEASUREMENT[]
// ---------------------------------------------------------------------------

const DAILY_NUMERIC_FIELDS = [
  'mood', 'sleep_hours', 'exercise_minutes', 'sleep_quality',
  'anxiety_score', 'mania_score', 'coping', 'anhedonia_score',
  'stress_score', 'cognitive_score', 'appetite_score', 'social_score',
] as const;

export function mapDailyEntryMeasurements(
  entry: DailyEntryRow,
  personId: number,
  baseSeqId: number,
): OmopMeasurement[] {
  const results: OmopMeasurement[] = [];
  let seq = 0;

  for (const field of DAILY_NUMERIC_FIELDS) {
    const value = entry[field];
    if (value == null) continue;

    const concept: MeasurementConceptDef = MEASUREMENT_CONCEPTS[field] ?? {
      concept_id: 0, loinc_code: '', concept_name: field, unit_concept_id: 0, unit_source_value: '',
    };

    results.push({
      measurement_id:              makeOmopId(personId, TABLE_OFFSETS.measurement, baseSeqId + seq),
      person_id:                   personId,
      measurement_concept_id:      concept.concept_id,
      measurement_date:            toDateStr(entry.entry_date),
      measurement_datetime:        toDateTimeStr(entry.entry_date),
      measurement_time:            '',
      measurement_type_concept_id: TYPE_CONCEPTS.patient_self_report,
      operator_concept_id:         0,
      value_as_number:             value,
      value_as_concept_id:         0,
      unit_concept_id:             concept.unit_concept_id,
      range_low:                   '',
      range_high:                  '',
      provider_id:                 '',
      visit_occurrence_id:         '',
      visit_detail_id:             '',
      measurement_source_value:    concept.loinc_code || field,
      measurement_source_concept_id: 0,
      unit_source_value:           concept.unit_source_value,
      unit_source_concept_id:      0,
      value_source_value:          String(value),
      measurement_event_id:        '',
      meas_event_field_concept_id: 0,
    });
    seq++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Mapper: validated_assessments → MEASUREMENT
// ---------------------------------------------------------------------------

export function mapAssessmentMeasurement(
  assessment: AssessmentRow,
  personId: number,
  seqId: number,
): OmopMeasurement {
  const concept = ASSESSMENT_CONCEPTS[assessment.scale] ?? {
    concept_id: 0, loinc_code: '', concept_name: assessment.scale,
  };

  return {
    measurement_id:              makeOmopId(personId, TABLE_OFFSETS.measurement, seqId),
    person_id:                   personId,
    measurement_concept_id:      concept.concept_id,
    measurement_date:            toDateStr(assessment.completed_at),
    measurement_datetime:        toDateTimeStr(assessment.completed_at),
    measurement_time:            '',
    measurement_type_concept_id: TYPE_CONCEPTS.patient_self_report,
    operator_concept_id:         0,
    value_as_number:             assessment.score,
    value_as_concept_id:         0,
    unit_concept_id:             0,
    range_low:                   '',
    range_high:                  '',
    provider_id:                 '',
    visit_occurrence_id:         '',
    visit_detail_id:             '',
    measurement_source_value:    concept.loinc_code || assessment.scale,
    measurement_source_concept_id: 0,
    unit_source_value:           '{score}',
    unit_source_concept_id:      0,
    value_source_value:          String(assessment.score),
    measurement_event_id:        '',
    meas_event_field_concept_id: 0,
  };
}

// ---------------------------------------------------------------------------
// Mapper: daily_entries categorical → OBSERVATION[]
// ---------------------------------------------------------------------------

const OBSERVATION_FIELDS = [
  'suicidal_ideation', 'substance_use', 'racing_thoughts', 'decreased_sleep_need',
] as const;

export function mapDailyEntryObservations(
  entry: DailyEntryRow,
  personId: number,
  baseSeqId: number,
): OmopObservation[] {
  const results: OmopObservation[] = [];
  let seq = 0;

  for (const field of OBSERVATION_FIELDS) {
    const value = entry[field];
    if (value == null) continue;

    // Boolean fields: true = present, false = absent
    const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : (value as number);
    // Skip absent observations
    if (numericValue === 0) continue;

    const concept = OBSERVATION_CONCEPTS[field];
    if (!concept) continue;

    results.push({
      observation_id:              makeOmopId(personId, TABLE_OFFSETS.observation, baseSeqId + seq),
      person_id:                   personId,
      observation_concept_id:      concept.concept_id,
      observation_date:            toDateStr(entry.entry_date),
      observation_datetime:        toDateTimeStr(entry.entry_date),
      observation_type_concept_id: TYPE_CONCEPTS.patient_self_report,
      value_as_number:             numericValue,
      value_as_string:             '',
      value_as_concept_id:         0,
      qualifier_concept_id:        0,
      unit_concept_id:             0,
      provider_id:                 '',
      visit_occurrence_id:         '',
      visit_detail_id:             '',
      observation_source_value:    concept.snomed_code || field,
      observation_source_concept_id: 0,
      unit_source_value:           '',
      qualifier_source_value:      '',
      value_source_value:          String(numericValue),
      observation_event_id:        '',
      obs_event_field_concept_id:  0,
    });
    seq++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Mapper: patient_medications → DRUG_EXPOSURE
// ---------------------------------------------------------------------------

export function mapDrugExposure(
  med: MedicationRow,
  personId: number,
  seqId: number,
): OmopDrugExposure {
  const endDate = med.discontinued_at ?? new Date().toISOString().split('T')[0]!;

  return {
    drug_exposure_id:            makeOmopId(personId, TABLE_OFFSETS.drug_exposure, seqId),
    person_id:                   personId,
    drug_concept_id:             0,   // Would need RxNorm → OMOP mapping
    drug_exposure_start_date:    toDateStr(med.prescribed_at),
    drug_exposure_start_datetime: toDateTimeStr(med.prescribed_at),
    drug_exposure_end_date:      toDateStr(endDate),
    drug_exposure_end_datetime:  toDateTimeStr(endDate),
    verbatim_end_date:           med.discontinued_at ? toDateStr(med.discontinued_at) : '',
    drug_type_concept_id:        TYPE_CONCEPTS.drug_from_prescription,
    stop_reason:                 '',
    refills:                     '',
    quantity:                    '',
    days_supply:                 '',
    sig:                         med.dosage ?? '',
    route_concept_id:            0,
    lot_number:                  '',
    provider_id:                 '',
    visit_occurrence_id:         '',
    visit_detail_id:             '',
    drug_source_value:           med.rxnorm_code ?? med.medication_name,
    drug_source_concept_id:      0,
    route_source_value:          '',
    dose_unit_source_value:      med.dosage ?? '',
  };
}

// ---------------------------------------------------------------------------
// Mapper: patient_diagnoses → CONDITION_OCCURRENCE
// ---------------------------------------------------------------------------

export function mapConditionOccurrence(
  diagnosis: DiagnosisRow,
  personId: number,
  seqId: number,
): OmopConditionOccurrence {
  const conceptId = ICD10_CONDITION_CONCEPTS[diagnosis.icd10_code] ?? 0;

  return {
    condition_occurrence_id:     makeOmopId(personId, TABLE_OFFSETS.condition_occurrence, seqId),
    person_id:                   personId,
    condition_concept_id:        conceptId,
    condition_start_date:        toDateStr(diagnosis.diagnosed_at),
    condition_start_datetime:    toDateTimeStr(diagnosis.diagnosed_at),
    condition_end_date:          diagnosis.resolved_at ? toDateStr(diagnosis.resolved_at) : '',
    condition_end_datetime:      diagnosis.resolved_at ? toDateTimeStr(diagnosis.resolved_at) : '',
    condition_type_concept_id:   TYPE_CONCEPTS.condition_from_ehr,
    condition_status_concept_id: 0,
    stop_reason:                 '',
    provider_id:                 '',
    visit_occurrence_id:         '',
    visit_detail_id:             '',
    condition_source_value:      diagnosis.icd10_code,
    condition_source_concept_id: 0,
    condition_status_source_value: diagnosis.resolved_at ? 'resolved' : 'active',
  };
}

// ---------------------------------------------------------------------------
// Mapper: appointments → VISIT_OCCURRENCE
// ---------------------------------------------------------------------------

export function mapVisitOccurrence(
  appointment: AppointmentRow,
  personId: number,
  seqId: number,
): OmopVisitOccurrence {
  const visitType = appointment.appointment_type ?? 'other';
  const endDate = appointment.ended_at ?? appointment.scheduled_at;

  return {
    visit_occurrence_id:         makeOmopId(personId, TABLE_OFFSETS.visit_occurrence, seqId),
    person_id:                   personId,
    visit_concept_id:            VISIT_CONCEPTS[visitType] ?? 0,
    visit_start_date:            toDateStr(appointment.scheduled_at),
    visit_start_datetime:        toDateTimeStr(appointment.scheduled_at),
    visit_end_date:              toDateStr(endDate),
    visit_end_datetime:          toDateTimeStr(endDate),
    visit_type_concept_id:       TYPE_CONCEPTS.visit_from_ehr,
    provider_id:                 '',
    care_site_id:                '',
    visit_source_value:          visitType,
    visit_source_concept_id:     0,
    admitted_from_concept_id:    0,
    admitted_from_source_value:  '',
    discharged_to_concept_id:    0,
    discharged_to_source_value:  '',
    preceding_visit_occurrence_id: '',
  };
}

// ---------------------------------------------------------------------------
// Mapper: passive_health_snapshots → MEASUREMENT[] (wearable vitals)
// ---------------------------------------------------------------------------

const PASSIVE_FIELDS = ['step_count', 'heart_rate_avg', 'hrv_sdnn'] as const;

export function mapPassiveHealthMeasurements(
  snapshot: PassiveHealthRow,
  personId: number,
  baseSeqId: number,
): OmopMeasurement[] {
  const results: OmopMeasurement[] = [];
  let seq = 0;

  for (const field of PASSIVE_FIELDS) {
    const value = snapshot[field];
    if (value == null) continue;

    const concept = PASSIVE_HEALTH_CONCEPTS[field];
    if (!concept) continue;

    results.push({
      measurement_id:              makeOmopId(personId, TABLE_OFFSETS.measurement, baseSeqId + seq),
      person_id:                   personId,
      measurement_concept_id:      concept.concept_id,
      measurement_date:            toDateStr(snapshot.snapshot_date),
      measurement_datetime:        toDateTimeStr(snapshot.snapshot_date),
      measurement_time:            '',
      measurement_type_concept_id: TYPE_CONCEPTS.patient_self_report,
      operator_concept_id:         0,
      value_as_number:             value,
      value_as_concept_id:         0,
      unit_concept_id:             concept.unit_concept_id,
      range_low:                   '',
      range_high:                  '',
      provider_id:                 '',
      visit_occurrence_id:         '',
      visit_detail_id:             '',
      measurement_source_value:    concept.loinc_code || field,
      measurement_source_concept_id: 0,
      unit_source_value:           concept.unit_source_value,
      unit_source_concept_id:      0,
      value_source_value:          String(value),
      measurement_event_id:        '',
      meas_event_field_concept_id: 0,
    });
    seq++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Mapper: passive_health_snapshots → DEVICE_EXPOSURE (wearable provenance)
// ---------------------------------------------------------------------------

export function mapDeviceExposure(
  snapshot: PassiveHealthRow,
  personId: number,
  seqId: number,
): OmopDeviceExposure {
  return {
    device_exposure_id:            makeOmopId(personId, TABLE_OFFSETS.device_exposure, seqId),
    person_id:                     personId,
    device_concept_id:             0,
    device_exposure_start_date:    toDateStr(snapshot.snapshot_date),
    device_exposure_start_datetime: toDateTimeStr(snapshot.snapshot_date),
    device_exposure_end_date:      toDateStr(snapshot.snapshot_date),
    device_exposure_end_datetime:  toDateTimeStr(snapshot.snapshot_date),
    device_type_concept_id:        TYPE_CONCEPTS.device_inferred,
    unique_device_id:              '',
    production_id:                 '',
    quantity:                      '',
    provider_id:                   '',
    visit_occurrence_id:           '',
    visit_detail_id:               '',
    device_source_value:           snapshot.data_source ?? 'wearable',
    device_source_concept_id:      0,
    unit_concept_id:               0,
    unit_source_value:             '',
    unit_source_concept_id:        0,
  };
}

// ---------------------------------------------------------------------------
// Mapper: journal_entries (shared only) → NOTE
// ---------------------------------------------------------------------------

export function mapJournalNote(
  journal: JournalEntryRow,
  personId: number,
  seqId: number,
): OmopNote {
  return {
    note_id:                     makeOmopId(personId, TABLE_OFFSETS.note, seqId),
    person_id:                   personId,
    note_date:                   toDateStr(journal.created_at),
    note_datetime:               toDateTimeStr(journal.created_at),
    note_type_concept_id:        TYPE_CONCEPTS.note_from_ehr,
    note_class_concept_id:       0,
    note_title:                  journal.title ?? '',
    note_text:                   journal.content,
    encoding_concept_id:         0,
    language_concept_id:         4180186,   // English
    provider_id:                 '',
    visit_occurrence_id:         '',
    visit_detail_id:             '',
    note_source_value:           'patient_journal',
    note_event_id:               '',
    note_event_field_concept_id: 0,
  };
}

// ---------------------------------------------------------------------------
// TSV serialisation
// ---------------------------------------------------------------------------

/** Escape a value for TSV: NULLs as empty string, no tabs in values */
function tsvValue(v: unknown): string {
  if (v == null || v === '') return '';
  return String(v).replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
}

/** Serialise an object to a TSV row (tab-separated, newline-terminated) */
export function toTsvRow(obj: Record<string, unknown>): string {
  return Object.values(obj).map(tsvValue).join('\t') + '\n';
}

/** Generate TSV header from object keys */
export function tsvHeader(obj: Record<string, unknown>): string {
  return Object.keys(obj).join('\t') + '\n';
}

// ---------------------------------------------------------------------------
// OMOP table names for TSV file naming
// ---------------------------------------------------------------------------

export const OMOP_TABLE_NAMES = [
  'person',
  'observation_period',
  'measurement',
  'observation',
  'drug_exposure',
  'condition_occurrence',
  'visit_occurrence',
  'device_exposure',
  'note',
] as const;

export type OmopTableName = typeof OMOP_TABLE_NAMES[number];
