// =============================================================================
// MindLog — Zod Validation Schemas
// Used for API request/response validation in apps/api and client-side forms.
// =============================================================================

import { z } from 'zod';
import { LIMITS } from '../constants/index.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const UuidSchema = z.string().uuid();

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

export const MoodScoreSchema = z
  .number()
  .int()
  .min(LIMITS.MOOD_MIN)
  .max(LIMITS.MOOD_MAX);

export const SleepHoursSchema = z
  .number()
  .min(LIMITS.SLEEP_MIN_HOURS)
  .max(LIMITS.SLEEP_MAX_HOURS)
  .nullable()
  .optional();

export const SleepQualitySchema = z
  .number()
  .int()
  .min(LIMITS.SLEEP_QUALITY_MIN)
  .max(LIMITS.SLEEP_QUALITY_MAX)
  .nullable()
  .optional();

export const ExerciseMinutesSchema = z
  .number()
  .int()
  .min(LIMITS.EXERCISE_MIN_MINUTES)
  .max(LIMITS.EXERCISE_MAX_MINUTES)
  .nullable()
  .optional();

export const SeveritySchema = z.number().int().min(1).max(10);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  // Allow "admin" as a dev bypass username, or a valid email
  email: z.string().refine(
    (val) => val === 'admin' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    { message: 'Must be a valid email or "admin"' }
  ),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const MfaTotpSchema = z.object({
  factor_id: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/, 'Must be a 6-digit code'),
});
export type MfaTotpInput = z.infer<typeof MfaTotpSchema>;

// ---------------------------------------------------------------------------
// Patient registration & profile
// ---------------------------------------------------------------------------

export const CreatePatientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  date_of_birth: IsoDateSchema,
  mrn: z.string().max(50).nullable().optional(),
});
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const UpdatePatientProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  mrn: z.string().max(50).nullable().optional(),
  diagnosis: z.string().max(500).nullable().optional(),
  status: z.enum(['active', 'crisis', 'inactive', 'discharged']).optional(),
  risk_level: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
});
export type UpdatePatientProfileInput = z.infer<typeof UpdatePatientProfileSchema>;

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

export const DailyEntryTriggerInputSchema = z.object({
  trigger_id: UuidSchema,
  severity: SeveritySchema,
});

export const DailyEntrySymptomInputSchema = z.object({
  symptom_id: UuidSchema,
  severity: SeveritySchema,
});

export const DailyEntryStrategyInputSchema = z.object({
  strategy_id: UuidSchema,
  helped: z.boolean().nullable().optional(),
});

export const CreateDailyEntrySchema = z.object({
  entry_date: IsoDateSchema,
  mood_score: MoodScoreSchema,
  sleep_hours: SleepHoursSchema,
  sleep_quality: SleepQualitySchema,
  exercise_minutes: ExerciseMinutesSchema,
  notes: z.string().max(1000).nullable().optional(),
  triggers: z.array(DailyEntryTriggerInputSchema).max(20).optional(),
  symptoms: z.array(DailyEntrySymptomInputSchema).max(20).optional(),
  strategies: z.array(DailyEntryStrategyInputSchema).max(20).optional(),

  // Phase 8: expanded clinical domains (all optional)
  // Mania pole (ASRM-informed)
  mania_score: z.number().int().min(1).max(10).nullable().optional(),
  racing_thoughts: z.boolean().nullable().optional(),
  decreased_sleep_need: z.boolean().nullable().optional(),

  // Anxiety / somatic (GAD-2-informed)
  anxiety_score: z.number().int().min(1).max(10).nullable().optional(),
  somatic_anxiety: z.boolean().nullable().optional(),

  // Depression (PHQ-2-informed)
  anhedonia_score: z.number().int().min(1).max(10).nullable().optional(),

  // Safety screening (C-SSRS screener: 0=none, 1=passive, 2=frequent, 3=plan with intent)
  suicidal_ideation: z.number().int().min(0).max(3).nullable().optional(),

  // Substance use (AUDIT-C-informed)
  substance_use: z.enum(['none', 'alcohol', 'cannabis', 'other']).nullable().optional(),
  substance_quantity: z.number().int().min(0).max(99).nullable().optional(),

  // Social functioning
  social_score: z.number().int().min(1).max(5).nullable().optional(),
  social_avoidance: z.boolean().nullable().optional(),

  // Cognitive functioning
  cognitive_score: z.number().int().min(1).max(10).nullable().optional(),
  brain_fog: z.boolean().nullable().optional(),

  // Appetite (PSS single item)
  appetite_score: z.number().int().min(1).max(5).nullable().optional(),

  // Stress / life events (PSS)
  stress_score: z.number().int().min(1).max(10).nullable().optional(),
  life_event_note: z.string().max(500).nullable().optional(),
});
export type CreateDailyEntryInput = z.infer<typeof CreateDailyEntrySchema>;

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export const CreateJournalEntrySchema = z.object({
  title: z.string().min(1).max(200).nullable().optional(),
  body: z.string().min(1).max(LIMITS.JOURNAL_BODY_MAX_CHARS),
  mood_at_writing: MoodScoreSchema.nullable().optional(),
  is_shared_with_care_team: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});
