// =============================================================================
// MindLog — Demo Seed Script
//
// Creates:
//   • 1 organisation
//   • 7 clinicians (Supabase auth + DB record)
//   • 146 patients (Supabase auth + DB record)
//   • 60 days of daily entries per patient (realistic mood trajectories)
//   • Sleep logs, exercise logs, medication adherence
//   • Patient medications (~2.5 per patient)
//   • Journal entries (~8 per patient, 30% shared)
//   • Clinical alerts (~350 across the patient cohort)
//   • Clinician notes (~180)
//   • Trigger / symptom / wellness strategy catalogues
//
// Usage:
//   npm run db:seed-demo                   # idempotent — skips if org exists
//   npm run db:seed-demo -- --force        # wipe + re-seed
//
// NEVER run against production data.
// =============================================================================

import { sql, closeDb } from './client.js';

// ---------------------------------------------------------------------------
// Config (from env)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? '';
const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const DAYS = 60;
const TODAY = new Date();

// ---------------------------------------------------------------------------
// Supabase Auth — create user via Admin REST API
// ---------------------------------------------------------------------------
async function createSupabaseUser(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    // If user already exists, fetch their ID
    if (res.status === 422 && err.includes('already been registered')) {
      return getSupabaseUserId(email);
    }
    console.warn(`  ⚠ Supabase auth failed for ${email}: ${err}`);
    return null;
  }

  const data = (await res.json()) as { user?: { id?: string } };
  return data.user?.id ?? null;
}

