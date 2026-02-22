// =============================================================================
// MindLog — Shared Entity Types
// Derived from mindlog-schema.sql. Keep in sync with DB migrations.
// =============================================================================

// MedicationFrequency is defined in schemas/index.ts (Zod-derived).
// Import it here so the Medication interface below can reference it.
import type { MedicationFrequency } from '../schemas/index.js';
export type { MedicationFrequency };

// ---------------------------------------------------------------------------
// Enums (mirror PostgreSQL enum types)
// ---------------------------------------------------------------------------

export type UserRole = 'patient' | 'clinician' | 'admin';

export type PatientStatus = 'active' | 'crisis' | 'inactive' | 'discharged';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertStatus = 'new' | 'acknowledged' | 'resolved' | 'escalated';

export type ConsentType =
  | 'journal_sharing'
  | 'data_research'
  | 'ai_insights'
  | 'emergency_contact';

export type ReportType = 'weekly_summary' | 'monthly_summary' | 'clinical_export';

export type NotificationChannel = 'push' | 'email' | 'sms' | 'in_app';

// MedicationFrequency is exported from schemas/index.ts (Zod-derived, matches DB CHECK constraint)

// ---------------------------------------------------------------------------
// Core domain entities
// ---------------------------------------------------------------------------

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string; // UUID — maps to auth.users(id) in Supabase
  email: string;
  role: UserRole;
  organisation_id: string;
  is_active: boolean;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: string;
  user_id: string;
  organisation_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO 8601 date (YYYY-MM-DD)
  mrn: string | null; // Medical Record Number
  primary_clinician_id: string | null;
  status: PatientStatus;
  diagnosis: string | null;
  onboarded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Clinician {
  id: string;
  user_id: string;
  organisation_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  npi: string | null; // National Provider Identifier
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CareTeamMember {
  id: string;
  patient_id: string;
  clinician_id: string;
  role: string | null;
  added_at: Date;
  removed_at: Date | null;
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

export interface DailyEntry {
  id: string;
  patient_id: string;
  entry_date: string; // ISO 8601 date (YYYY-MM-DD)
  mood_score: number; // 1–10
  sleep_hours: number | null; // 0–24
  sleep_quality: number | null; // 1–5
  exercise_minutes: number | null;
  notes: string | null;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface DailyEntryTrigger {
  id: string;
  daily_entry_id: string;
  trigger_id: string;
  severity: number; // 1–10
}

export interface DailyEntrySymptom {
  id: string;
  daily_entry_id: string;
  symptom_id: string;
  severity: number; // 1–10
}

export interface DailyEntryStrategy {
  id: string;
  daily_entry_id: string;
  strategy_id: string;
  helped: boolean | null;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface WellnessStrategy {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
}

export interface Trigger {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
}

export interface Symptom {
  id: string;
  name: string;
  description: string | null;
  is_safety_symptom: boolean; // If true, reporting triggers SAF-001
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export interface JournalEntry {
  id: string;
  patient_id: string;
  title: string | null;
  body: string; // Encrypted at storage layer (AES-256). See OQ-001.
  mood_at_writing: number | null; // 1–10
  is_shared_with_care_team: boolean;
  is_encrypted: boolean; // Reserved for future E2EE migration path
  word_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface JournalTag {
  id: string;
  journal_entry_id: string;
  tag: string;
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export interface SafetyEvent {
  id: string;
  patient_id: string;
  daily_entry_id: string | null;
  journal_entry_id: string | null;
  event_type: string;
  severity: AlertSeverity;
  description: string | null;
  resolved_at: Date | null;
  resolved_by_clinician_id: string | null;
  created_at: Date;
}

export interface ClinicalAlert {
  id: string;
  patient_id: string;
  organisation_id: string;
  rule_key: string; // e.g. 'RULE-001'
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  acknowledged_by_clinician_id: string | null;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

export interface Medication {
  id: string;
  patient_id: string;
  name: string;
  dosage: string | null;
  frequency: MedicationFrequency;
  prescribing_clinician: string | null;
  start_date: string | null; // ISO 8601 date
  end_date: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MedicationLog {
  id: string;
  medication_id: string;
  patient_id: string;
  log_date: string; // ISO 8601 date
  taken: boolean;
  taken_at: Date | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Care & consent
// ---------------------------------------------------------------------------

export interface ClinicianNote {
  id: string;
  patient_id: string;
  clinician_id: string;
  body: string;
  is_private: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ConsentRecord {
  id: string;
  patient_id: string;
  consent_type: ConsentType;
  granted: boolean;
  granted_to_clinician_id: string | null;
  granted_to_organisation_id: string | null;
  granted_at: Date;
  revoked_at: Date | null;
  ip_address: string | null;
}

// ---------------------------------------------------------------------------
// Analytics & reporting
// ---------------------------------------------------------------------------

export interface AiInsight {
  id: string;
  patient_id: string;
  insight_type: string;
  title: string;
  body: string;
  generated_by: 'rule_based' | 'anthropic_claude';
  model_version: string | null;
  input_hash: string | null; // SHA-256 of de-identified input for audit
  is_shown_to_patient: boolean;
  is_shown_to_clinician: boolean;
  expires_at: Date | null;
  created_at: Date;
}

export interface PopulationSnapshot {
  id: string;
  organisation_id: string;
  clinician_id: string | null; // NULL = org-wide snapshot. See OQ-010.
  snapshot_date: string; // ISO 8601 date
  active_patients: number;
  crisis_patients: number;
  avg_mood_7d: number | null;
  avg_mood_28d: number | null;
  check_in_completion_rate_7d: number | null;
  new_alerts_24h: number;
  unresolved_critical_alerts: number;
  created_at: Date;
}

export interface Report {
  id: string;
  patient_id: string;
  clinician_id: string;
  report_type: ReportType;
  period_start: string; // ISO 8601 date
  period_end: string;
  storage_path: string | null;
  generated_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export interface NotificationLog {
  id: string;
  patient_id: string | null;
  clinician_id: string | null;
  channel: NotificationChannel;
  template_key: string;
  payload: Record<string, unknown>;
  sent_at: Date | null;
  error: string | null;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// View types (read-only aggregates)
// ---------------------------------------------------------------------------

/** Mirrors v_caseload_today database view */
export interface CaseloadToday {
  clinician_id: string;
  clinician_name: string;
  patient_id: string;
  patient_name: string;
  patient_status: PatientStatus;
  last_entry_date: string | null;
  avg_mood_7d: number | null;
  unresolved_alerts: number;
  is_checked_in_today: boolean;
}

/** Mirrors v_mood_heatmap_30d database view */
export interface MoodHeatmap30d {
  patient_id: string;
  entry_date: string;
  mood_score: number;
  day_of_week: number;
  week_number: number;
}
