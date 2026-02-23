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
  email: z.string().email(),
  password: z.string().min(8).max(128),
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
  // patient_id required for 'weekly_summary' (individual); optional/null for population & handover
  patient_id: UuidSchema.nullable().optional(),
  report_type: z.enum(['weekly_summary', 'monthly_summary', 'clinical_export']),
  period_start: IsoDateSchema,
  period_end: IsoDateSchema,
});
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

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