export type CreateJournalEntryInput = z.infer<typeof CreateJournalEntrySchema>;

export const UpdateJournalEntrySchema = CreateJournalEntrySchema.partial();
export type UpdateJournalEntryInput = z.infer<typeof UpdateJournalEntrySchema>;

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

/** Frequency values matching the patient_medications.frequency CHECK constraint */
export const MedicationFrequencySchema = z.enum([
  'once_daily_morning',
  'once_daily_evening',
  'once_daily_bedtime',
  'twice_daily',
  'three_times_daily',
  'as_needed',
  'weekly',
  'other',
]);
export type MedicationFrequency = z.infer<typeof MedicationFrequencySchema>;

/** Human-readable labels for each frequency */
export const MEDICATION_FREQUENCY_LABELS: Record<MedicationFrequency, string> = {
  once_daily_morning: 'Once daily (morning)',
  once_daily_evening: 'Once daily (evening)',
  once_daily_bedtime: 'Once daily (bedtime)',
  twice_daily: 'Twice daily',
  three_times_daily: 'Three times daily',
  as_needed: 'As needed',
  weekly: 'Weekly',
  other: 'Other',
};

/** Create / add a new patient medication */
export const CreatePatientMedicationSchema = z.object({
  medication_name: z.string().min(1).max(200),
  dose: z.number().positive().nullable().optional(),
  dose_unit: z.string().max(20).default('mg'),
  frequency: MedicationFrequencySchema,
  frequency_other: z.string().max(200).nullable().optional(),
  instructions: z.string().max(500).nullable().optional(),
  prescribed_at: IsoDateSchema.nullable().optional(),
  show_in_app: z.boolean().default(true),
});
export type CreatePatientMedicationInput = z.infer<typeof CreatePatientMedicationSchema>;

/** Log daily medication adherence (patient-facing) */
export const LogAdherenceSchema = z.object({
  entry_date: IsoDateSchema.optional(),   // defaults to today server-side
  taken: z.boolean(),
  taken_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type LogAdherenceInput = z.infer<typeof LogAdherenceSchema>;

/** Discontinue a patient medication */
export const DiscontinueMedicationSchema = z.object({
  discontinued_at: IsoDateSchema.optional(),   // defaults to today
  discontinuation_reason: z.string().max(500).nullable().optional(),
});
export type DiscontinueMedicationInput = z.infer<typeof DiscontinueMedicationSchema>;

// Legacy aliases kept for backward compatibility
export const CreateMedicationSchema = CreatePatientMedicationSchema;
export type CreateMedicationInput = CreatePatientMedicationInput;
export const LogMedicationSchema = LogAdherenceSchema;
export type LogMedicationInput = LogAdherenceInput;

// ---------------------------------------------------------------------------
// Clinician
// ---------------------------------------------------------------------------

export const CreateClinicianNoteSchema = z.object({
  body: z.string().min(1).max(LIMITS.CLINICIAN_NOTE_MAX_CHARS),
  is_private: z.boolean().default(false),
});
export type CreateClinicianNoteInput = z.infer<typeof CreateClinicianNoteSchema>;

export const UpdateAlertStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'escalated']),
});
export type UpdateAlertStatusInput = z.infer<typeof UpdateAlertStatusSchema>;

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export const ConsentTypeSchema = z.enum([
  'journal_sharing',
  'data_research',
  'ai_insights',
  'emergency_contact',
]);

