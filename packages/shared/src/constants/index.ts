// =============================================================================
// MindLog — Shared Constants
// =============================================================================

// ---------------------------------------------------------------------------
// Mood scale
// ---------------------------------------------------------------------------

/** Maps mood score (1–10) to hex color. Gradient: red → yellow → green → indigo. */
export const MOOD_COLORS: Readonly<Record<number, string>> = {
  1: '#d62828',
  2: '#e85d04',
  3: '#f48c06',
  4: '#faa307',
  5: '#ffba08',
  6: '#a7c957',
  7: '#6a994e',
  8: '#52b788',
  9: '#3b82f6',
  10: '#6366f1',
} as const;

/** Short label for each mood score. */
export const MOOD_LABELS: Readonly<Record<number, string>> = {
  1: 'Terrible',
  2: 'Very Bad',
  3: 'Bad',
  4: 'Poor',
  5: 'Okay',
  6: 'Decent',
  7: 'Good',
  8: 'Great',
  9: 'Excellent',
  10: 'Amazing',
} as const;

/** Emoji anchors shown at pip extremes in the mood ring. */
export const MOOD_EMOJIS: Readonly<Record<number, string>> = {
  1: '😭',
  2: '😢',
  3: '😞',
  4: '😕',
  5: '😐',
  6: '🙂',
  7: '😊',
  8: '😄',
  9: '😁',
  10: '🤩',
} as const;

// ---------------------------------------------------------------------------
// Alert rule keys (must match rules engine implementation)
// ---------------------------------------------------------------------------

export const ALERT_RULE_KEYS = {
  MOOD_DECLINE: 'RULE-001',
  MISSED_CHECK_IN: 'RULE-002',
  TRIGGER_ESCALATION: 'RULE-003',
  SAFETY_SYMPTOM: 'RULE-004',
  MEDICATION_ADHERENCE: 'RULE-005',
  SLEEP_DISRUPTION: 'RULE-006',
  EXERCISE_DECLINE: 'RULE-007',
  JOURNAL_SENTIMENT: 'RULE-008',
} as const;

export type AlertRuleKey = (typeof ALERT_RULE_KEYS)[keyof typeof ALERT_RULE_KEYS];

// ---------------------------------------------------------------------------
// Alert thresholds (provisional — must be reviewed by clinical advisor before pilot)
// See DECISIONS.md OQ-004
// ---------------------------------------------------------------------------

export const ALERT_THRESHOLDS = {
  /** Mood decline: 7d average ≥ N points below 28d baseline → WARNING */
  MOOD_DECLINE_WARNING_DELTA: 2.5,
  /** Mood decline: 7d average ≥ N points below 28d baseline → CRITICAL */
  MOOD_DECLINE_CRITICAL_DELTA: 3.5,
  /** Consecutive missed check-ins → WARNING */
  MISSED_CHECK_IN_WARNING_DAYS: 3,
  /** Consecutive missed check-ins → CRITICAL */
  MISSED_CHECK_IN_CRITICAL_DAYS: 5,
  /** Trigger severity score (1–10) for N consecutive days → escalation */
  TRIGGER_ESCALATION_SEVERITY: 7,
  TRIGGER_ESCALATION_DAYS: 3,
} as const;

// ---------------------------------------------------------------------------
// Crisis line contacts (United States — SAF-002)
// Verified: February 2026. Next review: May 2026.
// ---------------------------------------------------------------------------

export const CRISIS_CONTACTS = {
  LIFELINE: {
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    text: '988',
    url: 'https://988lifeline.org',
  },
  CRISIS_TEXT_LINE: {
    name: 'Crisis Text Line',
    text_to: '741741',
    keyword: 'HOME',
    url: 'https://www.crisistextline.org',
  },
  VETERANS_CRISIS_LINE: {
    name: 'Veterans Crisis Line',
    phone: '988',
    phone_prompt: 'Press 1',
    url: 'https://www.veteranscrisisline.net',
  },
} as const;

// ---------------------------------------------------------------------------
// Compliance flags (runtime gate checks — never hardcode true in source)
// These are read from environment variables in apps; the constants here are
// the canonical key names.
// ---------------------------------------------------------------------------

export const COMPLIANCE_ENV_KEYS = {
  AI_INSIGHTS_ENABLED: 'AI_INSIGHTS_ENABLED',
  ANTHROPIC_BAA_SIGNED: 'ANTHROPIC_BAA_SIGNED',
  HIPAA_ASSESSMENT_COMPLETE: 'HIPAA_ASSESSMENT_COMPLETE',
} as const;

// ---------------------------------------------------------------------------
// App-wide limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** Maximum journal body length (characters) */
  JOURNAL_BODY_MAX_CHARS: 10_000,
  /** Maximum clinician note length (characters) */
  CLINICIAN_NOTE_MAX_CHARS: 5_000,
  /** Minimum patient age (years). See DECISIONS.md OQ-005. */
  MIN_PATIENT_AGE_YEARS: 18,
  /** JWT access token expiry (matches JWT_ACCESS_EXPIRY env) */
  JWT_ACCESS_EXPIRY_MINUTES: 15,
  /** JWT refresh token expiry (matches JWT_REFRESH_EXPIRY env) */
  JWT_REFRESH_EXPIRY_DAYS: 7,
  /** Maximum file size for PDF report uploads (bytes) */
  REPORT_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  /** Mood score range */
  MOOD_MIN: 1,
  MOOD_MAX: 10,
  /** Sleep hours range */
  SLEEP_MIN_HOURS: 0,
  SLEEP_MAX_HOURS: 24,
  /** Sleep quality range */
  SLEEP_QUALITY_MIN: 1,
  SLEEP_QUALITY_MAX: 5,
  /** Exercise minutes range */
  EXERCISE_MIN_MINUTES: 0,
  EXERCISE_MAX_MINUTES: 600,
} as const;

// ---------------------------------------------------------------------------
// API versioning
// ---------------------------------------------------------------------------

export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;

// ---------------------------------------------------------------------------
// WebSocket events
// ---------------------------------------------------------------------------

export const WS_EVENTS = {
  ALERT_CREATED: 'alert.created',
  ALERT_UPDATED: 'alert.updated',
  PATIENT_STATUS_CHANGED: 'patient.status_changed',
  PING: 'ping',
  PONG: 'pong',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

// ---------------------------------------------------------------------------
// Design tokens (shared between web + mobile for consistency)
// ---------------------------------------------------------------------------

export const DESIGN_TOKENS = {
  COLOR_PRIMARY: '#2a9d8f',
  COLOR_PRIMARY_DARK: '#1d7a6f',
  COLOR_DANGER: '#d62828',
  COLOR_WARNING: '#faa307',
  COLOR_SUCCESS: '#6a994e',
  FONT_SERIF: 'Fraunces',
  FONT_SANS: 'Figtree',
} as const;
