// =============================================================================
// MindLog Mobile — Accessibility helpers (WCAG 2.1 AA)
// Shared utilities that generate consistent accessibilityLabel strings for
// mood scores, date ranges, medication names, and other clinical values.
//
// Usage:
//   import { a11yMoodLabel, a11yDateLabel } from '../utils/a11y';
//   <View accessibilityLabel={a11yMoodLabel(7)} ... />
// =============================================================================

// ---------------------------------------------------------------------------
// Mood score labels (1–10)
// ---------------------------------------------------------------------------

const MOOD_NAMES: Record<number, string> = {
  1:  'Very poor',
  2:  'Poor',
  3:  'Below average',
  4:  'Below average',
  5:  'Average',
  6:  'Above average',
  7:  'Good',
  8:  'Good',
  9:  'Very good',
  10: 'Excellent',
};

export function a11yMoodLabel(score: number): string {
  const name = MOOD_NAMES[score] ?? 'Unknown';
  return `Mood score ${score} out of 10 — ${name}`;
}

export function a11yMoodEmoji(emoji: string, score: number): string {
  return `${a11yMoodLabel(score)}, tap to log`;
}

// ---------------------------------------------------------------------------
// Date range labels
// ---------------------------------------------------------------------------

export function a11yDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function a11yDateRangeLabel(start: string, end: string): string {
  return `From ${a11yDateLabel(start)} to ${a11yDateLabel(end)}`;
}

// ---------------------------------------------------------------------------
// Medication labels
// ---------------------------------------------------------------------------

export function a11yMedicationLabel(
  name: string,
  dose: number | null,
  doseUnit: string,
  taken: boolean | null,
): string {
  const doseStr  = dose != null ? ` ${dose}${doseUnit}` : '';
  const takenStr = taken === true  ? ', taken today'
                 : taken === false ? ', not taken today'
                 :                   ', status unknown';
  return `${name}${doseStr}${takenStr}`;
}

// ---------------------------------------------------------------------------
// Assessment / scale labels
// ---------------------------------------------------------------------------

const SCALE_NAMES: Record<string, string> = {
  'PHQ-9':   'Patient Health Questionnaire 9',
  'GAD-7':   'Generalized Anxiety Disorder 7',
  'ASRM':    'Altman Self-Rating Mania Scale',
  'C-SSRS':  'Columbia Suicide Severity Rating Scale',
  'ISI':     'Insomnia Severity Index',
  'WHODAS':  'WHO Disability Assessment Schedule',
  'QIDS-SR': 'Quick Inventory of Depressive Symptomatology',
};

export function a11yScaleLabel(scale: string, score?: number): string {
  const name = SCALE_NAMES[scale] ?? scale;
  return score != null ? `${name}, score ${score}` : name;
}

// ---------------------------------------------------------------------------
// Severity label (1–10 integer)
// ---------------------------------------------------------------------------

export function a11ySeverityLabel(value: number, max = 10): string {
  return `Severity ${value} out of ${max}`;
}

// ---------------------------------------------------------------------------
// Toggle / switch labels
// ---------------------------------------------------------------------------

export function a11yToggleLabel(label: string, enabled: boolean): string {
  return `${label}, ${enabled ? 'enabled' : 'disabled'}, double-tap to toggle`;
}

// ---------------------------------------------------------------------------
// Pagination / list count labels
// ---------------------------------------------------------------------------

export function a11yListCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

export function a11yLoadingLabel(context: string): string {
  return `Loading ${context}, please wait`;
}