export const UpdateConsentSchema = z.object({
  consent_type: ConsentTypeSchema,
  granted: z.boolean(),
});
export type UpdateConsentInput = z.infer<typeof UpdateConsentSchema>;

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const CreateInviteSchema = z.object({
  email: z.string().email(),
  personal_message: z.string().max(500).optional(),
});
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

// ---------------------------------------------------------------------------
// Patient self-registration (invite-only)
// ---------------------------------------------------------------------------

export const RegisterSchema = z.object({
  invite_token:  z.string().min(1),
  email:         z.string().email(),
  password:      z.string().min(12).max(128),
  first_name:    z.string().min(1).max(100),
  last_name:     z.string().min(1).max(100),
  date_of_birth: IsoDateSchema,
  timezone:      z.string().max(100).default('America/New_York'),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

// ---------------------------------------------------------------------------
// Clinical intake (patient self-service, post-registration)
// ---------------------------------------------------------------------------

export const IntakeSchema = z.object({
  primary_concern:                z.string().max(500).optional(),
  emergency_contact_name:         z.string().max(200).optional(),
  emergency_contact_phone:        z.string().max(30).optional(),
  emergency_contact_relationship: z.string().max(100).optional(),
  mark_complete:                  z.boolean().optional(),
});
export type IntakeInput = z.infer<typeof IntakeSchema>;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const CreateReportSchema = z.object({
  // patient_id required for 'weekly_summary' and 'cda_handover'; optional/null for population reports
  patient_id: UuidSchema.nullable().optional(),
  report_type: z.enum(['weekly_summary', 'monthly_summary', 'clinical_export', 'cda_handover']),
  period_start: IsoDateSchema,
  period_end: IsoDateSchema,
});
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

// ---------------------------------------------------------------------------
// Research export
// ---------------------------------------------------------------------------

export const CreateResearchExportSchema = z.object({
  cohort_id: UuidSchema.optional(),
  filters: z.object({
    diagnoses:     z.array(z.string()).optional(),
    risk_levels:   z.array(z.enum(['low', 'moderate', 'high', 'critical'])).optional(),
    age_min:       z.number().int().min(0).max(150).optional(),
    age_max:       z.number().int().min(0).max(150).optional(),
    active_only:   z.boolean().default(true),
    period_start:  IsoDateSchema.optional(),
    period_end:    IsoDateSchema.optional(),
  }).default({}),
  format: z.enum(['ndjson', 'csv', 'fhir_bundle']).default('ndjson'),
  include_fields: z.array(z.string()).optional(),
});
export type CreateResearchExportInput = z.infer<typeof CreateResearchExportSchema>;

export const CreateCohortSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  filters:     z.record(z.unknown()).default({}),
});
export type CreateCohortInput = z.infer<typeof CreateCohortSchema>;

// ---------------------------------------------------------------------------
// Cohort Builder v2 — Filter DSL
// ---------------------------------------------------------------------------

/** Comparison operators for cohort filter rules */
export const FilterOpSchema = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);
export type FilterOp = z.infer<typeof FilterOpSchema>;

/** A single filter criterion */
export const CohortFilterRuleSchema = z.object({
  field: z.string().min(1),
  op: FilterOpSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export type CohortFilterRule = z.infer<typeof CohortFilterRuleSchema>;

/** Recursive filter group with AND/OR logic */
export interface CohortFilterGroup {
  logic: 'AND' | 'OR';
  rules: (CohortFilterRule | CohortFilterGroup)[];
}

export const CohortFilterGroupSchema: z.ZodType<CohortFilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    rules: z.array(z.union([CohortFilterRuleSchema, CohortFilterGroupSchema])).min(1).max(20),
  })
);

