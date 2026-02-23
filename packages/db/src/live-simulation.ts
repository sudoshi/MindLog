// =============================================================================
// MindLog — Live Data Simulation Engine
//
// Runs every 8 hours to simulate realistic patient activity and clinical
// responses, maintaining a living demo environment.
//
// Schedule: 06:00 (morning), 14:00 (afternoon), 22:00 (evening)
//
// Usage:
//   npm run db:simulate
//   npm run db:simulate -- --dry-run    # Preview without changes
//   npm run db:simulate -- --verbose    # Detailed logging
//
// =============================================================================

import { sql, closeDb } from './client.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
  // Demo org name - safety check
  DEMO_ORG_NAME: 'MindLog Demo Clinic',

  // Check-in probability by risk level
  CHECKIN_RATES: {
    low: 0.95,
    moderate: 0.80,
    high: 0.65,
    critical: 0.50,
  } as Record<string, number>,

  // Mood baselines by risk level
  MOOD_BASELINES: {
    low: { min: 7, max: 9, volatility: 0.8 },
    moderate: { min: 5, max: 7, volatility: 1.8 },
    high: { min: 3, max: 6, volatility: 2.2 },
    critical: { min: 2, max: 5, volatility: 2.5 },
  } as Record<string, { min: number; max: number; volatility: number }>,

  // Exercise probability by risk level
  EXERCISE_RATES: {
    low: 0.65,
    moderate: 0.45,
    high: 0.30,
    critical: 0.20,
  } as Record<string, number>,

  // Journal entry probability by risk level
  JOURNAL_RATES: {
    low: 0.30,
    moderate: 0.40,
    high: 0.50,
    critical: 0.60,
  } as Record<string, number>,

  // Medication adherence by risk level
  ADHERENCE_RATES: {
    low: 0.92,
    moderate: 0.78,
    high: 0.65,
    critical: 0.50,
  } as Record<string, number>,

  // Symptom probability by risk level
  SYMPTOM_RATES: {
    low: 0.10,
    moderate: 0.40,
    high: 0.70,
    critical: 0.90,
  } as Record<string, number>,

  // Alert acknowledgment rates
  ALERT_ACK_RATES: {
    critical: 0.80,
    warning: 0.60,
    info: 0.40,
  } as Record<string, number>,

  // Weekly mood modifiers (0 = Sunday)
  WEEKDAY_MODIFIERS: [0.3, -0.3, 0, 0, 0, 0.2, 0.5] as number[],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  risk_level: string;
  status: string;
  last_checkin_at: string | null;
  tracking_streak: number;
}

interface Clinician {
  id: string;
  first_name: string;
  last_name: string;
}

interface SimulationStats {
  patientsProcessed: number;
  entriesCreated: number;
  sleepLogsCreated: number;
  exerciseLogsCreated: number;
  symptomsLogged: number;
  triggersLogged: number;
  journalsCreated: number;
  medicationLogsCreated: number;
  alertsAcknowledged: number;
  notesCreated: number;
  safetyEventsHandled: number;
}

