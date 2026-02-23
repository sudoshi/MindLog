// =============================================================================
// MindLog — Low-Risk Patient Mood Enrichment
//
// Creates clinically plausible mood trajectories for low-risk patients:
//   • Stable, high baseline moods (7-9 range)
//   • Gradual improvement trends (recovery/maintenance phase)
//   • Low day-to-day volatility
//   • Realistic weekly patterns (Monday dips, weekend lifts)
//   • Correlation with sleep quality and exercise
//   • Occasional minor stressors with quick recovery
//   • Seasonal/life event variations
//
// =============================================================================

import { sql, closeDb } from './client.js';

// ---------------------------------------------------------------------------
// Mood Pattern Types for Low-Risk Patients
// ---------------------------------------------------------------------------

type MoodPattern =
  | 'stable_high'        // Consistently high moods (8-9)
  | 'gradual_improvement'// Starting 6-7, trending up to 8-9
  | 'maintenance'        // Stable around 7-8 with minor fluctuations
  | 'weekend_responder'  // Higher on weekends, slight weekday dips
  | 'exercise_correlated'// Mood tracks with exercise days
  | 'early_bird'         // Better moods early in week, slight Friday fatigue
  | 'seasonal_stable';   // Very stable with occasional weather/season dips

interface PatientMoodProfile {
  pattern: MoodPattern;
  baseline: number;        // Base mood (6-9)
  volatility: number;      // Day-to-day variation (0.3-1.0)
  trend: number;           // Daily trend (-0.01 to +0.03)
  weekendBoost: number;    // Weekend mood lift (0-1.5)
  exerciseBoost: number;   // Exercise correlation (0-1.0)
  sleepSensitivity: number;// Sleep impact on mood (0.1-0.5)
}

// ---------------------------------------------------------------------------
// Generate mood profiles for low-risk patients
// ---------------------------------------------------------------------------

function generateLowRiskProfile(): PatientMoodProfile {
  const patterns: MoodPattern[] = [
    'stable_high', 'stable_high', 'stable_high',  // Weight toward stable
    'gradual_improvement', 'gradual_improvement',
    'maintenance', 'maintenance', 'maintenance',
    'weekend_responder',
    'exercise_correlated',
    'early_bird',
    'seasonal_stable', 'seasonal_stable'
  ];

  const pattern = patterns[Math.floor(Math.random() * patterns.length)]!;

  switch (pattern) {
    case 'stable_high':
      return {
        pattern,
        baseline: 8 + Math.random() * 1,      // 8-9
        volatility: 0.3 + Math.random() * 0.3, // Very low volatility
        trend: 0.005 + Math.random() * 0.01,   // Slight positive trend
        weekendBoost: 0.3 + Math.random() * 0.4,
        exerciseBoost: 0.3 + Math.random() * 0.3,
        sleepSensitivity: 0.2 + Math.random() * 0.2,
      };

    case 'gradual_improvement':
      return {
        pattern,
        baseline: 6.5 + Math.random() * 1,    // Start 6.5-7.5
        volatility: 0.4 + Math.random() * 0.3,
        trend: 0.02 + Math.random() * 0.02,   // Clear positive trend
        weekendBoost: 0.4 + Math.random() * 0.4,
        exerciseBoost: 0.4 + Math.random() * 0.3,
        sleepSensitivity: 0.3 + Math.random() * 0.2,
      };

    case 'maintenance':
      return {
        pattern,
        baseline: 7 + Math.random() * 1.5,    // 7-8.5
        volatility: 0.5 + Math.random() * 0.3,
        trend: 0 + Math.random() * 0.01,      // Stable, minimal trend
        weekendBoost: 0.3 + Math.random() * 0.5,
        exerciseBoost: 0.3 + Math.random() * 0.4,
        sleepSensitivity: 0.25 + Math.random() * 0.2,
      };

    case 'weekend_responder':
      return {
        pattern,
        baseline: 7 + Math.random() * 1,
        volatility: 0.4 + Math.random() * 0.3,
        trend: 0.01 + Math.random() * 0.01,
        weekendBoost: 1.0 + Math.random() * 0.5,  // Strong weekend boost
        exerciseBoost: 0.3 + Math.random() * 0.3,
        sleepSensitivity: 0.2 + Math.random() * 0.2,
      };

    case 'exercise_correlated':
      return {
        pattern,
        baseline: 7 + Math.random() * 1,
        volatility: 0.5 + Math.random() * 0.3,
        trend: 0.01 + Math.random() * 0.015,
        weekendBoost: 0.3 + Math.random() * 0.4,
        exerciseBoost: 0.8 + Math.random() * 0.4,  // Strong exercise correlation
        sleepSensitivity: 0.2 + Math.random() * 0.2,
      };

    case 'early_bird':
      return {
        pattern,
        baseline: 7.5 + Math.random() * 1,
        volatility: 0.4 + Math.random() * 0.3,
        trend: 0.008 + Math.random() * 0.01,
        weekendBoost: 0.2 + Math.random() * 0.3,  // Less weekend dependent
        exerciseBoost: 0.4 + Math.random() * 0.3,
        sleepSensitivity: 0.35 + Math.random() * 0.2,  // More sleep sensitive
      };

    case 'seasonal_stable':
    default:
      return {
        pattern,
        baseline: 7.5 + Math.random() * 1.5,
        volatility: 0.3 + Math.random() * 0.2,  // Very stable
        trend: 0.005 + Math.random() * 0.01,
        weekendBoost: 0.3 + Math.random() * 0.3,
        exerciseBoost: 0.3 + Math.random() * 0.3,
        sleepSensitivity: 0.2 + Math.random() * 0.15,
      };
  }
}