async function getSupabaseUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  return data.users?.find((u) => u.email === email)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dateStr(daysAgo: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Patient profile types
// ---------------------------------------------------------------------------
interface PatientProfile {
  checkInRate: number;  // 0-1 probability of checking in each day
  baselineMood: number; // starting mood
  trendPerDay: number;  // mood trend (positive = improving)
  amplitude: number;    // sine wave amplitude
  wavePeriod: number;   // days per cycle
  noiseLevel: number;   // random noise ±
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  status: 'active' | 'inactive' | 'discharged';
}

function generateMood(dayIndex: number, profile: PatientProfile): number | null {
  if (Math.random() > profile.checkInRate) return null; // missed check-in
  const base = profile.baselineMood + profile.trendPerDay * dayIndex;
  const wave = profile.amplitude * Math.sin((dayIndex / profile.wavePeriod) * Math.PI * 2);
  const noise = (Math.random() - 0.5) * 2 * profile.noiseLevel;
  return clamp(Math.round(base + wave + noise), 1, 10);
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const CLINICIANS = [
  { email: 'dr.kim@mindlogdemo.com',     firstName: 'Sarah',   lastName: 'Kim',     title: 'Dr', role: 'psychiatrist',     npi: '1234567801', patientCount: 22 },
  { email: 'dr.torres@mindlogdemo.com',  firstName: 'Michael', lastName: 'Torres',  title: 'Dr', role: 'psychiatrist',     npi: '1234567802', patientCount: 22 },
  { email: 'dr.walsh@mindlogdemo.com',   firstName: 'Jennifer',lastName: 'Walsh',   title: 'Dr', role: 'psychiatrist',     npi: '1234567803', patientCount: 20 },
  { email: 'dr.okafor@mindlogdemo.com',  firstName: 'David',   lastName: 'Okafor',  title: 'Dr', role: 'psychologist',     npi: '1234567804', patientCount: 20 },
  { email: 'dr.patel@mindlogdemo.com',   firstName: 'Rachel',  lastName: 'Patel',   title: 'Dr', role: 'psychologist',     npi: '1234567805', patientCount: 20 },
  { email: 'dr.johnson@mindlogdemo.com', firstName: 'Marcus',  lastName: 'Johnson', title: 'Dr', role: 'care_coordinator', npi: '1234567806', patientCount: 20 },
  { email: 'np.zhang@mindlogdemo.com',   firstName: 'Emily',   lastName: 'Zhang',   title: 'NP', role: 'nurse',            npi: '1234567807', patientCount: 22 },
] as const;

// Spotlight patients with rich backstories
const SPOTLIGHT_PATIENTS = [
  {
    email: 'alice@mindlogdemo.com',
    firstName: 'Alice', lastName: 'Johnson',
    dob: '1985-03-15',
    mrn: 'MRN-0001',
    clinicianIndex: 0, // Dr. Kim
    profile: { checkInRate: 0.97, baselineMood: 5, trendPerDay: 0.05, amplitude: 1.5, wavePeriod: 14, noiseLevel: 1, riskLevel: 'moderate', status: 'active' } as PatientProfile,
    medications: [
      { name: 'Sertraline', dose: 100, unit: 'mg', freq: 'once_daily_morning' },
      { name: 'Clonazepam', dose: 0.5, unit: 'mg', freq: 'as_needed' },
    ],
  },
  {
    email: 'bob@mindlogdemo.com',
    firstName: 'Bob', lastName: 'Williams',
    dob: '1990-07-22',
    mrn: 'MRN-0002',
    clinicianIndex: 1, // Dr. Torres
    profile: { checkInRate: 0.67, baselineMood: 4.5, trendPerDay: -0.01, amplitude: 2.5, wavePeriod: 7, noiseLevel: 2, riskLevel: 'high', status: 'active' } as PatientProfile,
    medications: [
      { name: 'Lithium Carbonate', dose: 300, unit: 'mg', freq: 'twice_daily' },
      { name: 'Quetiapine',        dose: 50,  unit: 'mg', freq: 'once_daily_bedtime' },
      { name: 'Lorazepam',         dose: 1,   unit: 'mg', freq: 'as_needed' },
    ],
  },
  {
    email: 'carol@mindlogdemo.com',
    firstName: 'Carol', lastName: 'Martinez',
    dob: '1978-11-30',
    mrn: 'MRN-0003',
    clinicianIndex: 2, // Dr. Walsh
    profile: { checkInRate: 1.0, baselineMood: 8, trendPerDay: 0.01, amplitude: 0.5, wavePeriod: 21, noiseLevel: 0.5, riskLevel: 'low', status: 'active' } as PatientProfile,
    medications: [
      { name: 'Fluoxetine', dose: 20, unit: 'mg', freq: 'once_daily_morning' },
    ],
  },
  {
    email: 'david@mindlogdemo.com',
    firstName: 'David', lastName: 'Chen',
    dob: '1995-05-10',
    mrn: 'MRN-0004',
    clinicianIndex: 1, // Dr. Torres
    profile: { checkInRate: 0.58, baselineMood: 3, trendPerDay: -0.03, amplitude: 1, wavePeriod: 10, noiseLevel: 1.5, riskLevel: 'critical', status: 'active' } as PatientProfile,
    medications: [
      { name: 'Bupropion',  dose: 150, unit: 'mg', freq: 'twice_daily' },
      { name: 'Aripiprazole',dose: 10, unit: 'mg', freq: 'once_daily_morning' },
    ],
  },
];

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Barbara', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna',
  'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  'Timothy', 'Deborah',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
  'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera',
];

const MEDICATION_POOL = [
  { name: 'Escitalopram',   dose: 10,  unit: 'mg', freq: 'once_daily_morning' },
  { name: 'Sertraline',     dose: 50,  unit: 'mg', freq: 'once_daily_morning' },
  { name: 'Fluoxetine',     dose: 20,  unit: 'mg', freq: 'once_daily_morning' },
  { name: 'Venlafaxine',    dose: 75,  unit: 'mg', freq: 'twice_daily' },
  { name: 'Bupropion',      dose: 150, unit: 'mg', freq: 'twice_daily' },
  { name: 'Mirtazapine',    dose: 15,  unit: 'mg', freq: 'once_daily_bedtime' },
  { name: 'Quetiapine',     dose: 50,  unit: 'mg', freq: 'once_daily_bedtime' },
  { name: 'Olanzapine',     dose: 5,   unit: 'mg', freq: 'once_daily_bedtime' },
  { name: 'Lithium Carbonate', dose: 300, unit: 'mg', freq: 'twice_daily' },
  { name: 'Valproate',      dose: 500, unit: 'mg', freq: 'twice_daily' },
  { name: 'Lamotrigine',    dose: 100, unit: 'mg', freq: 'twice_daily' },
  { name: 'Aripiprazole',   dose: 10,  unit: 'mg', freq: 'once_daily_morning' },
  { name: 'Risperidone',    dose: 1,   unit: 'mg', freq: 'twice_daily' },
  { name: 'Clonazepam',     dose: 0.5, unit: 'mg', freq: 'as_needed' },
  { name: 'Lorazepam',      dose: 1,   unit: 'mg', freq: 'as_needed' },
  { name: 'Propranolol',    dose: 20,  unit: 'mg', freq: 'as_needed' },
  { name: 'Hydroxyzine',    dose: 25,  unit: 'mg', freq: 'as_needed' },
  { name: 'Melatonin',      dose: 5,   unit: 'mg', freq: 'once_daily_bedtime' },
];

const JOURNAL_BODIES = [
  "Feeling a bit more settled today. The breathing exercises are helping with the anxiety spikes in the morning.",
  "Rough day at work — lots of pressure from my manager. I managed to use the grounding technique and it helped.",
  "Slept better last night, almost 7 hours. I think cutting back on screen time is making a difference.",
  "Had a good walk outside this afternoon. Nature really does help reset my mood.",
  "Feeling overwhelmed with everything. Tried to reach out to a friend but they didn't respond.",
  "Therapy session today was intense but good. Working through some old patterns.",
  "My energy levels are higher today. Completed some tasks I had been putting off for weeks.",
  "Feeling grateful for small things — a good meal, sunshine, my morning coffee.",
  "Struggled a lot this morning. Intrusive thoughts are back and it's exhausting.",
  "Did some journaling and felt a bit better. Writing things down helps clear my head.",
  "Had a panic attack in the afternoon. Reminded myself it will pass and it did.",
  "Feeling more connected today. Had a real conversation with someone who actually listened.",
  "The medication seems to be stabilizing things. Less ups and downs this week.",
  "Really hard to get out of bed today. Everything feels heavy and pointless.",
  "Made a small goal and achieved it. Even tiny wins matter when things are hard.",
];

const NOTE_BODIES = [
  "Patient reports improved sleep quality over the past week. Medication titration appears to be effective. Continue current regimen and reassess in 2 weeks.",
  "Discussed coping strategies for workplace stress. Patient responded well and showed good insight. Plan to continue CBT techniques focusing on cognitive restructuring.",
  "Safety assessment conducted — patient denies active SI/HI. Mood has been variable but overall trending toward baseline. Follow up scheduled.",
  "Patient reported missed doses this week due to travel. Reviewed importance of adherence. Discussed pill organizer and alarm reminders.",
  "Significant improvement noted since last appointment. Patient is engaging well with the app and tracking consistently.",
  "Discussed recent mood decline. Possible contributing factors: work stress and disrupted sleep schedule. Adjusted evening medication dose.",
  "Care team huddle discussed. Coordinating with social worker for additional psychosocial support.",
  "Risk level reviewed and updated to high based on recent symptom pattern. Increased contact frequency to weekly check-ins.",
  "Patient expressed frustration with medication side effects. Discussed options — will try tapering dose and adding adjunct therapy.",
  "Excellent session today — patient demonstrated strong use of DBT skills in a real-life situation.",
];

const ALERT_TITLES = {
  mood_decline:     'Mood decline detected',
  missed_checkin:   'Multiple missed check-ins',
  safety_flag:      'Safety symptom reported',
  med_nonadherence: 'Medication non-adherence pattern',
};

const ALERT_BODIES = {
  mood_decline:     'Patient mood has declined by 3+ points over the past 7 days. Clinical review recommended.',
  missed_checkin:   'Patient has missed 3 or more consecutive check-ins. Please attempt contact.',
  safety_flag:      'Patient reported a safety-related symptom during their check-in. Immediate review required.',
  med_nonadherence: 'Medication adherence rate has fallen below 50% in the past 14 days. Intervention may be needed.',
};

// ---------------------------------------------------------------------------
// Wipe existing demo data (--force)
// ---------------------------------------------------------------------------
async function wipeDemoData(): Promise<void> {
  console.log('⚠  Wiping existing demo data...');
  const [org] = await sql<{ id: string }[]>`
    SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1
  `;
  if (!org) {
    console.log('  Nothing to wipe.');
  } else {
    // Must delete in order — organisations.id has ON DELETE RESTRICT on both
    // clinicians and patients. Delete patients first (cascades to all patient
    // child records including clinical_alerts, daily_entries, medications, etc.)
    // then clinicians, then the org.
    await sql`DELETE FROM patients   WHERE organisation_id = ${org.id}`;
    await sql`DELETE FROM clinicians WHERE organisation_id = ${org.id}`;
    await sql`DELETE FROM organisations WHERE id = ${org.id}`;
  }
  // Also wipe system catalogues (shared, not org-scoped)
  await sql`DELETE FROM trigger_catalogue  WHERE is_system = TRUE`;
  await sql`DELETE FROM symptom_catalogue  WHERE is_system = TRUE`;
  await sql`DELETE FROM wellness_strategies WHERE is_system = TRUE`;
  console.log('✓ Wiped.');
}

// ---------------------------------------------------------------------------
// Seed catalogues (system-level — no org/patient)
// ---------------------------------------------------------------------------
async function seedCatalogues(): Promise<{
  triggerIds: Record<string, string>;
  symptomIds: Record<string, string>;
  strategyIds: Record<string, string>;
}> {
  // Trigger catalogue
  const triggers = await sql<{ id: string; name: string }[]>`
    INSERT INTO trigger_catalogue (name, category, is_system, display_order) VALUES
      ('Work stress',        'work_home',    TRUE, 1),
      ('Relationship issues','relationship', TRUE, 2),
      ('Poor sleep',         'behavioural',  TRUE, 3),
      ('Financial worry',    'life_events',  TRUE, 4),
      ('Social isolation',   'life_events',  TRUE, 5),
      ('Physical pain',      'health',       TRUE, 6),
      ('News / media',       'work_home',    TRUE, 7),
      ('Family conflict',    'relationship', TRUE, 8),
      ('Substance use',      'behavioural',  TRUE, 9),
      ('Trauma reminder',    'life_events',  TRUE, 10)
    ON CONFLICT DO NOTHING
    RETURNING id, name
  `;

  const triggerIds: Record<string, string> = {};
  for (const t of triggers) triggerIds[t.name] = t.id;

  // Symptom catalogue
  const symptoms = await sql<{ id: string; name: string }[]>`
    INSERT INTO symptom_catalogue (name, category, is_safety_symptom, is_system, display_order) VALUES
      ('Low mood',            'mood',        FALSE, TRUE, 1),
      ('Anxiety',             'mood',        FALSE, TRUE, 2),
      ('Irritability',        'mood',        FALSE, TRUE, 3),
      ('Fatigue',             'physical',    FALSE, TRUE, 4),
      ('Insomnia',            'physical',    FALSE, TRUE, 5),
      ('Appetite loss',       'physical',    FALSE, TRUE, 6),
      ('Concentration issues','cognitive',   FALSE, TRUE, 7),
      ('Social withdrawal',   'behavioural', FALSE, TRUE, 8),
      ('Hopelessness',        'mood',        FALSE, TRUE, 9),
      ('Self-harm urges',     'safety',      TRUE,  TRUE, 10),
      ('Suicidal ideation',   'safety',      TRUE,  TRUE, 11),
      ('Substance cravings',  'behavioural', FALSE, TRUE, 12)
    ON CONFLICT DO NOTHING
    RETURNING id, name
  `;

  const symptomIds: Record<string, string> = {};
  for (const s of symptoms) symptomIds[s.name] = s.id;

  // Wellness strategies
  const strategies = await sql<{ id: string; name: string }[]>`
    INSERT INTO wellness_strategies (name, category, is_system, display_order) VALUES
      ('Deep breathing',      'mental',      TRUE, 1),
      ('Journaling',          'mental',      TRUE, 2),
      ('Exercise',            'physical',    TRUE, 3),
      ('Call a support person','social',     TRUE, 4),
      ('Meditation',          'mental',      TRUE, 5),
      ('Walk outside',        'physical',    TRUE, 6),
      ('Grounding technique', 'mental',      TRUE, 7),
      ('Listen to music',     'mental',      TRUE, 8),
      ('Therapy homework',    'behavioural', TRUE, 9),
      ('Take medication',     'behavioural', TRUE, 10),
      ('Creative activity',   'mental',      TRUE, 11),
      ('Healthy meal',        'nutritional', TRUE, 12)
    ON CONFLICT DO NOTHING
    RETURNING id, name
  `;

  const strategyIds: Record<string, string> = {};
  for (const s of strategies) strategyIds[s.name] = s.id;

  console.log(`  ✓ Catalogues: ${triggers.length} triggers, ${symptoms.length} symptoms, ${strategies.length} strategies`);

  return { triggerIds, symptomIds, strategyIds };
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  console.log('\nMindLog — Demo Seed');
  console.log('===================');
  console.log('WARNING: For demo use only. Never run against production.\n');

  // Idempotency check
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1
  `;

  if (existing && !FORCE) {
    console.log('Demo data already present. Use --force to wipe and re-seed.');
    await closeDb();
    return;
  }

  if (existing && FORCE) {
    await wipeDemoData();
  }

  // ── Catalogues ────────────────────────────────────────────────────────────
  console.log('\n[1/8] Seeding system catalogues...');
  const { triggerIds, symptomIds } = await seedCatalogues();

  // ── Organisation ──────────────────────────────────────────────────────────
  console.log('\n[2/8] Creating organisation...');
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organisations (name, type, city, state, country, timezone, locale)
    VALUES ('MindLog Demo Clinic', 'clinic', 'San Francisco', 'CA', 'US', 'America/Los_Angeles', 'en-US')
    RETURNING id
  `;
  if (!org) throw new Error('Failed to create organisation');
  const orgId = org.id;
  console.log(`  ✓ Organisation: ${orgId}`);

  // ── Clinicians ─────────────────────────────────────────────────────────────
  console.log('\n[3/8] Creating clinicians (Supabase auth + DB)...');

  const clinicianIds: string[] = [];

  // Create Supabase auth users in parallel batches
  const clinicianAuthIds = await Promise.all(
    CLINICIANS.map((c) => createSupabaseUser(c.email, 'Demo@Clinic1!')),
  );

  for (let i = 0; i < CLINICIANS.length; i++) {
    const c = CLINICIANS[i]!;
    const authId = clinicianAuthIds[i];

    if (!authId) {
      console.warn(`  ⚠ Skipping DB insert for ${c.email} (no auth ID)`);
      // Still insert with generated UUID so we have a valid FK
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO clinicians (organisation_id, email, first_name, last_name, title, role, npi)
        VALUES (${orgId}, ${c.email}, ${c.firstName}, ${c.lastName}, ${c.title}, ${c.role}, ${c.npi})
        RETURNING id
      `;
      clinicianIds.push(row!.id);
    } else {
      // Insert with the Supabase auth UUID as the clinician's PK
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO clinicians (id, organisation_id, email, first_name, last_name, title, role, npi)
        VALUES (${authId}, ${orgId}, ${c.email}, ${c.firstName}, ${c.lastName}, ${c.title}, ${c.role}, ${c.npi})
        ON CONFLICT (id) DO UPDATE SET
          organisation_id = EXCLUDED.organisation_id,
          email = EXCLUDED.email,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name
        RETURNING id
      `;
      clinicianIds.push(row!.id);
    }
    console.log(`  ✓ ${c.firstName} ${c.lastName} (${c.email})`);
  }

  // ── Patients ───────────────────────────────────────────────────────────────
  console.log('\n[4/8] Creating patients (Supabase auth + DB)...');

  const PATIENT_PROFILES: PatientProfile[] = [
    // 30 low-risk patients
    ...Array.from({ length: 30 }, () => ({
      checkInRate: 0.9 + Math.random() * 0.1,
      baselineMood: 7 + Math.random() * 2,
      trendPerDay: (Math.random() - 0.3) * 0.02,
      amplitude: 0.5 + Math.random() * 0.5,
      wavePeriod: 14 + randInt(0, 14),
      noiseLevel: 0.5,
      riskLevel: 'low' as const,
      status: 'active' as const,
    })),
    // 46 moderate-risk patients
    ...Array.from({ length: 46 }, () => ({
      checkInRate: 0.8 + Math.random() * 0.1,
      baselineMood: 5 + Math.random() * 2,
      trendPerDay: (Math.random() - 0.5) * 0.03,
      amplitude: 1 + Math.random() * 1,
      wavePeriod: 10 + randInt(0, 10),
      noiseLevel: 1,
      riskLevel: 'moderate' as const,
      status: 'active' as const,
    })),
    // 40 high-risk patients
    ...Array.from({ length: 40 }, () => ({
      checkInRate: 0.6 + Math.random() * 0.1,
      baselineMood: 3 + Math.random() * 2,
      trendPerDay: (Math.random() - 0.6) * 0.04,
      amplitude: 1.5 + Math.random() * 1.5,
      wavePeriod: 7 + randInt(0, 7),
      noiseLevel: 2,
      riskLevel: 'high' as const,
      status: 'active' as const,
    })),
    // 16 crisis patients
    ...Array.from({ length: 16 }, () => ({
      checkInRate: 0.45 + Math.random() * 0.1,
      baselineMood: 1.5 + Math.random() * 1.5,
      trendPerDay: -(Math.random() * 0.05),
      amplitude: 1 + Math.random(),
      wavePeriod: 5 + randInt(0, 5),
      noiseLevel: 1.5,
      riskLevel: 'critical' as const,
      status: 'active' as const,
    })),
    // 10 inactive patients (no recent check-ins)
    ...Array.from({ length: 10 }, () => ({
      checkInRate: 0.1,
      baselineMood: 5,
      trendPerDay: 0,
      amplitude: 1,
      wavePeriod: 14,
      noiseLevel: 1,
      riskLevel: 'moderate' as const,
      status: 'inactive' as const,
    })),
    // 4 discharged patients
    ...Array.from({ length: 4 }, () => ({
      checkInRate: 0,
      baselineMood: 7,
      trendPerDay: 0,
      amplitude: 0,
      wavePeriod: 14,
      noiseLevel: 0,
      riskLevel: 'low' as const,
      status: 'discharged' as const,
    })),
  ];

  // Build clinician assignment (round-robin by patientCount)
  const clinicianAssignments: string[] = [];
  for (let ci = 0; ci < CLINICIANS.length; ci++) {
    const count = CLINICIANS[ci]!.patientCount;
    for (let j = 0; j < count; j++) {
      clinicianAssignments.push(clinicianIds[ci]!);
    }
  }
  // clinicianAssignments has 146 entries — matches total patient count

  // All 146 background patient emails in batches
  const bgPatients: Array<{
    email: string; firstName: string; lastName: string;
    mrn: string; dob: string; profile: PatientProfile;
    clinicianId: string;
  }> = [];

  let bgIndex = 0;
  for (let i = 0; i < 142; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const lastName = LAST_NAMES[i % LAST_NAMES.length]!;
    const num = String(i + 5).padStart(4, '0'); // MRN-0005 onwards
    bgPatients.push({
      email: `patient.${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i + 1}@mindlogdemo.com`,
      firstName,
      lastName,
      mrn: `MRN-${num}`,
      dob: `${1960 + (i % 40)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      profile: PATIENT_PROFILES[i] ?? PATIENT_PROFILES[0]!,
      clinicianId: clinicianAssignments[bgIndex++]!,
    });
  }

  // Batch create Supabase auth for background patients (10 at a time)
  console.log('  Creating Supabase auth users in batches...');
  const bgAuthIds: (string | null)[] = [];
  const BATCH_SIZE = 10;

  for (let start = 0; start < bgPatients.length; start += BATCH_SIZE) {
    const batch = bgPatients.slice(start, start + BATCH_SIZE);
    const ids = await Promise.all(batch.map((p) => createSupabaseUser(p.email, 'Demo@Patient1!')));
    bgAuthIds.push(...ids);
    process.stdout.write(`  ${start + batch.length}/${bgPatients.length} auth users created\r`);
  }
  console.log('');

  // Also create spotlight patient auth users
  const spotlightAuthIds = await Promise.all(
    SPOTLIGHT_PATIENTS.map((p) => createSupabaseUser(p.email, 'Demo@Patient1!')),
  );

  // Build patient DB records (spotlight first, then background)
  const allPatientRows: Array<{
    id: string | null; email: string; firstName: string; lastName: string;
    mrn: string; dob: string; riskLevel: string; status: string;
    clinicianId: string; profile: PatientProfile;
    medications: Array<{ name: string; dose: number; unit: string; freq: string }>;
  }> = [
    ...SPOTLIGHT_PATIENTS.map((sp, i) => ({
      id: spotlightAuthIds[i] ?? null,
      email: sp.email, firstName: sp.firstName, lastName: sp.lastName,
      mrn: sp.mrn, dob: sp.dob,
      riskLevel: sp.profile.riskLevel, status: sp.profile.status,
      clinicianId: clinicianIds[sp.clinicianIndex]!,
      profile: sp.profile,
      medications: sp.medications,
    })),
    ...bgPatients.map((bp, i) => ({
      id: bgAuthIds[i] ?? null,
      email: bp.email, firstName: bp.firstName, lastName: bp.lastName,
      mrn: bp.mrn, dob: bp.dob,
      riskLevel: bp.profile.riskLevel, status: bp.profile.status,
      clinicianId: bp.clinicianId,
      profile: bp.profile,
      medications: [] as Array<{ name: string; dose: number; unit: string; freq: string }>,
    })),
  ];

  // Insert patients and collect their DB IDs
  const patientDbIds: Array<{ dbId: string; clinicianId: string; profile: PatientProfile; email: string; medications: Array<{ name: string; dose: number; unit: string; freq: string }> }> = [];

  for (const p of allPatientRows) {
    let row: { id: string } | undefined;

    if (p.id) {
      [row] = await sql<{ id: string }[]>`
        INSERT INTO patients (
          id, organisation_id, mrn, email, first_name, last_name,
          date_of_birth, timezone, locale, status, risk_level,
          onboarding_complete, app_installed
        ) VALUES (
          ${p.id}, ${orgId}, ${p.mrn}, ${p.email}, ${p.firstName}, ${p.lastName},
          ${p.dob}, 'America/Los_Angeles', 'en-US',
          ${p.status}, ${p.riskLevel}, TRUE, TRUE
        )
        ON CONFLICT (id) DO UPDATE SET
          organisation_id = EXCLUDED.organisation_id,
          mrn = EXCLUDED.mrn,
          status = EXCLUDED.status
        RETURNING id
      `;
    } else {
      [row] = await sql<{ id: string }[]>`
        INSERT INTO patients (
          organisation_id, mrn, email, first_name, last_name,
          date_of_birth, timezone, locale, status, risk_level,
          onboarding_complete, app_installed
        ) VALUES (
          ${orgId}, ${p.mrn}, ${p.email}, ${p.firstName}, ${p.lastName},
          ${p.dob}, 'America/Los_Angeles', 'en-US',
          ${p.status}, ${p.riskLevel}, TRUE, TRUE
        )
        RETURNING id
      `;
    }

    if (!row) continue;
    patientDbIds.push({
      dbId: row.id,
      clinicianId: p.clinicianId,
      profile: p.profile,
      email: p.email,
      medications: p.medications,
    });
  }

  console.log(`  ✓ ${patientDbIds.length} patients created`);

  // Care team + notification prefs
  for (const { dbId, clinicianId } of patientDbIds) {
    await sql`
      INSERT INTO care_team_members (patient_id, clinician_id, role)
      VALUES (${dbId}, ${clinicianId}, 'primary')
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO patient_notification_preferences (patient_id)
      VALUES (${dbId})
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`  ✓ Care team + notification preferences linked`);

  // ── Medications ─────────────────────────────────────────────────────────────
  console.log('\n[5/8] Creating patient medications...');

  // Map from patientDbId to list of medication IDs (for adherence logs)
  const patientMedIds: Map<string, string[]> = new Map();

  for (const { dbId, medications, profile } of patientDbIds) {
    if (profile.status === 'discharged') continue;

    // Spotlight patients have preset meds; background get 1-4 random ones
    const meds = medications.length > 0
      ? medications
      : shuffled(MEDICATION_POOL).slice(0, randInt(1, 4)).map((m) => ({
          name: m.name, dose: m.dose, unit: m.unit, freq: m.freq,
        }));

    const medIds: string[] = [];
    for (const m of meds) {
      const prescribedAt = dateStr(DAYS + randInt(0, 30));
      const [medRow] = await sql<{ id: string }[]>`
        INSERT INTO patient_medications (
          patient_id, medication_name, dose, dose_unit, frequency,
          prescribed_at, show_in_app
        ) VALUES (
          ${dbId}, ${m.name}, ${m.dose}, ${m.unit}, ${m.freq},
          ${prescribedAt}, TRUE
        )
        RETURNING id
      `;
      if (medRow) medIds.push(medRow.id);
    }
    patientMedIds.set(dbId, medIds);
  }

  const totalMeds = [...patientMedIds.values()].reduce((acc, ids) => acc + ids.length, 0);
  console.log(`  ✓ ${totalMeds} medications created`);

  // ── Daily entries + sleep + exercise + adherence + journal ──────────────────
  console.log('\n[6/8] Generating daily entries (60 days × 146 patients)...');
  console.log('  This may take 1-2 minutes...');

  let totalEntries = 0;
  let totalAlerts = 0;
  const alertsToInsert: Array<{
    patient_id: string; org_id: string; alert_type: string;
    severity: string; title: string; body: string; rule_key: string;
    created_at: string; acknowledged_by: string | null; acknowledged_at: string | null;
  }> = [];

  const clinicianNotes: Array<{
    patient_id: string; clinician_id: string; note_type: string;
    body: string; linked_date: string;
  }> = [];

  for (const { dbId, profile, clinicianId } of patientDbIds) {
    if (profile.status === 'discharged') continue;

    const moodHistory: number[] = [];
    const entryIds: string[] = [];

    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
      // Inactive patients only check in during first 30 days of the 60-day window
      if (profile.status === 'inactive' && dayOffset < 30) continue;

      const mood = generateMood(DAYS - dayOffset, profile);
      if (mood === null) continue; // missed check-in

      const entryDate = dateStr(dayOffset);
      const submittedAt = `${entryDate}T${String(randInt(18, 22)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00Z`;
      const completionPct = randInt(60, 100);
      const coping = clamp(mood + randInt(-2, 2), 1, 10);

      const [entryRow] = await sql<{ id: string }[]>`
        INSERT INTO daily_entries (
          patient_id, entry_date, mood, coping, completion_pct,
          core_complete, wellness_complete, triggers_complete,
          symptoms_complete, journal_complete,
          submitted_at, device_platform
        ) VALUES (
          ${dbId}, ${entryDate}, ${mood}, ${coping}, ${completionPct},
          TRUE, ${completionPct > 70}, ${completionPct > 80},
          ${completionPct > 75}, ${completionPct > 85},
          ${submittedAt}, 'ios'
        )
        ON CONFLICT (patient_id, entry_date) DO NOTHING
        RETURNING id
      `;

      if (!entryRow) continue;
      const entryId = entryRow.id;
      entryIds.push(entryId);
      moodHistory.push(mood);
      totalEntries++;

      // Sleep log (80% chance)
      if (Math.random() < 0.8) {
        const sleepHours = clamp(Math.round(5 + (mood / 10) * 4 + (Math.random() - 0.5) * 2), 0, 12);
        const sleepMinutes = pick([0, 15, 30, 45]);
        const sleepQuality = clamp(Math.round(mood * 0.8 + randInt(-1, 2)), 1, 10);
        await sql`
          INSERT INTO sleep_logs (daily_entry_id, patient_id, entry_date, hours, minutes, quality)
          VALUES (${entryId}, ${dbId}, ${entryDate}, ${sleepHours}, ${sleepMinutes}, ${sleepQuality})
          ON CONFLICT DO NOTHING
        `;
      }

      // Exercise log (55% chance)
      if (Math.random() < 0.55) {
        const duration = pick([15, 20, 30, 45, 60]);
        const exerciseType = pick(['walk', 'run', 'yoga', 'cycling', 'swimming', 'gym', 'other']);
        await sql`
          INSERT INTO exercise_logs (daily_entry_id, patient_id, entry_date, duration_minutes, exercise_type)
          VALUES (${entryId}, ${dbId}, ${entryDate}, ${duration}, ${exerciseType})
          ON CONFLICT DO NOTHING
        `;
      }

      // Medication adherence (for each of the patient's meds)
      const medIds = patientMedIds.get(dbId) ?? [];
      for (const medId of medIds) {
        const adherenceRate = profile.riskLevel === 'critical' ? 0.45
          : profile.riskLevel === 'high' ? 0.65
          : profile.riskLevel === 'moderate' ? 0.80
          : 0.92;
        const taken = Math.random() < adherenceRate;
        const takenAt = taken
          ? `${entryDate}T${String(randInt(7, 9)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00Z`
          : null;

        await sql`
          INSERT INTO medication_adherence_logs (patient_id, patient_medication_id, entry_date, taken, taken_at)
          VALUES (${dbId}, ${medId}, ${entryDate}, ${taken}, ${takenAt})
          ON CONFLICT (patient_medication_id, entry_date) DO NOTHING
        `;
      }

      // Journal entry (20% of days)
      if (Math.random() < 0.2) {
        const body = pick(JOURNAL_BODIES);
        const shared = Math.random() < 0.3;
        await sql`
          INSERT INTO journal_entries (
            daily_entry_id, patient_id, entry_date, body, word_count,
            shared_with_clinician, shared_at
          ) VALUES (
            ${entryId}, ${dbId}, ${entryDate}, ${body}, ${body.split(' ').length},
            ${shared}, ${shared ? submittedAt : null}
          )
          ON CONFLICT DO NOTHING
        `;
      }

      // Trigger log for high/crisis patients (40% of days)
      if (['high', 'critical'].includes(profile.riskLevel) && Math.random() < 0.4) {
        const triggerList = Object.values(triggerIds);
        if (triggerList.length > 0) {
          const triggerId = pick(triggerList);
          await sql`
            INSERT INTO trigger_logs (daily_entry_id, patient_id, trigger_id, entry_date, is_active, severity)
            VALUES (${entryId}, ${dbId}, ${triggerId}, ${entryDate}, TRUE, ${randInt(4, 9)})
            ON CONFLICT DO NOTHING
          `;
        }
      }

      // Symptom log for high/crisis patients (30% of days)
      if (['high', 'critical'].includes(profile.riskLevel) && Math.random() < 0.3) {
        const nonSafetySymptoms = ['Low mood', 'Anxiety', 'Fatigue', 'Insomnia', 'Social withdrawal']
          .map((n) => symptomIds[n])
          .filter(Boolean) as string[];

        if (nonSafetySymptoms.length > 0) {
          const symptomId = pick(nonSafetySymptoms);
          await sql`
            INSERT INTO symptom_logs (daily_entry_id, patient_id, symptom_id, entry_date, is_present, intensity)
            VALUES (${entryId}, ${dbId}, ${symptomId}, ${entryDate}, TRUE, ${randInt(4, 8)})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    // ── Alerts based on profile ──────────────────────────────────────────────
    if (moodHistory.length >= 7) {
      const recentMoods = moodHistory.slice(-7);
      const avgRecent = recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
      const avgEarlier = moodHistory.slice(0, 7).reduce((a, b) => a + b, 0) / 7;

      if (avgRecent < avgEarlier - 2 || profile.riskLevel === 'critical') {
        const acknowledged = Math.random() < 0.65;
        alertsToInsert.push({
          patient_id: dbId,
          org_id: orgId,
          alert_type: 'mood_decline',
          severity: profile.riskLevel === 'critical' ? 'critical' : 'warning',
          title: ALERT_TITLES.mood_decline,
          body: ALERT_BODIES.mood_decline,
          rule_key: 'RULE-001',
          created_at: `${dateStr(randInt(3, 14))}T09:00:00Z`,
          acknowledged_by: acknowledged ? clinicianId : null,
          acknowledged_at: acknowledged ? `${dateStr(randInt(1, 3))}T10:00:00Z` : null,
        });
      }
    }

    // Missed check-in alert for inactive/crisis patients
    if (profile.status === 'inactive' || profile.checkInRate < 0.55) {
      const acknowledged = Math.random() < 0.5;
      alertsToInsert.push({
        patient_id: dbId,
        org_id: orgId,
        alert_type: 'missed_checkin',
        severity: 'warning',
        title: ALERT_TITLES.missed_checkin,
        body: ALERT_BODIES.missed_checkin,
        rule_key: 'RULE-002',
        created_at: `${dateStr(randInt(5, 20))}T09:00:00Z`,
        acknowledged_by: acknowledged ? clinicianId : null,
        acknowledged_at: acknowledged ? `${dateStr(randInt(1, 4))}T11:00:00Z` : null,
      });
    }

    // Medication non-adherence alert for high-risk patients
    if (['high', 'critical'].includes(profile.riskLevel) && Math.random() < 0.6) {
      const acknowledged = Math.random() < 0.5;
      alertsToInsert.push({
        patient_id: dbId,
        org_id: orgId,
        alert_type: 'med_nonadherence',
        severity: 'warning',
        title: ALERT_TITLES.med_nonadherence,
        body: ALERT_BODIES.med_nonadherence,
        rule_key: 'RULE-005',
        created_at: `${dateStr(randInt(2, 10))}T09:00:00Z`,
        acknowledged_by: acknowledged ? clinicianId : null,
        acknowledged_at: acknowledged ? `${dateStr(randInt(1, 2))}T14:00:00Z` : null,
      });
    }

    // Clinician notes (1-3 per patient)
    const noteCount = randInt(1, 3);
    for (let n = 0; n < noteCount; n++) {
      const noteTypes = ['observation', 'intervention', 'appointment_summary', 'risk_assessment'] as const;
      clinicianNotes.push({
        patient_id: dbId,
        clinician_id: clinicianId,
        note_type: pick([...noteTypes]),
        body: pick(NOTE_BODIES),
        linked_date: dateStr(randInt(1, 30)),
      });
    }
  }

  console.log(`  ✓ ${totalEntries} daily entries created`);

  // ── Insert alerts ──────────────────────────────────────────────────────────
  console.log('\n[7/8] Creating clinical alerts and notes...');
  for (const a of alertsToInsert) {
    await sql`
      INSERT INTO clinical_alerts (
        patient_id, organisation_id, alert_type, severity, title, body,
        rule_key, created_at, acknowledged_by, acknowledged_at
      ) VALUES (
        ${a.patient_id}, ${a.org_id}, ${a.alert_type},
        ${a.severity}, ${a.title}, ${a.body},
        ${a.rule_key}, ${a.created_at},
        ${a.acknowledged_by}, ${a.acknowledged_at}
      )
    `;
    totalAlerts++;
  }

  for (const n of clinicianNotes) {
    await sql`
      INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, linked_date)
      VALUES (${n.patient_id}, ${n.clinician_id}, ${n.note_type}, ${n.body}, ${n.linked_date})
    `;
  }

  console.log(`  ✓ ${totalAlerts} alerts, ${clinicianNotes.length} clinician notes`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n[8/8] Demo seed complete!\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEMO CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\nClinicians (password: Demo@Clinic1!)');
  for (const c of CLINICIANS) {
    console.log(`  ${c.email}`);
  }
  console.log('\nSpotlight Patients (password: Demo@Patient1!)');
  for (const p of SPOTLIGHT_PATIENTS) {
    console.log(`  ${p.email}`);
  }
  console.log('\nAll other patients also use: Demo@Patient1!');
  console.log('\n  Summary:');
  console.log(`    Patients:      ${patientDbIds.length}`);
  console.log(`    Daily entries: ${totalEntries}`);
  console.log(`    Medications:   ${totalMeds}`);
  console.log(`    Alerts:        ${totalAlerts}`);
  console.log(`    Notes:         ${clinicianNotes.length}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

seed()
  .catch((err: unknown) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