// ---------------------------------------------------------------------------
// Command line args
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(message: string, level: 'info' | 'verbose' | 'warn' | 'error' = 'info'): void {
  if (level === 'verbose' && !VERBOSE) return;
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : level === 'verbose' ? '  ' : '✓';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function gaussianRandom(): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

// ---------------------------------------------------------------------------
// Mood Calculation Engine
// ---------------------------------------------------------------------------

async function calculateMood(
  patient: Patient,
  recentMoods: number[],
  hasExercise: boolean,
  sleepHours: number,
  dayOfWeek: number
): Promise<number> {
  const riskConfig = CONFIG.MOOD_BASELINES[patient.risk_level] ?? CONFIG.MOOD_BASELINES['moderate']!;

  // Start with baseline for risk level
  let mood = randomFloat(riskConfig.min, riskConfig.max);

  // Apply recent trend (momentum)
  if (recentMoods.length >= 3) {
    const recentAvg = recentMoods.slice(-3).reduce((a, b) => a + b, 0) / 3;
    mood = mood * 0.4 + recentAvg * 0.6; // Weight toward recent average
  }

  // Weekly pattern
  mood += CONFIG.WEEKDAY_MODIFIERS[dayOfWeek] ?? 0;

  // Exercise boost
  if (hasExercise) {
    mood += randomFloat(0.3, 0.8);
  }

  // Sleep impact (optimal is 7-8 hours)
  if (sleepHours < 5) {
    mood -= randomFloat(0.5, 1.5);
  } else if (sleepHours < 6) {
    mood -= randomFloat(0.2, 0.5);
  } else if (sleepHours > 8.5) {
    mood += randomFloat(0.1, 0.3);
  }

  // Random daily variation (Gaussian)
  mood += gaussianRandom() * (riskConfig.volatility / 3);

  // Occasional events
  if (Math.random() < 0.05) {
    // 5% chance of a bad day event
    mood -= randomFloat(0.5, 1.5);
  }
  if (Math.random() < 0.03) {
    // 3% chance of a good day event
    mood += randomFloat(0.5, 1.0);
  }

  // Risk-level specific floors
  const floor = patient.risk_level === 'low' ? 5 :
                patient.risk_level === 'moderate' ? 3 :
                patient.risk_level === 'high' ? 2 : 1;

  return Math.round(clamp(mood, floor, 10));
}

// ---------------------------------------------------------------------------
// Content Templates
// ---------------------------------------------------------------------------

const JOURNAL_TEMPLATES = {
  low_positive: [
    "Good day today. Kept up with my routine and felt productive. The small wins are adding up.",
    "Practiced my breathing exercises this morning. Starting to feel like second nature now.",
    "Had a great workout and feel energized. Sleep has been consistent too.",
    "Grateful for the progress I've made. It wasn't easy getting here but it's worth it.",
    "Quiet day but in a good way. Sometimes peace is exactly what I need.",
  ],
  low_neutral: [
    "Pretty standard day. Nothing major to report but staying on track.",
    "Felt a bit tired today but pushed through. Tomorrow will be better.",
    "Work was busy but manageable. Looking forward to the weekend.",
  ],
  moderate_processing: [
    "Mixed feelings today. Some moments were okay, others were harder. Taking it one hour at a time.",
    "Therapy session brought up some difficult stuff. Processing it now.",
    "Noticed I was getting anxious about work. Used the grounding technique and it helped some.",
    "Sleep was rough last night. Hoping tonight is better.",
    "Had a moment of frustration but didn't let it spiral. That's progress.",
  ],
  moderate_hopeful: [
    "Starting to see some light. The medication adjustment seems to be helping.",
    "Connected with a friend today. Reminded me I'm not alone in this.",
    "Small victory: made it to my appointment without canceling.",
  ],
  high_struggling: [
    "Hard day. Everything feels heavy. But I showed up and that counts for something.",
    "The anxiety was bad today. Couldn't focus on much. Just trying to get through.",
    "Didn't sleep well. Mind wouldn't stop racing. Exhausted but wired.",
    "Feeling disconnected from everything. Going through the motions.",
    "Reached out to my therapist. Waiting feels hard.",
  ],
  high_reaching_out: [
    "Writing this because I promised I would when things got hard. Things are hard.",
    "Using this journal because I can't find the words to say out loud.",
    "Trying to hold on to the reasons my therapist gave me. Some days it's harder than others.",
  ],
  critical_crisis: [
    "Everything is too much. I don't know how to keep doing this.",
    "The dark thoughts came back. I'm trying to use my safety plan.",
    "Called the crisis line last night. It helped me get through.",
    "Just trying to make it to my next appointment. One hour at a time.",
  ],
};

const CLINICAL_NOTE_TEMPLATES = {
  alert_acknowledgment: [
    "Reviewed alert. Patient contacted via phone. Reports {status}. Safety plan reviewed. Will follow up in {timeframe}.",
    "Alert acknowledged. Attempted contact - {contact_result}. {next_steps}",
    "Reviewed clinical alert. {assessment}. Plan: {plan}",
  ],
  progress_observation: [
    "Routine check: Patient's mood tracking shows {trend} over past week. {observation}",
    "Reviewed recent entries. {pattern_note}. Continue current treatment plan.",
    "Patient engagement {engagement_level}. {recommendation}",
  ],
  risk_update: [
    "Risk reassessment completed. Current level: {risk_level}. Basis: {rationale}. {plan}",
    "Weekly risk review: {assessment}. Protective factors: {protective}. Risk factors: {risk_factors}.",
  ],
};

function generateJournalContent(riskLevel: string, mood: number): string {
  let templates: string[];

  if (riskLevel === 'low') {
    templates = mood >= 8 ? JOURNAL_TEMPLATES.low_positive : JOURNAL_TEMPLATES.low_neutral;
  } else if (riskLevel === 'moderate') {
    templates = mood >= 6 ? JOURNAL_TEMPLATES.moderate_hopeful : JOURNAL_TEMPLATES.moderate_processing;
  } else if (riskLevel === 'high') {
    templates = mood >= 5 ? JOURNAL_TEMPLATES.high_struggling : JOURNAL_TEMPLATES.high_reaching_out;
  } else {
    templates = JOURNAL_TEMPLATES.critical_crisis;
  }

  return pick(templates);
}

function generateAlertAckNote(severity: string): string {
  const statuses = ['feeling somewhat better', 'still struggling but safe', 'stable', 'improving with support'];
  const timeframes = ['24 hours', '48 hours', 'next scheduled appointment'];
  const contactResults = ['reached patient directly', 'left voicemail, patient returned call', 'spoke with emergency contact'];
  const nextSteps = ['Scheduled follow-up call.', 'Appointment moved up.', 'Continue monitoring.'];

  const template = pick(CLINICAL_NOTE_TEMPLATES.alert_acknowledgment);
  return template
    .replace('{status}', pick(statuses))
    .replace('{timeframe}', pick(timeframes))
    .replace('{contact_result}', pick(contactResults))
    .replace('{next_steps}', pick(nextSteps))
    .replace('{assessment}', `Patient ${pick(['reports stability', 'showing improvement', 'needs continued support'])}`)
    .replace('{plan}', pick(['Continue current interventions', 'Increase contact frequency', 'Review at next session']));
}

// ---------------------------------------------------------------------------
// Patient Activity Simulation
// ---------------------------------------------------------------------------

async function simulatePatientActivity(
  patient: Patient,
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  const today = todayStr();
  const dayOfWeek = new Date().getDay();
  const timeOfDay = getTimeOfDay();

  // Check if patient already has entry for today
  const [existingEntry] = await sql<{ id: string }[]>`
    SELECT id FROM daily_entries
    WHERE patient_id = ${patient.id} AND entry_date = ${today}
    LIMIT 1
  `;

  if (existingEntry) {
    log(`${patient.first_name} ${patient.last_name} already has entry for today`, 'verbose');
    return;
  }

  // Determine if patient checks in today
  const checkinRate = CONFIG.CHECKIN_RATES[patient.risk_level] ?? 0.7;

  // Adjust rate by time of day (more likely in evening)
  const timeModifier = timeOfDay === 'evening' ? 1.0 :
                       timeOfDay === 'afternoon' ? 0.6 :
                       0.4;

  if (Math.random() > checkinRate * timeModifier) {
    log(`${patient.first_name} ${patient.last_name} - no check-in this period`, 'verbose');
    return;
  }

  // Get recent moods for trend calculation
  const recentEntries = await sql<{ mood: number }[]>`
    SELECT mood FROM daily_entries
    WHERE patient_id = ${patient.id} AND mood IS NOT NULL
    ORDER BY entry_date DESC LIMIT 7
  `;
  const recentMoods = recentEntries.map(e => e.mood);

  // Generate sleep data first (affects mood)
  const sleepHours = generateSleepHours(patient.risk_level, dayOfWeek);
  const sleepMinutes = pick([0, 15, 30, 45]);
  const sleepQuality = Math.round(clamp(sleepHours - 2 + randomFloat(-1, 2), 1, 10));

  // Determine exercise
  const exerciseRate = CONFIG.EXERCISE_RATES[patient.risk_level] ?? 0.4;
  const hasExercise = Math.random() < exerciseRate;
  const exerciseDuration = hasExercise ? pick([15, 20, 30, 30, 45, 45, 60]) : 0;
  const exerciseTypes = ['walk', 'run', 'yoga', 'cycling', 'gym', 'swimming', 'hiking'];

  // Calculate mood
  const mood = await calculateMood(patient, recentMoods, hasExercise, sleepHours, dayOfWeek);

  // Calculate correlated coping score
  const coping = Math.round(clamp(mood + randomFloat(-1.5, 1.5), 1, 10));

  // Completion percentage based on engagement
  const completionPct = patient.risk_level === 'low' ? randomInt(80, 100) :
                        patient.risk_level === 'moderate' ? randomInt(60, 95) :
                        patient.risk_level === 'high' ? randomInt(40, 80) :
                        randomInt(20, 70);

  // Generate check-in time based on time of day
  const checkInHour = timeOfDay === 'morning' ? randomInt(6, 10) :
                      timeOfDay === 'afternoon' ? randomInt(12, 17) :
                      randomInt(18, 22);
  const checkInTime = `${today}T${String(checkInHour).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}:00`;

  if (!DRY_RUN) {
    // Create daily entry
    const [entry] = await sql<{ id: string }[]>`
      INSERT INTO daily_entries (
        patient_id, entry_date, mood, coping, completion_pct,
        core_complete, wellness_complete, triggers_complete,
        symptoms_complete, journal_complete,
        submitted_at, started_at, device_platform
      ) VALUES (
        ${patient.id}, ${today}, ${mood}, ${coping}, ${completionPct},
        TRUE, ${completionPct > 70}, ${completionPct > 75},
        ${completionPct > 60}, ${completionPct > 80},
        ${checkInTime}::timestamptz, ${checkInTime}::timestamptz,
        ${pick(['ios', 'android', 'web'])}
      )
      RETURNING id
    `;

    if (!entry) {
      log(`Failed to create entry for ${patient.first_name} ${patient.last_name}`, 'error');
      return;
    }

    stats.entriesCreated++;

    // Create sleep log
    await sql`
      INSERT INTO sleep_logs (daily_entry_id, patient_id, entry_date, hours, minutes, quality)
      VALUES (${entry.id}, ${patient.id}, ${today}, ${Math.floor(sleepHours)}, ${sleepMinutes}, ${sleepQuality})
      ON CONFLICT (daily_entry_id) DO NOTHING
    `;
    stats.sleepLogsCreated++;

    // Create exercise log if exercised
    if (hasExercise) {
      await sql`
        INSERT INTO exercise_logs (daily_entry_id, patient_id, entry_date, duration_minutes, exercise_type)
        VALUES (${entry.id}, ${patient.id}, ${today}, ${exerciseDuration}, ${pick(exerciseTypes)})
        ON CONFLICT (daily_entry_id) DO NOTHING
      `;
      stats.exerciseLogsCreated++;
    }

    // Generate symptoms for struggling patients
    const symptomRate = CONFIG.SYMPTOM_RATES[patient.risk_level] ?? 0.3;
    if (Math.random() < symptomRate && mood <= 6) {
      await generateSymptomLogs(entry.id, patient, mood, stats);
    }

    // Generate triggers occasionally
    if (Math.random() < 0.3 && mood < 7) {
      await generateTriggerLogs(entry.id, patient, stats);
    }

    // Generate journal entry
    const journalRate = CONFIG.JOURNAL_RATES[patient.risk_level] ?? 0.4;
    if (Math.random() < journalRate) {
      const journalBody = generateJournalContent(patient.risk_level, mood);
      const shared = patient.risk_level !== 'low' && Math.random() < 0.4;

      await sql`
        INSERT INTO journal_entries (daily_entry_id, patient_id, entry_date, body, word_count, shared_with_clinician, shared_at)
        VALUES (${entry.id}, ${patient.id}, ${today}, ${journalBody}, ${journalBody.split(' ').length},
                ${shared}, ${shared ? checkInTime : null}::timestamptz)
        ON CONFLICT (daily_entry_id) DO NOTHING
      `;
      stats.journalsCreated++;
    }

    // Generate medication adherence
    await generateMedicationLogs(patient, today, stats);

    // Update patient's last check-in
    await sql`
      UPDATE patients
      SET last_checkin_at = ${checkInTime}::timestamptz,
          tracking_streak = tracking_streak + 1
      WHERE id = ${patient.id}
    `;

    // Check for safety concerns
    if (mood <= 3 && patient.risk_level === 'critical') {
      await handleSafetyConcern(patient, entry.id, mood, clinicians, stats);
    }
  }

  log(`${patient.first_name} ${patient.last_name} - mood: ${mood}, coping: ${coping}`, 'verbose');
  stats.patientsProcessed++;
}

function generateSleepHours(riskLevel: string, dayOfWeek: number): number {
  // Base sleep by risk level
  let base = riskLevel === 'low' ? 7.5 :
             riskLevel === 'moderate' ? 6.5 :
             riskLevel === 'high' ? 5.5 : 5;

  // Weekend bonus
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    base += 0.5;
  }

  // Add variation
  const hours = base + gaussianRandom() * 1.2;
  return clamp(hours, 3, 10);
}