// ---------------------------------------------------------------------------
// Calculate mood for a specific day
// ---------------------------------------------------------------------------

function calculateMood(
  profile: PatientMoodProfile,
  dayIndex: number,
  dayOfWeek: number,  // 0 = Sunday, 6 = Saturday
  hasExercise: boolean,
  sleepHours: number | null,
  totalDays: number
): number {
  // Base mood with trend
  let mood = profile.baseline + (profile.trend * dayIndex);

  // Cap the trend improvement (don't go above 9.5)
  mood = Math.min(mood, 9.5);

  // Weekend boost (Saturday = 6, Sunday = 0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    mood += profile.weekendBoost;
  } else if (dayOfWeek === 1) {
    // Monday slight dip
    mood -= profile.weekendBoost * 0.3;
  } else if (dayOfWeek === 5) {
    // Friday anticipation boost
    mood += profile.weekendBoost * 0.4;
  }

  // Exercise boost
  if (hasExercise) {
    mood += profile.exerciseBoost;
  }

  // Sleep impact (assuming 7-8 hours is optimal)
  if (sleepHours !== null) {
    const optimalSleep = 7.5;
    const sleepDelta = sleepHours - optimalSleep;
    if (sleepDelta < -2) {
      // Poor sleep (< 5.5 hours) - negative impact
      mood -= profile.sleepSensitivity * 1.5;
    } else if (sleepDelta < 0) {
      // Slightly under-slept
      mood -= profile.sleepSensitivity * 0.5;
    } else if (sleepDelta > 1) {
      // Well rested (8.5+ hours) - small boost
      mood += profile.sleepSensitivity * 0.3;
    }
  }

  // Random daily variation (Gaussian-ish)
  const noise = (Math.random() + Math.random() + Math.random() - 1.5) * profile.volatility;
  mood += noise;

  // Occasional "life event" dips (5% chance, recover quickly)
  if (Math.random() < 0.05) {
    mood -= 0.5 + Math.random() * 0.5;
  }

  // Very rare "good day" bonus (3% chance)
  if (Math.random() < 0.03) {
    mood += 0.5 + Math.random() * 0.3;
  }

  // Clamp to valid range (for low-risk, keep floor at 5)
  return Math.round(Math.max(5, Math.min(10, mood)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

async function enrichLowRiskMoods(): Promise<void> {
  console.log('\nMindLog — Low-Risk Patient Mood Enrichment');
  console.log('=============================================\n');

  // Get all low-risk patients
  const patients = await sql<{
    id: string;
    first_name: string;
    last_name: string;
  }[]>`
    SELECT id, first_name, last_name
    FROM patients
    WHERE risk_level = 'low'
      AND status = 'active'
      AND organisation_id = (SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1)
    ORDER BY last_name, first_name
  `;

  console.log(`Found ${patients.length} low-risk patients to enrich.\n`);

  let totalEntriesUpdated = 0;
  let patientsProcessed = 0;

  for (const patient of patients) {
    // Generate a mood profile for this patient
    const profile = generateLowRiskProfile();

    // Get all daily entries for this patient, ordered by date
    const entries = await sql<{
      id: string;
      entry_date: string;
      mood: number | null;
    }[]>`
      SELECT de.id, de.entry_date, de.mood
      FROM daily_entries de
      WHERE de.patient_id = ${patient.id}
      ORDER BY de.entry_date ASC
    `;

    if (entries.length === 0) continue;

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const entryDate = new Date(entry.entry_date);
      const dayOfWeek = entryDate.getDay();

      // Check for exercise on this day
      const [exerciseLog] = await sql<{ duration_minutes: number }[]>`
        SELECT duration_minutes FROM exercise_logs
        WHERE daily_entry_id = ${entry.id}
        LIMIT 1
      `;
      const hasExercise = exerciseLog !== undefined && exerciseLog.duration_minutes > 0;

      // Check sleep hours
      const [sleepLog] = await sql<{ hours: number; minutes: number }[]>`
        SELECT hours, minutes FROM sleep_logs
        WHERE daily_entry_id = ${entry.id}
        LIMIT 1
      `;
      const sleepHours = sleepLog ? sleepLog.hours + (sleepLog.minutes / 60) : null;

      // Calculate new mood
      const newMood = calculateMood(
        profile,
        i,
        dayOfWeek,
        hasExercise,
        sleepHours,
        entries.length
      );

      // Round to integer for database
      const moodInt = Math.round(newMood);

      // Also calculate a correlated coping score
      const copingBase = moodInt - 1 + Math.random() * 2;
      const copingInt = Math.round(Math.max(4, Math.min(10, copingBase)));

      // Update the entry
      await sql`
        UPDATE daily_entries
        SET mood = ${moodInt},
            coping = ${copingInt},
            submitted_at = COALESCE(submitted_at, entry_date + TIME '20:00:00')
        WHERE id = ${entry.id}
      `;

      totalEntriesUpdated++;
    }

    patientsProcessed++;

    // Progress indicator
    if (patientsProcessed % 10 === 0) {
      process.stdout.write(`  Processed ${patientsProcessed}/${patients.length} patients...\r`);
    }
  }

  console.log(`\n\n✓ Updated ${totalEntriesUpdated} daily entries for ${patientsProcessed} patients`);

  // Generate summary statistics
  const [stats] = await sql<{
    avg_mood: number;
    min_mood: number;
    max_mood: number;
    stddev: number;
  }[]>`
    SELECT
      ROUND(AVG(de.mood)::numeric, 2) as avg_mood,
      MIN(de.mood) as min_mood,
      MAX(de.mood) as max_mood,
      ROUND(STDDEV(de.mood)::numeric, 2) as stddev
    FROM daily_entries de
    JOIN patients p ON p.id = de.patient_id
    WHERE p.risk_level = 'low' AND p.status = 'active'
  `;

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  LOW-RISK PATIENT MOOD STATISTICS');
  console.log('════════════════════════════════════════════════════════');
  console.log(`
  Average Mood:     ${stats?.avg_mood ?? 'N/A'}
  Mood Range:       ${stats?.min_mood ?? 'N/A'} - ${stats?.max_mood ?? 'N/A'}
  Std Deviation:    ${stats?.stddev ?? 'N/A'}

  Mood Patterns Applied:
    • Stable High (baseline 8-9, minimal variation)
    • Gradual Improvement (6.5→8.5 over 60 days)
    • Maintenance Phase (stable 7-8)
    • Weekend Responder (weekday 7, weekend 8.5+)
    • Exercise Correlated (mood tracks activity)
    • Early Bird (better early week)
    • Seasonal Stable (very consistent)
  `);
  console.log('════════════════════════════════════════════════════════\n');
}

// Also update sleep logs to be more realistic for low-risk patients
async function enrichLowRiskSleep(): Promise<void> {
  console.log('Enriching sleep data for low-risk patients...\n');

  const patients = await sql<{ id: string }[]>`
    SELECT id FROM patients
    WHERE risk_level = 'low' AND status = 'active'
      AND organisation_id = (SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1)
  `;

  let sleepLogsUpdated = 0;

  for (const patient of patients) {
    // Get entries without sleep logs
    const entriesWithoutSleep = await sql<{ id: string; entry_date: string }[]>`
      SELECT de.id, de.entry_date
      FROM daily_entries de
      LEFT JOIN sleep_logs sl ON sl.daily_entry_id = de.id
      WHERE de.patient_id = ${patient.id}
        AND sl.id IS NULL
    `;

    for (const entry of entriesWithoutSleep) {
      const dayOfWeek = new Date(entry.entry_date).getDay();

      // Low-risk patients have good sleep habits
      // Weekend: slightly more sleep
      // Weekday: consistent 7-8 hours
      let baseHours = dayOfWeek === 0 || dayOfWeek === 6 ? 8 : 7;
      baseHours += (Math.random() - 0.3) * 1.5; // 6-9 hour range

      const hours = Math.floor(Math.max(6, Math.min(9, baseHours)));
      const minutes = [0, 15, 30, 45][Math.floor(Math.random() * 4)]!;
      const quality = Math.min(10, Math.max(6, Math.round(7 + Math.random() * 2)));

      await sql`
        INSERT INTO sleep_logs (daily_entry_id, patient_id, entry_date, hours, minutes, quality)
        VALUES (${entry.id}, ${patient.id}, ${entry.entry_date}, ${hours}, ${minutes}, ${quality})
        ON CONFLICT (daily_entry_id) DO UPDATE
        SET hours = EXCLUDED.hours, minutes = EXCLUDED.minutes, quality = EXCLUDED.quality
      `;
      sleepLogsUpdated++;
    }
  }

  console.log(`✓ Created/updated ${sleepLogsUpdated} sleep logs\n`);
}

// Ensure exercise logs exist for correlation
async function enrichLowRiskExercise(): Promise<void> {
  console.log('Enriching exercise data for low-risk patients...\n');

  const patients = await sql<{ id: string }[]>`
    SELECT id FROM patients
    WHERE risk_level = 'low' AND status = 'active'
      AND organisation_id = (SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1)
  `;

  let exerciseLogsCreated = 0;

  for (const patient of patients) {
    // Get entries without exercise logs
    const entriesWithoutExercise = await sql<{ id: string; entry_date: string }[]>`
      SELECT de.id, de.entry_date
      FROM daily_entries de
      LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.patient_id = ${patient.id}
        AND el.id IS NULL
    `;

    for (const entry of entriesWithoutExercise) {
      // Low-risk patients exercise regularly (60% of days)
      if (Math.random() < 0.6) {
        const duration = [15, 20, 30, 30, 45, 45, 60][Math.floor(Math.random() * 7)]!;
        const exerciseTypes = ['walk', 'run', 'yoga', 'cycling', 'swimming', 'gym', 'hiking', 'tennis'];
        const exerciseType = exerciseTypes[Math.floor(Math.random() * exerciseTypes.length)]!;

        await sql`
          INSERT INTO exercise_logs (daily_entry_id, patient_id, entry_date, duration_minutes, exercise_type)
          VALUES (${entry.id}, ${patient.id}, ${entry.entry_date}, ${duration}, ${exerciseType})
          ON CONFLICT (daily_entry_id) DO NOTHING
        `;
        exerciseLogsCreated++;
      }
    }
  }

  console.log(`✓ Created ${exerciseLogsCreated} exercise logs\n`);
}

// Main execution
async function main(): Promise<void> {
  try {
    await enrichLowRiskExercise();
    await enrichLowRiskSleep();
    await enrichLowRiskMoods();

    console.log('Low-risk patient enrichment complete!\n');
  } catch (err) {
    console.error('Enrichment failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