/** Query request for executing cohort filters */
export const CohortQuerySchema = z.object({
  filters: CohortFilterGroupSchema,
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  sort_by: z.enum(['name', 'risk_level', 'latest_phq9', 'latest_gad7', 'avg_mood_30d', 'tracking_streak']).default('name'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
});
export type CohortQueryInput = z.infer<typeof CohortQuerySchema>;

/** Count-only request (no pagination needed) */
export const CohortCountSchema = z.object({
  filters: CohortFilterGroupSchema,
});
export type CohortCountInput = z.infer<typeof CohortCountSchema>;

/** Create/update a v2 cohort definition */
export const CreateCohortSchemaV2 = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  filters: CohortFilterGroupSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6edcd0'),
});
export type CreateCohortV2Input = z.infer<typeof CreateCohortSchemaV2>;

/** Update a v2 cohort definition (all fields optional) */
export const UpdateCohortSchemaV2 = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  filters: CohortFilterGroupSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  is_pinned: z.boolean().optional(),
});
export type UpdateCohortV2Input = z.infer<typeof UpdateCohortSchemaV2>;

// ---------------------------------------------------------------------------
// Crisis safety plan
// ---------------------------------------------------------------------------

export const UpsertSafetyPlanSchema = z.object({
  warning_signs:               z.array(z.string().max(500)).max(20).optional(),
  internal_coping_strategies:  z.array(z.string().max(500)).max(20).optional(),
  social_distractions:         z.array(z.record(z.unknown())).max(10).optional(),
  support_contacts:            z.array(z.record(z.unknown())).max(10).optional(),
  professional_contact_name:   z.string().max(200).optional(),
  professional_contact_phone:  z.string().max(50).optional(),
  professional_contact_agency: z.string().max(200).optional(),
  crisis_line_phone:           z.string().max(50).optional(),
  crisis_line_name:            z.string().max(200).optional(),
  er_address:                  z.string().max(500).optional(),
  means_restriction_notes:     z.string().max(2000).optional(),
  emergency_steps:             z.string().max(2000).optional(),
  reasons_for_living:          z.array(z.string().max(500)).max(20).optional(),
  patient_signature_at:        z.string().datetime().optional(),
});
export type UpsertSafetyPlanInput = z.infer<typeof UpsertSafetyPlanSchema>;

// ---------------------------------------------------------------------------
// Pagination & filtering
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export const AlertFilterSchema = z.object({
  status: z.enum(['new', 'acknowledged', 'resolved', 'escalated']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  patient_id: UuidSchema.optional(),
  ...PaginationSchema.shape,
});
export type AlertFilterInput = z.infer<typeof AlertFilterSchema>;

export const PatientFilterSchema = z.object({
  status: z.enum(['active', 'crisis', 'inactive', 'discharged']).optional(),
  clinician_id: UuidSchema.optional(),
  search: z.string().max(100).optional(),
  ...PaginationSchema.shape,
});
export type PatientFilterInput = z.infer<typeof PatientFilterSchema>;

// ---------------------------------------------------------------------------
// API response envelopes
// ---------------------------------------------------------------------------

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    has_next: z.boolean(),
  });

// ---------------------------------------------------------------------------
// OMOP CDM Export
// ---------------------------------------------------------------------------

export const TriggerOmopExportSchema = z.object({
  output_mode: z.enum(['tsv_upload']).default('tsv_upload'),
  full_refresh: z.boolean().default(false),
});
export type TriggerOmopExportInput = z.infer<typeof TriggerOmopExportSchema>;

export const OmopExportStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  triggered_by: z.enum(['nightly', 'manual']),
  output_mode: z.string(),
  full_refresh: z.boolean(),
  record_counts: z.record(z.number()).nullable(),
  file_urls: z.record(z.string()).nullable(),
  error_message: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
});
export type OmopExportStatus = z.infer<typeof OmopExportStatusSchema>;