async function generateSymptomLogs(
  entryId: string,
  patient: Patient,
  mood: number,
  stats: SimulationStats
): Promise<void> {
  // Get available symptoms
  const symptoms = await sql<{ id: string; name: string; is_safety_symptom: boolean }[]>`
    SELECT id, name, is_safety_symptom FROM symptom_catalogue
    WHERE is_system = TRUE
    LIMIT 12
  `;

  if (symptoms.length === 0) return;

  // Number of symptoms based on risk and mood
  const numSymptoms = patient.risk_level === 'critical' ? randomInt(3, 5) :
                      patient.risk_level === 'high' ? randomInt(2, 4) :
                      patient.risk_level === 'moderate' ? randomInt(1, 3) : 1;

  // Filter out safety symptoms for lower risk patients
  const eligibleSymptoms = patient.risk_level === 'critical' ? symptoms :
    symptoms.filter(s => !s.is_safety_symptom);

  const selectedSymptoms = eligibleSymptoms
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(numSymptoms, eligibleSymptoms.length));

  for (const symptom of selectedSymptoms) {
    const intensity = Math.round(clamp(10 - mood + randomFloat(-2, 2), 1, 10));

    await sql`
      INSERT INTO symptom_logs (daily_entry_id, patient_id, symptom_id, entry_date, is_present, intensity)
      VALUES (${entryId}, ${patient.id}, ${symptom.id}, ${todayStr()}, TRUE, ${intensity})
      ON CONFLICT (daily_entry_id, symptom_id) DO NOTHING
    `;
    stats.symptomsLogged++;
  }
}

