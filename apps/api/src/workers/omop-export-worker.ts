// =============================================================================
// MindLog API — OMOP CDM Export Worker
//
// BullMQ worker that performs incremental ETL from MindLog source tables
// to OMOP CDM v5.4 TSV files. Uploads to Supabase Storage for download.
//
// Flow:
//   1. Read high-water marks from omop_export_hwm
//   2. Query consented patients (data_research consent)
//   3. For each OMOP table: query source rows WHERE updated_at > HWM
//   4. Map rows → OMOP format, write TSV buffers
//   5. Upload TSV files to Supabase Storage
//   6. Update HWM timestamps + export run record
//
// Concurrency: 1 (serialised writes to avoid HWM race conditions)
// =============================================================================

import { Worker, Queue, type Job } from 'bullmq';
import { sql } from '@mindlog/db';
import { connection } from './rules-engine.js';
import { config } from '../config.js';
import {
  mapPerson,
  mapObservationPeriod,
  mapDailyEntryMeasurements,
  mapAssessmentMeasurement,
  mapDailyEntryObservations,
  mapDrugExposure,
  mapConditionOccurrence,
  mapVisitOccurrence,
  mapPassiveHealthMeasurements,
  mapDeviceExposure,
  mapJournalNote,
  toTsvRow,
  tsvHeader,
  OMOP_TABLE_NAMES,
  type PatientRow,
  type DailyEntryRow,
  type AssessmentRow,
  type MedicationRow,
  type DiagnosisRow,
  type AppointmentRow,
  type PassiveHealthRow,
  type JournalEntryRow,
  type OmopTableName,
} from '../services/omopExporter.js';

// ---------------------------------------------------------------------------
// Queue setup
// ---------------------------------------------------------------------------

const OMOP_QUEUE_NAME = 'mindlog-omop-exports';
export const omopExportQueue = new Queue(OMOP_QUEUE_NAME, { connection });

export interface OmopExportJobData {
  exportRunId: string;
  triggeredBy: 'nightly' | 'manual';
  outputMode: 'tsv_upload';
  fullRefresh: boolean;
}

// ---------------------------------------------------------------------------
// Storage constants
// ---------------------------------------------------------------------------

const STORAGE_BUCKET    = 'research-exports';
const SIGNED_URL_EXPIRY = 48 * 3600; // 48 hours

// ---------------------------------------------------------------------------
// HWM row shape
// ---------------------------------------------------------------------------

interface HwmRow {
  patients_hwm: string;
  daily_entries_hwm: string;
  validated_assessments_hwm: string;
  patient_medications_hwm: string;
  patient_diagnoses_hwm: string;
  appointments_hwm: string;
  passive_health_hwm: string;
  journal_entries_hwm: string;
}

// ---------------------------------------------------------------------------
// TSV buffer accumulator
// ---------------------------------------------------------------------------

class TsvAccumulator {
  private buffers: Map<OmopTableName, string[]> = new Map();
  private headers: Map<OmopTableName, string> = new Map();
  private counts: Map<OmopTableName, number> = new Map();

  append(table: OmopTableName, row: Record<string, unknown>): void {
    if (!this.headers.has(table)) {
      this.headers.set(table, tsvHeader(row));
      this.buffers.set(table, []);
      this.counts.set(table, 0);
    }
    this.buffers.get(table)!.push(toTsvRow(row));
    this.counts.set(table, (this.counts.get(table) ?? 0) + 1);
  }

  toBuffer(table: OmopTableName): Buffer | null {
    const header = this.headers.get(table);
    const rows = this.buffers.get(table);
    if (!header || !rows || rows.length === 0) return null;
    return Buffer.from(header + rows.join(''), 'utf8');
  }

  getCount(table: OmopTableName): number {
    return this.counts.get(table) ?? 0;
  }

  getCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const table of OMOP_TABLE_NAMES) {
      const count = this.getCount(table);
      if (count > 0) result[table] = count;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Main ETL pipeline
// ---------------------------------------------------------------------------

async function processOmopExport(job: Job<OmopExportJobData>): Promise<void> {
  const { exportRunId, fullRefresh } = job.data;

  // Step 1: Mark as processing
  await sql`
    UPDATE omop_export_runs
    SET status = 'processing', started_at = NOW()
    WHERE id = ${exportRunId}::UUID
  `;

  try {
    // Step 2: Ensure fresh OMOP person IDs
    await sql`SELECT assign_omop_person_ids()`;

    // Step 3: Read high-water marks
    const epoch = '1970-01-01T00:00:00Z';
    let hwm: HwmRow;
    if (fullRefresh) {
      hwm = {
        patients_hwm: epoch,
        daily_entries_hwm: epoch,
        validated_assessments_hwm: epoch,
        patient_medications_hwm: epoch,
        patient_diagnoses_hwm: epoch,
        appointments_hwm: epoch,
        passive_health_hwm: epoch,
        journal_entries_hwm: epoch,
      };
    } else {
      const [row] = await sql<HwmRow[]>`SELECT * FROM omop_export_hwm WHERE id = 1`;
      hwm = row ?? {
        patients_hwm: epoch,
        daily_entries_hwm: epoch,
        validated_assessments_hwm: epoch,
        patient_medications_hwm: epoch,
        patient_diagnoses_hwm: epoch,
        appointments_hwm: epoch,
        passive_health_hwm: epoch,
        journal_entries_hwm: epoch,
      };
    }

    // Step 4: Fetch consented patients (data_research consent)
    const consentedPatients = await sql<(PatientRow & { omop_person_id: number })[]>`
      SELECT p.id, p.omop_person_id, p.date_of_birth, p.gender, p.state, p.updated_at::TEXT AS updated_at
      FROM patients p
      JOIN consent_records cr
        ON cr.patient_id = p.id
       AND cr.consent_type = 'data_research'
       AND cr.granted = TRUE
      WHERE p.is_active = TRUE
        AND p.omop_person_id IS NOT NULL
    `;

    if (consentedPatients.length === 0) {
      await sql`
        UPDATE omop_export_runs
        SET status = 'completed', completed_at = NOW(),
            record_counts = '{}', file_urls = '{}'
        WHERE id = ${exportRunId}::UUID
      `;
      console.info(`[omop-export] No consented patients — export ${exportRunId} completed (empty)`);
      return;
    }

    // Build patient ID → omop_person_id lookup
    const personIdMap = new Map<string, number>();
    for (const p of consentedPatients) {
      personIdMap.set(p.id, p.omop_person_id);
    }
    const patientIds = [...personIdMap.keys()];

    const tsv = new TsvAccumulator();

    // Track new HWM timestamps
    const newHwm: Record<string, string> = {};
    const now = new Date().toISOString();

    // ── PERSON ──────────────────────────────────────────────────
    const changedPatients = consentedPatients.filter(
      (p) => p.updated_at > hwm.patients_hwm
    );
    for (const p of changedPatients) {
      tsv.append('person', mapPerson(p) as unknown as Record<string, unknown>);
    }
    newHwm['patients_hwm'] = now;

    // ── OBSERVATION_PERIOD ──────────────────────────────────────
    // Computed from daily_entries date range per patient
    const dateRanges = await sql<{ patient_id: string; min_date: string; max_date: string }[]>`
      SELECT patient_id, MIN(entry_date)::TEXT AS min_date, MAX(entry_date)::TEXT AS max_date
      FROM daily_entries
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND submitted_at IS NOT NULL
      GROUP BY patient_id
    `;
    for (const dr of dateRanges) {
      const personId = personIdMap.get(dr.patient_id);
      if (!personId) continue;
      tsv.append('observation_period',
        mapObservationPeriod(personId, dr.min_date, dr.max_date, 0) as unknown as Record<string, unknown>
      );
    }

    // ── MEASUREMENT (daily_entries numeric) ─────────────────────
    const dailyEntries = await sql<DailyEntryRow[]>`
      SELECT id, patient_id, entry_date::TEXT AS entry_date,
             mood, sleep_hours, exercise_minutes, sleep_quality,
             anxiety_score, mania_score, coping, anhedonia_score,
             stress_score, cognitive_score, appetite_score, social_score,
             suicidal_ideation, substance_use, racing_thoughts, decreased_sleep_need,
             updated_at::TEXT AS updated_at
      FROM daily_entries
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND submitted_at IS NOT NULL
        AND updated_at > ${hwm.daily_entries_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, entry_date
    `;

    // Per-patient sequence counters for measurement IDs
    const measurementSeq = new Map<number, number>();
    const observationSeq = new Map<number, number>();

    for (const entry of dailyEntries) {
      const personId = personIdMap.get(entry.patient_id);
      if (!personId) continue;

      // Measurements
      const mSeq = measurementSeq.get(personId) ?? 0;
      const measurements = mapDailyEntryMeasurements(entry, personId, mSeq);
      for (const m of measurements) {
        tsv.append('measurement', m as unknown as Record<string, unknown>);
      }
      measurementSeq.set(personId, mSeq + measurements.length);

      // Observations (categorical)
      const oSeq = observationSeq.get(personId) ?? 0;
      const observations = mapDailyEntryObservations(entry, personId, oSeq);
      for (const o of observations) {
        tsv.append('observation', o as unknown as Record<string, unknown>);
      }
      observationSeq.set(personId, oSeq + observations.length);
    }
    newHwm['daily_entries_hwm'] = now;

    // ── MEASUREMENT (validated_assessments) ─────────────────────
    const assessments = await sql<AssessmentRow[]>`
      SELECT id, patient_id, scale, score,
             completed_at::TEXT AS completed_at,
             updated_at::TEXT AS updated_at
      FROM validated_assessments
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND updated_at > ${hwm.validated_assessments_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, completed_at
    `;

    for (const a of assessments) {
      const personId = personIdMap.get(a.patient_id);
      if (!personId) continue;
      const mSeq = measurementSeq.get(personId) ?? 0;
      tsv.append('measurement',
        mapAssessmentMeasurement(a, personId, mSeq) as unknown as Record<string, unknown>
      );
      measurementSeq.set(personId, mSeq + 1);
    }
    newHwm['validated_assessments_hwm'] = now;

    // ── DRUG_EXPOSURE ───────────────────────────────────────────
    const medications = await sql<MedicationRow[]>`
      SELECT id, patient_id, medication_name, rxnorm_code, dosage,
             prescribed_at::TEXT AS prescribed_at,
             discontinued_at::TEXT AS discontinued_at,
             updated_at::TEXT AS updated_at
      FROM patient_medications
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND updated_at > ${hwm.patient_medications_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, prescribed_at
    `;

    const drugSeq = new Map<number, number>();
    for (const med of medications) {
      const personId = personIdMap.get(med.patient_id);
      if (!personId) continue;
      const seq = drugSeq.get(personId) ?? 0;
      tsv.append('drug_exposure',
        mapDrugExposure(med, personId, seq) as unknown as Record<string, unknown>
      );
      drugSeq.set(personId, seq + 1);
    }
    newHwm['patient_medications_hwm'] = now;

    // ── CONDITION_OCCURRENCE ────────────────────────────────────
    const diagnoses = await sql<DiagnosisRow[]>`
      SELECT id, patient_id, icd10_code, diagnosis_name,
             diagnosed_at::TEXT AS diagnosed_at,
             resolved_at::TEXT AS resolved_at,
             updated_at::TEXT AS updated_at
      FROM patient_diagnoses
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND updated_at > ${hwm.patient_diagnoses_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, diagnosed_at
    `;

    const condSeq = new Map<number, number>();
    for (const diag of diagnoses) {
      const personId = personIdMap.get(diag.patient_id);
      if (!personId) continue;
      const seq = condSeq.get(personId) ?? 0;
      tsv.append('condition_occurrence',
        mapConditionOccurrence(diag, personId, seq) as unknown as Record<string, unknown>
      );
      condSeq.set(personId, seq + 1);
    }
    newHwm['patient_diagnoses_hwm'] = now;

    // ── VISIT_OCCURRENCE ────────────────────────────────────────
    const appointments = await sql<AppointmentRow[]>`
      SELECT id, patient_id, appointment_type,
             scheduled_at::TEXT AS scheduled_at,
             ended_at::TEXT AS ended_at,
             updated_at::TEXT AS updated_at
      FROM appointments
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND updated_at > ${hwm.appointments_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, scheduled_at
    `;

    const visitSeq = new Map<number, number>();
    for (const appt of appointments) {
      const personId = personIdMap.get(appt.patient_id);
      if (!personId) continue;
      const seq = visitSeq.get(personId) ?? 0;
      tsv.append('visit_occurrence',
        mapVisitOccurrence(appt, personId, seq) as unknown as Record<string, unknown>
      );
      visitSeq.set(personId, seq + 1);
    }
    newHwm['appointments_hwm'] = now;

    // ── DEVICE_EXPOSURE + MEASUREMENT (passive health) ──────────
    const passiveHealth = await sql<PassiveHealthRow[]>`
      SELECT id, patient_id, snapshot_date::TEXT AS snapshot_date,
             step_count, heart_rate_avg, hrv_sdnn, data_source,
             updated_at::TEXT AS updated_at
      FROM passive_health_snapshots
      WHERE patient_id = ANY(${patientIds}::UUID[])
        AND updated_at > ${hwm.passive_health_hwm}::TIMESTAMPTZ
      ORDER BY patient_id, snapshot_date
    `;

    const deviceSeq = new Map<number, number>();
    for (const ph of passiveHealth) {
      const personId = personIdMap.get(ph.patient_id);
      if (!personId) continue;

      // Passive health measurements
      const mSeq = measurementSeq.get(personId) ?? 0;
      const measurements = mapPassiveHealthMeasurements(ph, personId, mSeq);
      for (const m of measurements) {
        tsv.append('measurement', m as unknown as Record<string, unknown>);
      }
      measurementSeq.set(personId, mSeq + measurements.length);

      // Device exposure (wearable provenance)
      const dSeq = deviceSeq.get(personId) ?? 0;
      tsv.append('device_exposure',
        mapDeviceExposure(ph, personId, dSeq) as unknown as Record<string, unknown>
      );
      deviceSeq.set(personId, dSeq + 1);
    }
    newHwm['passive_health_hwm'] = now;

    // ── NOTE (shared journal entries) ───────────────────────────
    const journals = await sql<JournalEntryRow[]>`
      SELECT je.id, je.patient_id, je.title, je.content,
             je.created_at::TEXT AS created_at,
             je.updated_at::TEXT AS updated_at
      FROM journal_entries je
      WHERE je.patient_id = ANY(${patientIds}::UUID[])
        AND je.shared_with_care_team = TRUE
        AND je.updated_at > ${hwm.journal_entries_hwm}::TIMESTAMPTZ
      ORDER BY je.patient_id, je.created_at
    `;

    const noteSeq = new Map<number, number>();
    for (const j of journals) {
      const personId = personIdMap.get(j.patient_id);
      if (!personId) continue;
      const seq = noteSeq.get(personId) ?? 0;
      tsv.append('note',
        mapJournalNote(j, personId, seq) as unknown as Record<string, unknown>
      );
      noteSeq.set(personId, seq + 1);
    }
    newHwm['journal_entries_hwm'] = now;

    // ── Upload TSV files ────────────────────────────────────────
    const fileUrls: Record<string, string> = {};

    for (const table of OMOP_TABLE_NAMES) {
      const buf = tsv.toBuffer(table);
      if (!buf) continue;

      const objectPath = `omop/${exportRunId}/${table}.tsv`;
      const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
          'Content-Type': 'text/tab-separated-values',
          'x-upsert': 'true',
        },
        body: new Uint8Array(buf) as unknown as BodyInit,
      });

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed for ${table}.tsv (${uploadRes.status})`);
      }

      // Create signed URL
      const signUrl = `${config.supabaseUrl}/storage/v1/object/sign/${STORAGE_BUCKET}/${objectPath}`;
      const signRes = await fetch(signUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY }),
      });

      const signJson = (await signRes.json()) as { signedURL: string };
      fileUrls[table] = `${config.supabaseUrl}/storage/v1${signJson.signedURL}`;
    }

    // ── Update high-water marks ─────────────────────────────────
    await sql`
      UPDATE omop_export_hwm SET
        patients_hwm              = ${newHwm['patients_hwm'] ?? hwm.patients_hwm}::TIMESTAMPTZ,
        daily_entries_hwm         = ${newHwm['daily_entries_hwm'] ?? hwm.daily_entries_hwm}::TIMESTAMPTZ,
        validated_assessments_hwm = ${newHwm['validated_assessments_hwm'] ?? hwm.validated_assessments_hwm}::TIMESTAMPTZ,
        patient_medications_hwm   = ${newHwm['patient_medications_hwm'] ?? hwm.patient_medications_hwm}::TIMESTAMPTZ,
        patient_diagnoses_hwm     = ${newHwm['patient_diagnoses_hwm'] ?? hwm.patient_diagnoses_hwm}::TIMESTAMPTZ,
        appointments_hwm          = ${newHwm['appointments_hwm'] ?? hwm.appointments_hwm}::TIMESTAMPTZ,
        passive_health_hwm        = ${newHwm['passive_health_hwm'] ?? hwm.passive_health_hwm}::TIMESTAMPTZ,
        journal_entries_hwm       = ${newHwm['journal_entries_hwm'] ?? hwm.journal_entries_hwm}::TIMESTAMPTZ,
        updated_at                = NOW()
      WHERE id = 1
    `;

    // ── Update export run record ────────────────────────────────
    const recordCounts = tsv.getCounts();
    await sql`
      UPDATE omop_export_runs SET
        status        = 'completed',
        record_counts = ${JSON.stringify(recordCounts)}::JSONB,
        file_urls     = ${JSON.stringify(fileUrls)}::JSONB,
        completed_at  = NOW()
      WHERE id = ${exportRunId}::UUID
    `;

    const totalRows = Object.values(recordCounts).reduce((sum, n) => sum + n, 0);
    console.info(`[omop-export] Done — export ${exportRunId} (${totalRows} total rows across ${Object.keys(recordCounts).length} tables)`);

  } catch (err) {
    console.error(`[omop-export] Failed — export ${exportRunId}:`, err);
    await sql`
      UPDATE omop_export_runs SET
        status        = 'failed',
        error_message = ${err instanceof Error ? err.message : String(err)},
        completed_at  = NOW()
      WHERE id = ${exportRunId}::UUID
    `;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker startup
// ---------------------------------------------------------------------------

export function startOmopExportWorker(): Worker<OmopExportJobData> {
  const worker = new Worker<OmopExportJobData>(OMOP_QUEUE_NAME, processOmopExport, {
    connection,
    concurrency: 1,
  });

  worker.on('completed', (job) => {
    console.info(`[omop-export] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[omop-export] Job ${job?.id} failed:`, err.message);
  });

  console.info('[omop-export] Worker started');
  return worker;
}
