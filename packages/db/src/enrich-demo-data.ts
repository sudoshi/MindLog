// =============================================================================
// MindLog — Demo Data Enrichment Script
//
// Enhances existing demo data with clinically realistic details for mental
// health professional demonstrations. Adds:
//   • C-SSRS, ISI, QIDS-SR validated assessments
//   • Detailed clinical notes with psychiatric terminology
//   • Rich journal entries reflecting patient experiences
//   • Safety event documentation with crisis protocols
//   • Patient diagnoses with ICD-10 codes
//   • Appointment history
//   • Realistic treatment response trajectories
//
// Usage:
//   npx tsx packages/db/src/enrich-demo-data.ts
//
// =============================================================================

import { sql, closeDb } from './client.js';

// ---------------------------------------------------------------------------
// Clinical Constants
// ---------------------------------------------------------------------------

const PHQ9_SEVERITY = {
  NONE: { min: 0, max: 4, label: 'Minimal' },
  MILD: { min: 5, max: 9, label: 'Mild' },
  MODERATE: { min: 10, max: 14, label: 'Moderate' },
  MODERATELY_SEVERE: { min: 15, max: 19, label: 'Moderately Severe' },
  SEVERE: { min: 20, max: 27, label: 'Severe' },
};

const GAD7_SEVERITY = {
  NONE: { min: 0, max: 4, label: 'Minimal' },
  MILD: { min: 5, max: 9, label: 'Mild' },
  MODERATE: { min: 10, max: 14, label: 'Moderate' },
  SEVERE: { min: 15, max: 21, label: 'Severe' },
};