async function generateTriggerLogs(
  entryId: string,
  patient: Patient,
  stats: SimulationStats
): Promise<void> {
  const triggers = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM trigger_catalogue
    WHERE is_system = TRUE
    LIMIT 10
  `;

  if (triggers.length === 0) return;

  const numTriggers = randomInt(1, 2);
  const selectedTriggers = triggers.sort(() => Math.random() - 0.5).slice(0, numTriggers);

  for (const trigger of selectedTriggers) {
    const severity = randomInt(4, 8);

    await sql`
      INSERT INTO trigger_logs (daily_entry_id, patient_id, trigger_id, entry_date, is_active, severity)
      VALUES (${entryId}, ${patient.id}, ${trigger.id}, ${todayStr()}, TRUE, ${severity})
      ON CONFLICT (daily_entry_id, trigger_id) DO NOTHING
    `;
    stats.triggersLogged++;
  }
}

async function generateMedicationLogs(
  patient: Patient,
  today: string,
  stats: SimulationStats
): Promise<void> {
  // Get patient's active medications
  const medications = await sql<{ id: string; medication_name: string }[]>`
    SELECT id, medication_name FROM patient_medications
    WHERE patient_id = ${patient.id} AND discontinued_at IS NULL
  `;

  if (medications.length === 0) return;

  const adherenceRate = CONFIG.ADHERENCE_RATES[patient.risk_level] ?? 0.75;

  for (const med of medications) {
    const taken = Math.random() < adherenceRate;
    const takenAt = taken ? `${today}T${String(randomInt(7, 10)).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}:00` : null;

    await sql`
      INSERT INTO medication_adherence_logs (patient_id, patient_medication_id, entry_date, taken, taken_at)
      VALUES (${patient.id}, ${med.id}, ${today}, ${taken}, ${takenAt}::timestamptz)
      ON CONFLICT (patient_medication_id, entry_date) DO NOTHING
    `;
    stats.medicationLogsCreated++;
  }
}

async function handleSafetyConcern(
  patient: Patient,
  entryId: string,
  mood: number,
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  const today = todayStr();
  const intensity = Math.max(1, Math.min(10, 10 - mood)); // Safety symptom intensity

  // Get a safety symptom from the catalogue
  const safetySymptoms = await sql<{ id: string }[]>`
    SELECT id FROM symptom_catalogue WHERE is_safety_symptom = true LIMIT 1
  `;

  if (safetySymptoms.length === 0) {
    log(`No safety symptoms in catalogue, skipping safety event`, 'warn');
    return;
  }

  const safetySymptomId = safetySymptoms[0].id;

  // First create the symptom log (required for safety_events)
  const symptomLogResult = await sql<{ id: string }[]>`
    INSERT INTO symptom_logs (patient_id, daily_entry_id, symptom_id, entry_date, is_present, intensity)
    VALUES (${patient.id}, ${entryId}, ${safetySymptomId}, ${today}, true, ${intensity})
    ON CONFLICT (daily_entry_id, symptom_id) DO UPDATE SET intensity = EXCLUDED.intensity
    RETURNING id
  `;

  if (symptomLogResult.length === 0) {
    log(`Could not create symptom log for safety event`, 'warn');
    return;
  }

  const symptomLogId = symptomLogResult[0].id;

  // Create clinical alert
  await sql`
    INSERT INTO clinical_alerts (
      patient_id, organisation_id, alert_type, severity,
      title, body, rule_key, created_at
    )
    SELECT
      ${patient.id}, organisation_id, 'mood_decline', 'critical',
      'Critical mood score reported',
      ${'Patient reported mood score of ' + mood + '/10. Immediate clinical review recommended.'},
      'SIM-SAFETY-001', NOW()
    FROM patients WHERE id = ${patient.id}
  `;

  // Create safety event with the required symptom_log_id
  await sql`
    INSERT INTO safety_events (patient_id, symptom_log_id, daily_entry_id, entry_date, intensity, alert_raised_at)
    VALUES (${patient.id}, ${symptomLogId}, ${entryId}, ${today}, ${intensity}, NOW())
    ON CONFLICT DO NOTHING
  `;

  stats.safetyEventsHandled++;
  log(`⚠ Safety concern flagged for ${patient.first_name} ${patient.last_name} (mood: ${mood})`, 'warn');
}

// ---------------------------------------------------------------------------
// Clinical Response Simulation
// ---------------------------------------------------------------------------

async function simulateClinicalResponses(
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  log('Simulating clinical responses...', 'info');

  // Acknowledge pending alerts
  await acknowledgeAlerts(clinicians, stats);

  // Generate routine clinical notes
  await generateRoutineNotes(clinicians, stats);
}

async function acknowledgeAlerts(
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  // Get unacknowledged alerts older than 1 hour
  const alerts = await sql<{
    id: string;
    patient_id: string;
    severity: string;
    created_at: string;
  }[]>`
    SELECT id, patient_id, severity, created_at
    FROM clinical_alerts
    WHERE acknowledged_at IS NULL
      AND created_at < NOW() - INTERVAL '1 hour'
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
      created_at ASC
    LIMIT 20
  `;

  for (const alert of alerts) {
    const ackRate = CONFIG.ALERT_ACK_RATES[alert.severity] ?? 0.5;

    if (Math.random() < ackRate) {
      const clinician = pick(clinicians);
      const ackNote = generateAlertAckNote(alert.severity);

      if (!DRY_RUN) {
        await sql`
          UPDATE clinical_alerts
          SET acknowledged_by = ${clinician.id},
              acknowledged_at = NOW(),
              acknowledgement_note = ${ackNote}
          WHERE id = ${alert.id}
        `;

        // Create intervention note
        await sql`
          INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, linked_date)
          VALUES (${alert.patient_id}, ${clinician.id}, 'intervention', ${ackNote}, ${todayStr()})
        `;

        stats.alertsAcknowledged++;
        stats.notesCreated++;
      }

      log(`Acknowledged ${alert.severity} alert`, 'verbose');
    }
  }
}

async function generateRoutineNotes(
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  // Generate notes for high-risk patients who were seen today
  const timeOfDay = getTimeOfDay();

  // Only generate routine notes during afternoon/evening
  if (timeOfDay === 'morning') return;

  // Get high-risk patients with recent activity
  const patients = await sql<{ id: string; first_name: string; last_name: string; risk_level: string }[]>`
    SELECT DISTINCT p.id, p.first_name, p.last_name, p.risk_level
    FROM patients p
    JOIN daily_entries de ON de.patient_id = p.id
    WHERE p.risk_level IN ('high', 'critical')
      AND de.entry_date = ${todayStr()}
      AND NOT EXISTS (
        SELECT 1 FROM clinician_notes cn
        WHERE cn.patient_id = p.id
          AND cn.linked_date = ${todayStr()}
          AND cn.note_type = 'observation'
      )
    LIMIT 10
  `;

  for (const patient of patients) {
    // 30% chance of generating a routine observation note
    if (Math.random() < 0.3) {
      const clinician = pick(clinicians);

      const trends = ['stable', 'slight improvement noted', 'continued monitoring indicated', 'showing engagement'];
      const observations = [
        'Patient completing daily entries consistently.',
        'Mood tracking shows typical variation for risk level.',
        'Engagement with app remains steady.',
        'No safety concerns identified today.',
      ];

      const noteBody = `Routine observation: Patient's recent activity reviewed. Trend: ${pick(trends)}. ${pick(observations)} Continue current monitoring protocol.`;

      if (!DRY_RUN) {
        await sql`
          INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, linked_date)
          VALUES (${patient.id}, ${clinician.id}, 'observation', ${noteBody}, ${todayStr()})
        `;
        stats.notesCreated++;
      }

      log(`Generated observation note for ${patient.first_name} ${patient.last_name}`, 'verbose');
    }
  }
}

