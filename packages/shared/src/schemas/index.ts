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

const MedicationFrequencySchema = z.enum([
  'once_daily',
  'twice_daily',
  'three_times_daily',
  'four_times_daily',
  'as_needed',
  'weekly',
  'other',
]);

export const CreateMedicationSchema = z.object({
  name: z.string().min(1).max(200),
  dosage: z.string().max(100).nullable().optional(),
  frequency: MedicationFrequencySchema,
  prescribing_clinician: z.string().max(200).nullable().optional(),
  start_date: IsoDateSchema.nullable().optional(),
  end_date: IsoDateSchema.nullable().optional(),
});
export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;

export const LogMedicationSchema = z.object({
  medication_id: UuidSchema,
  log_date: IsoDateSchema,
  taken: z.boolean(),
  taken_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type LogMedicationInput = z.infer<typeof LogMedicationSchema>;

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
// Reports
// ---------------------------------------------------------------------------

export const CreateReportSchema = z.object({
  patient_id: UuidSchema,
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