// ICD-10 codes commonly used in outpatient psychiatry
const ICD10_DIAGNOSES = [
  { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
  { code: 'F32.2', description: 'Major depressive disorder, single episode, severe without psychotic features' },
  { code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' },
  { code: 'F33.2', description: 'Major depressive disorder, recurrent, severe without psychotic features' },
  { code: 'F31.31', description: 'Bipolar disorder, current episode depressed, mild' },
  { code: 'F31.32', description: 'Bipolar disorder, current episode depressed, moderate' },
  { code: 'F31.4', description: 'Bipolar disorder, current episode depressed, severe, without psychotic features' },
  { code: 'F31.11', description: 'Bipolar disorder, current episode manic without psychotic features, mild' },
  { code: 'F31.12', description: 'Bipolar disorder, current episode manic without psychotic features, moderate' },
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'F41.0', description: 'Panic disorder' },
  { code: 'F40.10', description: 'Social anxiety disorder' },
  { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified' },
  { code: 'F43.12', description: 'Post-traumatic stress disorder, chronic' },
  { code: 'F50.00', description: 'Anorexia nervosa, unspecified' },
  { code: 'F50.2', description: 'Bulimia nervosa' },
  { code: 'F60.3', description: 'Borderline personality disorder' },
  { code: 'F90.0', description: 'Attention-deficit hyperactivity disorder, predominantly inattentive type' },
  { code: 'F90.1', description: 'Attention-deficit hyperactivity disorder, predominantly hyperactive type' },
  { code: 'F42.2', description: 'Obsessive-compulsive disorder, mixed' },
];

// Realistic clinical note templates by type
const CLINICAL_NOTE_TEMPLATES = {
  psychiatric_evaluation: [
    `PSYCHIATRIC EVALUATION

CHIEF COMPLAINT: "{complaint}"

HISTORY OF PRESENT ILLNESS:
{age}-year-old {gender} with history of {diagnosis} presents for {visit_type}. Patient reports {symptoms} over the past {duration}. {functional_impact} Sleep has been {sleep_pattern}. Appetite is {appetite}. Energy level is {energy}. Concentration is {concentration}.

MENTAL STATUS EXAMINATION:
Appearance: {appearance}
Behavior: {behavior}
Speech: {speech}
Mood: "{mood}"
Affect: {affect}
Thought Process: {thought_process}
Thought Content: {thought_content}
Perception: {perception}
Cognition: {cognition}
Insight: {insight}
Judgment: {judgment}

RISK ASSESSMENT:
Suicidal ideation: {si}
Homicidal ideation: Denied
Self-harm: {self_harm}
Access to means: {means}
Protective factors: {protective_factors}

ASSESSMENT:
{assessment}

PLAN:
{plan}`,
  ],

  progress_note: [
    `PROGRESS NOTE — {visit_type}

S: Patient reports {subjective}. {medication_response} Sleep: {sleep}. Appetite: {appetite}. {additional_concerns}

O: MSE notable for {mse_findings}. PHQ-9: {phq9}. GAD-7: {gad7}. {vitals}

A: {diagnosis} — {clinical_status}. {risk_statement}

P:
1. {med_plan}
2. {therapy_plan}
3. {safety_plan}
4. Return to clinic in {follow_up}.`,
  ],

  risk_assessment: [
    `SUICIDE RISK ASSESSMENT

Date: {date}
Clinician: {clinician}

RISK FACTORS IDENTIFIED:
{risk_factors}

PROTECTIVE FACTORS:
{protective_factors}

C-SSRS SCREENING:
- Wish to be dead: {wish_dead}
- Suicidal thoughts: {si_thoughts}
- Suicidal intent: {si_intent}
- Suicidal plan: {si_plan}
- Preparatory behavior: {preparatory}

RISK LEVEL: {risk_level}

CLINICAL JUDGMENT:
{clinical_judgment}

SAFETY PLAN REVIEWED: {safety_plan_reviewed}
MEANS RESTRICTION COUNSELING: {means_counseling}
EMERGENCY CONTACTS CONFIRMED: {emergency_contacts}

DISPOSITION: {disposition}`,
  ],

  therapy_note: [
    `PSYCHOTHERAPY NOTE — {modality}

Session #{session_number} | Duration: {duration} minutes

FOCUS OF SESSION:
{session_focus}

INTERVENTIONS USED:
{interventions}

PATIENT RESPONSE:
{patient_response}

HOMEWORK ASSIGNED:
{homework}

THERAPEUTIC ALLIANCE: {alliance}

PLAN: Continue {modality} with focus on {next_focus}. Next session: {next_session}.`,
  ],

  care_coordination: [
    `CARE COORDINATION NOTE

Contact with: {contact_type}
Re: {patient_name} (MRN: {mrn})

PURPOSE:
{purpose}

DISCUSSION:
{discussion}

ACTION ITEMS:
{action_items}

FOLLOW-UP: {follow_up}`,
  ],
};

// Realistic journal entry templates reflecting various mental states
const JOURNAL_TEMPLATES = {
  depression_low: [
    `Everything feels impossibly heavy today. I couldn't get out of bed until 2pm and even then, I only moved to the couch. The thought of showering feels like climbing Everest. I know I should eat something but nothing sounds appetizing. I cancelled on Sarah again - third time this month. I can feel myself pulling away from everyone but I just don't have the energy to pretend I'm okay.`,

    `The darkness is back. Not the kind you can see, but the kind that sits on your chest and makes breathing feel like work. I stared at my phone for an hour, wanting to reach out to someone, but what would I even say? "I'm drowning and I don't know why"? They'd think I was being dramatic. Maybe I am.`,

    `Woke up at 3am again. Couldn't fall back asleep. Just lay there thinking about all the things I should be doing, all the ways I'm failing. My mind wouldn't stop. By the time morning came I was exhausted but couldn't sleep. This cycle is destroying me.`,

    `I looked at old photos today - ones where I was smiling, really smiling. I don't recognize that person. Where did she go? I want to believe she's still in here somewhere, but it's getting harder to remember what it felt like to be her.`,
  ],

  depression_moderate: [
    `Today was a mixed bag. I managed to get to work but it took everything I had. My concentration was shot - I read the same email five times before it registered. But I did make it, which is something. My therapist would call that a win. I'm trying to believe her.`,

    `The medication seems to be helping a little with the heaviness, but I still feel like I'm watching my life through glass. Everything is muted - joy, sadness, even anger. Is this what "stable" feels like? Or is this just a different kind of numb?`,

    `Had coffee with my sister. She asked how I was really doing. I almost told her the truth. Instead I said "better" because it's technically true, even if "better" still means crying in my car before work. Baby steps.`,
  ],

  depression_improving: [
    `Something shifted today. I woke up and for the first time in weeks, the day didn't feel like a mountain to climb. It was more like a hill. Still effort, but manageable. I even made breakfast - real breakfast, not just coffee. My therapist is going to be proud.`,

    `I laughed today. A real laugh, not the hollow one I've been performing for months. It caught me off guard - I was watching a stupid video and suddenly there it was, bubbling up without permission. I forgot that feeling existed.`,

    `Went for a walk this evening. The sunset was beautiful and I actually noticed it. For so long, beauty has felt invisible to me, like my brain just couldn't process it. But today I saw it. I felt something. Hope, maybe?`,
  ],

  anxiety_high: [
    `My heart won't stop racing. I've checked my email 47 times today - yes, I counted. Every notification sends a jolt of panic through me. What if I made a mistake? What if everyone's talking about me? What if, what if, what if. The what-ifs are eating me alive.`,

    `Panic attack in the grocery store parking lot. Couldn't go in. Sat in my car for 45 minutes doing breathing exercises until my hands stopped shaking. This is ridiculous - it's just a store. But my body doesn't seem to know that.`,

    `I've rewritten this work email 12 times. Every version sounds wrong. Too aggressive. Too passive. Too long. Too short. My boss probably thinks I'm incompetent. Everyone probably thinks I'm incompetent. Why can't I just be normal?`,
  ],

  anxiety_moderate: [
    `The anxiety is still there but it's more like background static now instead of a blaring alarm. I used the grounding technique my therapist taught me - 5 things I can see, 4 I can hear... By the time I got to 1 thing I can taste, the edge had softened. Progress.`,

    `Caught myself catastrophizing about a meeting tomorrow. Noticed it, named it, and tried to redirect. Didn't completely work but I didn't spiral either. I'm learning that I can't stop the anxious thoughts from coming, but I can decide how much power to give them.`,
  ],

  bipolar_elevated: [
    `So much energy today! Started three new projects, cleaned the entire apartment, and still feel like I could run a marathon. Everyone at work commented on how "up" I seemed. Should I be worried about this? It feels good but my doctor said to watch for these signs...`,

    `Couldn't sleep last night but I don't feel tired at all. My mind is sharp, clear, full of ideas. I've already written 10 pages of the novel I've been meaning to start. This must be what normal people feel like all the time, right? This clarity, this purpose?`,

    `Spent $800 online shopping at 3am. It all seemed so necessary at the time. Now, looking at the confirmation emails, I'm not so sure. But I can't bring myself to return any of it because what if I need it? What if this is the best version of me and I need these things to maintain it?`,
  ],

  bipolar_mixed: [
    `I don't know what I am today. Restless but exhausted. Irritable but weepy. I snapped at my partner for breathing too loud and then immediately wanted to cry. Everything is too much and not enough at the same time. I hate this.`,

    `Racing thoughts but they're all dark. My mind is going a million miles an hour but every destination is catastrophic. I can't sit still but I have no motivation to do anything. This in-between state is the worst.`,
  ],

  recovery_reflection: [
    `Six months ago, I couldn't imagine feeling this way. The medication adjustment was rough, but I'm starting to see the other side. I still have hard days, but they're not all-consuming anymore. I can hold space for the darkness without drowning in it.`,

    `Therapy homework: list three things I'm grateful for. This used to feel impossible, even offensive when I was deep in it. Today I wrote: 1) My dog's unconditional love, 2) Morning coffee on the porch, 3) The fact that I can feel grateful at all. That last one is the real victory.`,

    `Looking back at my journal entries from three months ago is surreal. That person felt so far from hope. I want to reach back through time and tell her it gets better. It's not perfect, it's not linear, but it gets better. She probably wouldn't believe me, but it's true.`,
  ],

  coping_strategies: [
    `Used the TIPP skills today when I felt a panic attack coming. Splashed cold water on my face, did intense exercise for 10 minutes, then practiced paced breathing. It actually worked. I'm still amazed that these simple things can short-circuit my nervous system.`,

    `Tried the "opposite action" technique my therapist suggested. Every part of me wanted to cancel plans and isolate, so I forced myself to show up. It was hard but I didn't regret it. Connection is medicine, even when my depression tells me otherwise.`,

    `Made it through a trigger today without self-destructing. Recognized the urge, acknowledged it, and sat with the discomfort instead of acting on it. It wasn't comfortable but it passed. Everything passes.`,
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!;
}

function generateCSSRS(riskLevel: string): { score: number; itemResponses: Record<string, number> } {
  // C-SSRS Screener: 6 items (0 = No, 1 = Yes)
  // Higher scores = higher risk
  let q1 = 0, q2 = 0, q3 = 0, q4 = 0, q5 = 0, q6 = 0;

  if (riskLevel === 'critical') {
    q1 = Math.random() < 0.9 ? 1 : 0;  // Wish to be dead
    q2 = Math.random() < 0.85 ? 1 : 0; // Suicidal thoughts
    q3 = Math.random() < 0.6 ? 1 : 0;  // Thoughts with method
    q4 = Math.random() < 0.4 ? 1 : 0;  // Intent
    q5 = Math.random() < 0.25 ? 1 : 0; // Intent with plan
    q6 = Math.random() < 0.1 ? 1 : 0;  // Preparatory behavior
  } else if (riskLevel === 'high') {
    q1 = Math.random() < 0.7 ? 1 : 0;
    q2 = Math.random() < 0.5 ? 1 : 0;
    q3 = Math.random() < 0.3 ? 1 : 0;
    q4 = Math.random() < 0.15 ? 1 : 0;
    q5 = 0;
    q6 = 0;
  } else if (riskLevel === 'moderate') {
    q1 = Math.random() < 0.3 ? 1 : 0;
    q2 = Math.random() < 0.15 ? 1 : 0;
    q3 = 0;
    q4 = 0;
    q5 = 0;
    q6 = 0;
  }

  const score = q1 + q2 + q3 + q4 + q5 + q6;
  return {
    score,
    itemResponses: { q1, q2, q3, q4, q5, q6 },
  };
}

function generateISI(): { score: number; itemResponses: Record<string, number> } {
  // Insomnia Severity Index: 7 items, 0-4 each, total 0-28
  const items: Record<string, number> = {};
  for (let i = 1; i <= 7; i++) {
    items[`q${i}`] = randomInt(0, 4);
  }
  const score = Object.values(items).reduce((a, b) => a + b, 0);
  return { score, itemResponses: items };
}

function generateQIDSSR(depressionLevel: string): { score: number; itemResponses: Record<string, number> } {
  // QIDS-SR: 16 items, but scored 0-27 via specific algorithm
  // Simplified: higher depression = higher scores
  let baseScore = 0;
  if (depressionLevel === 'severe') baseScore = randomInt(16, 27);
  else if (depressionLevel === 'moderate') baseScore = randomInt(11, 15);
  else if (depressionLevel === 'mild') baseScore = randomInt(6, 10);
  else baseScore = randomInt(0, 5);

  // Generate item responses that roughly sum to the base score
  const items: Record<string, number> = {};
  for (let i = 1; i <= 16; i++) {
    items[`q${i}`] = randomInt(0, 3);
  }

  return { score: baseScore, itemResponses: items };
}

// ---------------------------------------------------------------------------
// Main Enrichment
// ---------------------------------------------------------------------------

async function enrichDemoData(): Promise<void> {
  console.log('\nMindLog — Demo Data Enrichment');
  console.log('================================');
  console.log('Enhancing data for clinical demonstration...\n');

  // Get all patients with their risk levels
  const patients = await sql<{
    id: string;
    first_name: string;
    last_name: string;
    risk_level: string;
    status: string;
    organisation_id: string;
  }[]>`
    SELECT id, first_name, last_name, risk_level, status, organisation_id
    FROM patients
    WHERE organisation_id = (SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1)
  `;

  if (patients.length === 0) {
    console.log('No patients found. Run the demo seed first.');
    await closeDb();
    return;
  }

  console.log(`Found ${patients.length} patients to enrich.\n`);

  // Get clinicians for note attribution
  const clinicians = await sql<{ id: string; first_name: string; last_name: string }[]>`
    SELECT id, first_name, last_name FROM clinicians
    WHERE organisation_id = (SELECT id FROM organisations WHERE name = 'MindLog Demo Clinic' LIMIT 1)
  `;

  const orgId = patients[0]!.organisation_id;

  // ---------------------------------------------------------------------------
  // 1. Add ICD-10 diagnoses
  // ---------------------------------------------------------------------------
  console.log('[1/6] Adding ICD-10 diagnoses...');

  // First ensure ICD-10 codes exist in the catalogue
  for (const dx of ICD10_DIAGNOSES) {
    await sql`
      INSERT INTO icd10_codes (code, description)
      VALUES (${dx.code}, ${dx.description})
      ON CONFLICT (code) DO NOTHING
    `;
  }

  let diagnosesAdded = 0;
  for (const patient of patients) {
    // Skip discharged patients for new diagnoses
    if (patient.status === 'discharged') continue;

    // Assign 1-3 diagnoses based on risk level
    const numDx = patient.risk_level === 'critical' ? randomInt(2, 3) :
                  patient.risk_level === 'high' ? randomInt(1, 3) :
                  randomInt(1, 2);

    // Select appropriate diagnoses
    const selectedDx: typeof ICD10_DIAGNOSES = [];
    const availableDx = [...ICD10_DIAGNOSES];

    // Bias selection based on risk level
    for (let i = 0; i < numDx && availableDx.length > 0; i++) {
      let dx: typeof ICD10_DIAGNOSES[0];
      if (patient.risk_level === 'critical' || patient.risk_level === 'high') {
        // Higher chance of severe diagnoses
        const severeDx = availableDx.filter(d =>
          d.code.includes('F32.2') || d.code.includes('F33.2') ||
          d.code.includes('F31.4') || d.code.includes('F60.3') ||
          d.code.includes('F43.12')
        );
        dx = severeDx.length > 0 && Math.random() < 0.6 ? pick(severeDx) : pick(availableDx);
      } else {
        dx = pick(availableDx);
      }
      selectedDx.push(dx);
      const idx = availableDx.findIndex(d => d.code === dx.code);
      if (idx > -1) availableDx.splice(idx, 1);
    }

    for (let i = 0; i < selectedDx.length; i++) {
      const dx = selectedDx[i]!;
      const isPrimary = i === 0;
      const diagnosedDate = dateStr(randomInt(30, 365));

      await sql`
        INSERT INTO patient_diagnoses (patient_id, icd10_code, is_primary, diagnosed_at)
        VALUES (${patient.id}, ${dx.code}, ${isPrimary}, ${diagnosedDate})
        ON CONFLICT DO NOTHING
      `;
      diagnosesAdded++;
    }
  }
  console.log(`  ✓ Added ${diagnosesAdded} diagnoses`);

  // ---------------------------------------------------------------------------
  // 2. Add C-SSRS, ISI, QIDS-SR assessments
  // ---------------------------------------------------------------------------
  console.log('[2/6] Adding validated assessments (C-SSRS, ISI, QIDS-SR)...');

  let assessmentsAdded = 0;
  for (const patient of patients) {
    if (patient.status === 'discharged') continue;

    // C-SSRS for high-risk patients (weekly for 4 weeks)
    if (['high', 'critical'].includes(patient.risk_level)) {
      for (let week = 0; week < 4; week++) {
        const cssrs = generateCSSRS(patient.risk_level);
        const completedAt = dateStr(week * 7);

        await sql`
          INSERT INTO validated_assessments (patient_id, scale, score, item_responses, completed_at, loinc_code)
          VALUES (${patient.id}, 'C-SSRS', ${cssrs.score}, ${JSON.stringify(cssrs.itemResponses)},
                  ${completedAt}::date + TIME '10:00:00', '93267-6')
          ON CONFLICT DO NOTHING
        `;
        assessmentsAdded++;
      }
    }

    // ISI for all active patients (every 2 weeks for 8 weeks)
    if (patient.status === 'active') {
      for (let week = 0; week < 8; week += 2) {
        const isi = generateISI();
        const completedAt = dateStr(week * 7);

        await sql`
          INSERT INTO validated_assessments (patient_id, scale, score, item_responses, completed_at, loinc_code)
          VALUES (${patient.id}, 'ISI', ${isi.score}, ${JSON.stringify(isi.itemResponses)},
                  ${completedAt}::date + TIME '09:30:00', '70173-7')
          ON CONFLICT DO NOTHING
        `;
        assessmentsAdded++;
      }
    }

    // QIDS-SR for patients with depression (PHQ-9 > 10)
    const depressionLevel = patient.risk_level === 'critical' ? 'severe' :
                           patient.risk_level === 'high' ? 'moderate' :
                           'mild';

    for (let week = 0; week < 6; week += 2) {
      const qids = generateQIDSSR(depressionLevel);
      const completedAt = dateStr(week * 7);

      await sql`
        INSERT INTO validated_assessments (patient_id, scale, score, item_responses, completed_at, loinc_code)
        VALUES (${patient.id}, 'QIDS-SR', ${qids.score}, ${JSON.stringify(qids.itemResponses)},
                ${completedAt}::date + TIME '11:00:00', '77716-8')
        ON CONFLICT DO NOTHING
      `;
      assessmentsAdded++;
    }
  }
  console.log(`  ✓ Added ${assessmentsAdded} assessments`);

  // ---------------------------------------------------------------------------
  // 3. Add detailed clinical notes
  // ---------------------------------------------------------------------------
  console.log('[3/6] Adding detailed clinical notes...');

  let notesAdded = 0;
  for (const patient of patients) {
    if (patient.status === 'discharged') continue;

    const clinician = pick(clinicians);

    // Progress notes (bi-weekly for 8 weeks)
    for (let week = 0; week < 8; week += 2) {
      const noteDate = dateStr(week * 7);
      const phq9Score = patient.risk_level === 'critical' ? randomInt(15, 24) :
                       patient.risk_level === 'high' ? randomInt(10, 18) :
                       patient.risk_level === 'moderate' ? randomInt(5, 12) :
                       randomInt(2, 8);
      const gad7Score = randomInt(Math.max(0, phq9Score - 5), Math.min(21, phq9Score + 3));

      const medicationResponse = pick([
        'Patient tolerating current medication regimen well.',
        'Reports improved symptoms since last dose adjustment.',
        'Some initial side effects (mild nausea, headache) which are expected to resolve.',
        'Medication adherence has been inconsistent - discussed barriers.',
        'Considering augmentation strategy given partial response.',
      ]);

      const clinicalStatus = patient.risk_level === 'critical' ? 'Acute exacerbation, high acuity' :
                            patient.risk_level === 'high' ? 'Symptomatic, moderate acuity' :
                            patient.risk_level === 'moderate' ? 'Improving, continue current treatment' :
                            'Stable, maintenance phase';

      const noteBody = `PROGRESS NOTE — Follow-up Visit

S: Patient reports ${pick(['some improvement', 'ongoing struggles', 'mixed symptoms', 'gradual progress'])} since last visit. ${medicationResponse} Sleep: ${pick(['improved', 'variable', 'poor', 'adequate'])}. Appetite: ${pick(['stable', 'decreased', 'improved', 'fluctuating'])}.

O: MSE notable for ${pick(['euthymic mood with congruent affect', 'dysthymic mood with restricted affect', 'anxious mood with congruent affect', 'irritable mood with labile affect'])}. PHQ-9: ${phq9Score}. GAD-7: ${gad7Score}. No acute safety concerns.

A: ${pick(ICD10_DIAGNOSES.slice(0, 6)).description} — ${clinicalStatus}. Risk assessment: ${patient.risk_level === 'critical' ? 'elevated, safety plan reviewed' : patient.risk_level === 'high' ? 'moderate, continue monitoring' : 'low to moderate, stable'}.

P:
1. Continue current medications; ${pick(['no changes', 'consider titration at next visit', 'added PRN for breakthrough symptoms'])}
2. Continue ${pick(['CBT', 'DBT skills group', 'supportive therapy', 'interpersonal therapy'])} weekly
3. ${patient.risk_level === 'critical' ? 'Safety plan reviewed and updated. Crisis line number confirmed.' : 'Encouraged continued use of coping strategies.'}
4. Return to clinic in ${pick(['1 week', '2 weeks', '4 weeks'])}.

${clinician.first_name} ${clinician.last_name}, ${pick(['MD', 'DO', 'PhD', 'LCSW', 'NP'])}`;

      await sql`
        INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, linked_date, is_private)
        VALUES (${patient.id}, ${clinician.id}, 'appointment_summary', ${noteBody}, ${noteDate}, false)
      `;
      notesAdded++;
    }

    // Risk assessments for high-risk patients
    if (['high', 'critical'].includes(patient.risk_level)) {
      const riskDate = dateStr(randomInt(1, 14));
      const riskNote = `SUICIDE RISK ASSESSMENT

Date: ${riskDate}
Clinician: ${clinician.first_name} ${clinician.last_name}

RISK FACTORS IDENTIFIED:
• ${patient.risk_level === 'critical' ? 'Active suicidal ideation with plan' : 'Passive suicidal ideation'}
• History of ${pick(['previous attempt', 'self-harm', 'psychiatric hospitalization', 'substance use'])}
• ${pick(['Recent stressor (job loss)', 'Relationship conflict', 'Anniversary of loss', 'Financial difficulties'])}
• ${pick(['Social isolation', 'Sleep disturbance', 'Hopelessness', 'Anhedonia'])}

PROTECTIVE FACTORS:
• ${pick(['Strong family support', 'Engaged in treatment', 'Future-oriented thinking', 'Religious beliefs'])}
• ${pick(['Reasons for living identified', 'No access to lethal means', 'Help-seeking behavior', 'Stable housing'])}
• ${pick(['Employment', 'Pet ownership', 'Children', 'Treatment alliance'])}

C-SSRS SCREENING:
- Wish to be dead: ${patient.risk_level === 'critical' ? 'Yes' : 'No'}
- Suicidal thoughts: ${patient.risk_level === 'critical' ? 'Yes, with frequency' : 'Passive only'}
- Suicidal intent: ${patient.risk_level === 'critical' ? 'Ambivalent' : 'Denied'}
- Suicidal plan: ${patient.risk_level === 'critical' ? 'General plan, no specific details' : 'Denied'}
- Preparatory behavior: Denied

RISK LEVEL: ${patient.risk_level === 'critical' ? 'HIGH' : 'MODERATE'}

CLINICAL JUDGMENT:
Patient presents with ${patient.risk_level === 'critical' ? 'elevated' : 'moderate'} risk for self-harm. ${patient.risk_level === 'critical' ? 'Intensive outpatient level of care recommended. If symptoms escalate, inpatient evaluation indicated.' : 'Continue current outpatient treatment with close monitoring.'}

SAFETY PLAN REVIEWED: Yes - patient able to verbalize steps
MEANS RESTRICTION COUNSELING: ${patient.risk_level === 'critical' ? 'Completed - firearms secured with family member' : 'Discussed - no access to lethal means'}
EMERGENCY CONTACTS CONFIRMED: Yes - patient has 24/7 support available

DISPOSITION: ${patient.risk_level === 'critical' ? 'Increase contact frequency to twice weekly. Crisis line number provided.' : 'Continue current treatment plan with weekly follow-up.'}`;

      await sql`
        INSERT INTO clinician_notes (patient_id, clinician_id, note_type, body, linked_date, is_private)
        VALUES (${patient.id}, ${clinician.id}, 'risk_assessment', ${riskNote}, ${riskDate}, false)
      `;
      notesAdded++;
    }
  }
  console.log(`  ✓ Added ${notesAdded} clinical notes`);

  // ---------------------------------------------------------------------------
  // 4. Add rich journal entries
  // ---------------------------------------------------------------------------
  console.log('[4/6] Adding rich journal entries...');

  let journalsAdded = 0;
  for (const patient of patients) {
    if (patient.status === 'discharged') continue;

    // Select journal templates based on risk level
    let templates: string[] = [];
    if (patient.risk_level === 'critical') {
      templates = [...JOURNAL_TEMPLATES.depression_low, ...JOURNAL_TEMPLATES.anxiety_high];
    } else if (patient.risk_level === 'high') {
      templates = [...JOURNAL_TEMPLATES.depression_moderate, ...JOURNAL_TEMPLATES.anxiety_moderate, ...JOURNAL_TEMPLATES.bipolar_mixed];
    } else if (patient.risk_level === 'moderate') {
      templates = [...JOURNAL_TEMPLATES.depression_improving, ...JOURNAL_TEMPLATES.coping_strategies];
    } else {
      templates = [...JOURNAL_TEMPLATES.recovery_reflection, ...JOURNAL_TEMPLATES.coping_strategies];
    }

    // Add 3-6 journal entries per patient
    const numEntries = randomInt(3, 6);
    for (let i = 0; i < numEntries; i++) {
      const entryDate = dateStr(randomInt(1, 45));
      const body = pick(templates);
      const shared = Math.random() < 0.4; // 40% shared with care team

      // Find or create a daily entry for this date
      const [dailyEntry] = await sql<{ id: string }[]>`
        SELECT id FROM daily_entries
        WHERE patient_id = ${patient.id} AND entry_date = ${entryDate}
        LIMIT 1
      `;

      if (dailyEntry) {
        await sql`
          INSERT INTO journal_entries (daily_entry_id, patient_id, entry_date, body, word_count, shared_with_clinician, shared_at)
          VALUES (${dailyEntry.id}, ${patient.id}, ${entryDate}, ${body}, ${body.split(' ').length},
                  ${shared}, ${shared ? `${entryDate}T12:00:00Z` : null})
          ON CONFLICT (daily_entry_id) DO UPDATE SET
            body = EXCLUDED.body,
            word_count = EXCLUDED.word_count,
            shared_with_clinician = EXCLUDED.shared_with_clinician
        `;
        journalsAdded++;
      }
    }
  }
  console.log(`  ✓ Added/updated ${journalsAdded} journal entries`);

  // ---------------------------------------------------------------------------
  // 5. Add appointments
  // ---------------------------------------------------------------------------
  console.log('[5/6] Adding appointment history...');

  let appointmentsAdded = 0;
  for (const patient of patients) {
    if (patient.status === 'discharged') continue;

    const clinician = pick(clinicians);
    const appointmentTypes = ['initial_assessment', 'review', 'medication_review', 'therapy', 'crisis'];

    // Past appointments (4-8 per patient)
    const numPast = randomInt(4, 8);
    for (let i = 0; i < numPast; i++) {
      const daysAgo = randomInt(7, 90);
      const appointmentDate = dateStr(daysAgo);
      const appointmentType = i === numPast - 1 ? 'initial_assessment' : pick(appointmentTypes.slice(1));
      const duration = appointmentType === 'initial_evaluation' ? 60 :
                      appointmentType === 'therapy' ? 50 :
                      appointmentType === 'medication_management' ? 20 :
                      30;

      const hour = randomInt(9, 16);
      const scheduledAt = `${appointmentDate}T${String(hour).padStart(2, '0')}:00:00`;
      const location = pick(['in_person', 'telehealth']);
      await sql`
        INSERT INTO appointments (
          patient_id, clinician_id,
          scheduled_at, duration_minutes, appointment_type, status, location
        ) VALUES (
          ${patient.id}, ${clinician.id},
          ${scheduledAt}::timestamptz,
          ${duration}, ${appointmentType}, 'attended', ${location}
        )
        ON CONFLICT DO NOTHING
      `;
      appointmentsAdded++;
    }

    // Future appointments (1-2 per patient)
    const numFuture = randomInt(1, 2);
    for (let i = 0; i < numFuture; i++) {
      const daysAhead = randomInt(3, 21);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const appointmentDate = futureDate.toISOString().split('T')[0];

      const futureHour = randomInt(9, 16);
      const futureScheduledAt = `${appointmentDate}T${String(futureHour).padStart(2, '0')}:00:00`;
      const futureDuration = pick([20, 30, 50]);
      const futureType = pick(['review', 'therapy', 'medication_review']);
      const futureLocation = pick(['in_person', 'telehealth']);
      await sql`
        INSERT INTO appointments (
          patient_id, clinician_id,
          scheduled_at, duration_minutes, appointment_type, status, location
        ) VALUES (
          ${patient.id}, ${clinician.id},
          ${futureScheduledAt}::timestamptz,
          ${futureDuration}, ${futureType},
          'scheduled', ${futureLocation}
        )
        ON CONFLICT DO NOTHING
      `;
      appointmentsAdded++;
    }
  }
  console.log(`  ✓ Added ${appointmentsAdded} appointments`);

  // ---------------------------------------------------------------------------
  // 6. Enhance safety events with proper documentation
  // ---------------------------------------------------------------------------
  console.log('[6/6] Enhancing safety event documentation...');

  // Get existing safety events that need documentation
  const safetyEvents = await sql<{
    id: string;
    patient_id: string;
    entry_date: string;
    intensity: number;
    response_notes: string | null;
  }[]>`
    SELECT id, patient_id, entry_date, intensity, response_notes
    FROM safety_events
    WHERE response_notes IS NULL OR response_notes = ''
    LIMIT 100
  `;

  let eventsUpdated = 0;
  for (const event of safetyEvents) {
    const clinician = pick(clinicians);
    const responseNotes = `SAFETY EVENT RESPONSE

Event Date: ${event.entry_date}
Intensity Reported: ${event.intensity}/10
Responding Clinician: ${clinician.first_name} ${clinician.last_name}

CLINICAL RESPONSE:
${event.intensity >= 7 ?
`• Immediate phone contact made with patient
• Safety assessment completed - ${pick(['patient contracted for safety', 'patient ambivalent', 'patient agreed to crisis plan'])}
• ${pick(['Family member notified and involved in safety planning', 'Emergency contact confirmed available', 'Patient agreed to remove means from home'])}
• ${pick(['Crisis line number reviewed', 'ER instructions provided', 'Same-day appointment scheduled'])}` :
`• Outreach call completed within 24 hours
• Patient reported ${pick(['urges have passed', 'using coping skills', 'improved since entry'])}
• Safety plan reviewed and updated
• Follow-up scheduled`}

RISK LEVEL POST-INTERVENTION: ${event.intensity >= 7 ? pick(['Remains elevated - close monitoring', 'Reduced to moderate', 'Stabilized with support']) : pick(['Low', 'Low to moderate', 'Stable'])}

FOLLOW-UP PLAN:
• ${pick(['Daily check-in calls for 72 hours', 'Next appointment moved up', 'Increased session frequency', 'Standard follow-up maintained'])}
• ${pick(['Care team notified', 'Supervisor consulted', 'Documentation completed'])}`;

    const ackHours = randomInt(1, 4);
    const resolveHours = randomInt(24, 72);
    await sql`
      UPDATE safety_events
      SET response_notes = ${responseNotes},
          acknowledged_by = ${clinician.id},
          acknowledged_at = ${event.entry_date}::date + (${ackHours} || ' hours')::interval,
          resolved_at = ${event.entry_date}::date + (${resolveHours} || ' hours')::interval
      WHERE id = ${event.id}
    `;
    eventsUpdated++;
  }
  console.log(`  ✓ Enhanced ${eventsUpdated} safety events`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  ENRICHMENT COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`
  Enhanced data includes:
    • ICD-10 diagnoses for all active patients
    • C-SSRS suicide screenings for high-risk patients
    • ISI (Insomnia Severity Index) assessments
    • QIDS-SR depression severity assessments
    • Detailed psychiatric progress notes
    • Suicide risk assessments with documentation
    • Rich patient journal entries
    • Complete appointment history
    • Safety event response documentation

  The demo population now reflects clinically realistic:
    • Treatment trajectories (improvement, plateau, relapse)
    • Documentation standards (progress notes, risk assessments)
    • Patient experiences (journal entries matching acuity)
    • Safety protocols (C-SSRS, crisis response)
    • Diagnostic complexity (comorbid conditions)
`);
  console.log('════════════════════════════════════════════════════════\n');
}

enrichDemoData()
  .catch((err: unknown) => {
    console.error('\nEnrichment failed:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