// ---------------------------------------------------------------------------
// Main Simulation
// ---------------------------------------------------------------------------

async function runSimulation(): Promise<void> {
  const startTime = Date.now();
  const timeOfDay = getTimeOfDay();

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  MindLog Live Simulation — ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} Run`);
  console.log('════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    log('DRY RUN MODE - No changes will be made', 'warn');
  }

  // Safety check - only run on demo org
  const [org] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM organisations WHERE name = ${CONFIG.DEMO_ORG_NAME} LIMIT 1
  `;

  if (!org) {
    log(`Demo organization "${CONFIG.DEMO_ORG_NAME}" not found. Aborting.`, 'error');
    await closeDb();
    process.exit(1);
  }

  log(`Running on organization: ${org.name}`);

  // Get active patients
  const patients = await sql<Patient[]>`
    SELECT id, first_name, last_name, risk_level, status, last_checkin_at, tracking_streak
    FROM patients
    WHERE organisation_id = ${org.id}
      AND status IN ('active', 'crisis')
      AND is_active = TRUE
    ORDER BY
      CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
      last_name, first_name
  `;

  log(`Found ${patients.length} active patients`);

  // Get clinicians
  const clinicians = await sql<Clinician[]>`
    SELECT id, first_name, last_name
    FROM clinicians
    WHERE organisation_id = ${org.id} AND is_active = TRUE
  `;

  log(`Found ${clinicians.length} clinicians`);

  const stats: SimulationStats = {
    patientsProcessed: 0,
    entriesCreated: 0,
    sleepLogsCreated: 0,
    exerciseLogsCreated: 0,
    symptomsLogged: 0,
    triggersLogged: 0,
    journalsCreated: 0,
    medicationLogsCreated: 0,
    alertsAcknowledged: 0,
    notesCreated: 0,
    safetyEventsHandled: 0,
  };

  // Simulate patient activity
  log('Simulating patient activity...');
  for (const patient of patients) {
    await simulatePatientActivity(patient, clinicians, stats);
  }

  // Simulate clinical responses
  await simulateClinicalResponses(clinicians, stats);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SIMULATION COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`
  Duration: ${duration}s

  Patient Activity:
    • Patients processed:    ${stats.patientsProcessed}
    • Daily entries created: ${stats.entriesCreated}
    • Sleep logs:            ${stats.sleepLogsCreated}
    • Exercise logs:         ${stats.exerciseLogsCreated}
    • Symptoms logged:       ${stats.symptomsLogged}
    • Triggers logged:       ${stats.triggersLogged}
    • Journals created:      ${stats.journalsCreated}
    • Medication logs:       ${stats.medicationLogsCreated}

  Clinical Activity:
    • Alerts acknowledged:   ${stats.alertsAcknowledged}
    • Notes created:         ${stats.notesCreated}
    • Safety events:         ${stats.safetyEventsHandled}
  `);
  console.log('════════════════════════════════════════════════════════\n');

  // Calculate next run time
  const now = new Date();
  const nextRuns = [6, 14, 22].map(h => {
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  });
  const nextRun = nextRuns.sort((a, b) => a.getTime() - b.getTime())[0]!;
  log(`Next scheduled run: ${nextRun.toLocaleString()}`);
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

runSimulation()
  .catch((err: unknown) => {
    console.error('\nSimulation failed:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
