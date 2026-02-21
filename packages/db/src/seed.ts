// =============================================================================
// MindLog — Development Seed Script
// Creates a test organisation, one clinician, and two patients.
// NEVER run against production data.
// Usage: npm run db:seed (from packages/db)
// =============================================================================

import { sql, closeDb } from './client.js';

async function seed(): Promise<void> {
  console.log('MindLog — Development Seed');
  console.log('==========================');
  console.log('WARNING: This script is for local development only.\n');

  // ------------------------------------------------------------------
  // Organisation
  // ------------------------------------------------------------------
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organisations (name, type, city, state, country, timezone, locale)
    VALUES ('MindLog Demo Clinic', 'clinic', 'San Francisco', 'CA', 'US', 'America/Los_Angeles', 'en-US')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  if (!org) {
    console.log('Seed data already present. Skipping.');
    await closeDb();
    return;
  }

  const orgId = org.id;
  console.log(`✓ Organisation created: ${orgId}`);

  // ------------------------------------------------------------------
  // Clinician
  // ------------------------------------------------------------------
  const [clinician] = await sql<{ id: string }[]>`
    INSERT INTO clinicians (
      organisation_id, email, first_name, last_name, title, role, npi
    ) VALUES (
      ${orgId},
      'dr.smith@mindlogdemo.com',
      'Sarah', 'Smith', 'Dr', 'psychiatrist',
      '1234567890'
    )
    RETURNING id
  `;

  if (!clinician) {
    console.log('Clinician seed already present.');
    await closeDb();
    return;
  }

  const clinicianId = clinician.id;
  console.log(`✓ Clinician created: dr.smith@mindlogdemo.com (${clinicianId})`);

  // ------------------------------------------------------------------
  // Patients
  // ------------------------------------------------------------------
  const patients = await sql<{ id: string; first_name: string }[]>`
    INSERT INTO patients (
      organisation_id, mrn, email, first_name, last_name,
      date_of_birth, timezone, locale, status, risk_level
    ) VALUES
      (${orgId}, 'MRN-001', 'alice@mindlogdemo.com', 'Alice', 'Johnson',
       '1985-03-15', 'America/Los_Angeles', 'en-US', 'active', 'moderate'),
      (${orgId}, 'MRN-002', 'bob@mindlogdemo.com', 'Bob', 'Williams',
       '1990-07-22', 'America/Los_Angeles', 'en-US', 'active', 'high')
    RETURNING id, first_name
  `;

  console.log(`✓ Created ${patients.length} patient(s)`);

  // ------------------------------------------------------------------
  // Care team assignments
  // ------------------------------------------------------------------
  for (const patient of patients) {
    await sql`
      INSERT INTO care_team_members (patient_id, clinician_id, role)
      VALUES (${patient.id}, ${clinicianId}, 'primary')
    `;
    console.log(`  ✓ ${patient.first_name} assigned to Dr. Smith`);
  }

  // ------------------------------------------------------------------
  // Notification preferences (default)
  // ------------------------------------------------------------------
  for (const patient of patients) {
    await sql`
      INSERT INTO patient_notification_preferences (patient_id)
      VALUES (${patient.id})
    `;
  }

  console.log('\nSeed complete. Development data is ready.');
  console.log('Credentials (no passwords set — use Supabase Auth for login):');
  console.log('  Clinician: dr.smith@mindlogdemo.com');
  console.log('  Patients:  alice@mindlogdemo.com, bob@mindlogdemo.com');

  await closeDb();
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
