// =============================================================================
// MindLog — Fix Clinician Auth
//
// Creates Supabase auth accounts for the 7 demo clinicians and updates their
// UUIDs in the database to match the Supabase auth IDs.
//
// Run after seed-demo.ts when clinicians exist in DB with generated UUIDs
// but without Supabase auth accounts.
//
// Usage:
//   npx tsx src/fix-clinician-auth.ts
//   (or via package.json script: npm run db:fix-clinician-auth)
// =============================================================================

import { sql, closeDb } from './client.js';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? '';
const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const CLINICIAN_PASSWORD = 'Demo@Clinic1!';

// ---------------------------------------------------------------------------
// Supabase Admin API helpers
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

  const text = await res.text();

  if (!res.ok) {
    // Already registered — look them up
    if (res.status === 422 && text.includes('already been registered')) {
      console.log(`  ℹ  ${email} already exists in Supabase auth — fetching ID`);
      return getSupabaseUserId(email);
    }
    console.warn(`  ✗ Supabase auth failed for ${email} (${res.status}): ${text}`);
    return null;
  }

  const data = JSON.parse(text) as { user?: { id?: string } };
  const id = data.user?.id ?? null;
  if (id) {
    console.log(`  ✓ Created Supabase auth user: ${email} → ${id}`);
  } else {
    console.warn(`  ✗ No ID returned for ${email}: ${text}`);
  }
  return id;
}

async function getSupabaseUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=1`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    console.warn(`  ✗ Could not look up Supabase user: ${await res.text()}`);
    return null;
  }
  const data = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  const user = data.users?.find((u) => u.email === email);
  if (!user) {
    console.warn(`  ✗ User not found in Supabase: ${email}`);
    return null;
  }
  console.log(`  ✓ Found existing Supabase user: ${email} → ${user.id}`);
  return user.id;
}

// ---------------------------------------------------------------------------
// UUID swap in a single transaction
// ---------------------------------------------------------------------------

async function swapClinicianUuid(
  oldId: string,
  newId: string,
  email: string,
): Promise<void> {
  const tmpEmail = `${email}__tmp_${Date.now()}`;

  await sql.begin(async (tx) => {
    // 1. Clone the clinician row with new UUID and temp email
    await tx`
      INSERT INTO clinicians (
        id, organisation_id, email, first_name, last_name, title, role,
        npi, department, room_number, phone, is_active, last_login_at,
        mfa_enabled, mfa_secret, session_timeout_min, created_at, updated_at
      )
      SELECT
        ${newId}::uuid, organisation_id, ${tmpEmail}, first_name, last_name, title, role,
        npi, department, room_number, phone, is_active, last_login_at,
        mfa_enabled, mfa_secret, session_timeout_min, created_at, updated_at
      FROM clinicians
      WHERE id = ${oldId}::uuid
    `;

    // 2. Update all FK references from old_id to new_id
    await tx`UPDATE patients              SET risk_reviewed_by = ${newId}::uuid        WHERE risk_reviewed_by = ${oldId}::uuid`;
    await tx`UPDATE patients              SET deactivated_by = ${newId}::uuid           WHERE deactivated_by = ${oldId}::uuid`;
    await tx`UPDATE patient_diagnoses     SET diagnosed_by = ${newId}::uuid             WHERE diagnosed_by = ${oldId}::uuid`;
    await tx`UPDATE patient_medications   SET prescribed_by = ${newId}::uuid            WHERE prescribed_by = ${oldId}::uuid`;
    await tx`UPDATE care_team_members     SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE safety_events         SET acknowledged_by = ${newId}::uuid          WHERE acknowledged_by = ${oldId}::uuid`;
    await tx`UPDATE clinical_alerts       SET acknowledged_by = ${newId}::uuid          WHERE acknowledged_by = ${oldId}::uuid`;
    await tx`UPDATE clinical_alerts       SET escalated_to = ${newId}::uuid             WHERE escalated_to = ${oldId}::uuid`;
    await tx`UPDATE alert_routing_rules   SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE clinician_notes       SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE appointments          SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE appointments          SET created_by = ${newId}::uuid               WHERE created_by = ${oldId}::uuid`;
    await tx`UPDATE clinical_reports      SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE population_snapshots  SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    await tx`UPDATE consent_records       SET granted_to_clinician_id = ${newId}::uuid  WHERE granted_to_clinician_id = ${oldId}::uuid`;
    await tx`UPDATE notification_logs     SET clinician_id = ${newId}::uuid             WHERE clinician_id = ${oldId}::uuid`;
    // clinician_notification_preferences has ON DELETE CASCADE — handled when old row is deleted
    // But we still update it in case the new insert creates a duplicate
    await tx`UPDATE clinician_notification_preferences SET clinician_id = ${newId}::uuid WHERE clinician_id = ${oldId}::uuid`;

    // 3. Delete the old clinician row (no more FK references)
    await tx`DELETE FROM clinicians WHERE id = ${oldId}::uuid`;

    // 4. Update the new row's email from temp to real
    await tx`UPDATE clinicians SET email = ${email} WHERE id = ${newId}::uuid`;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== MindLog — Fix Clinician Supabase Auth ===\n');

  // Fetch all clinicians from DB
  const clinicians = await sql<{ id: string; email: string; first_name: string; last_name: string }[]>`
    SELECT id, email, first_name, last_name
    FROM clinicians
    ORDER BY email
  `;

  if (clinicians.length === 0) {
    console.error('ERROR: No clinicians found in DB. Run demo:seed first.');
    await closeDb();
    process.exit(1);
  }

  console.log(`Found ${clinicians.length} clinician(s) in DB:\n`);
  clinicians.forEach((c) => console.log(`  • ${c.email}  (current DB id: ${c.id})`));
  console.log('');

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const clinician of clinicians) {
    console.log(`\nProcessing: ${clinician.email}`);

    // Step 1: Create / look up Supabase auth user
    const supabaseId = await createSupabaseUser(clinician.email, CLINICIAN_PASSWORD);
    if (!supabaseId) {
      console.warn(`  ✗ Skipping ${clinician.email} — could not get Supabase ID`);
      failed++;
      continue;
    }

    // Step 2: Check if DB id already matches Supabase id
    if (clinician.id === supabaseId) {
      console.log(`  ✓ Already synced — DB id matches Supabase id`);
      skipped++;
      continue;
    }

    // Step 3: Swap UUID in transaction
    console.log(`  → Swapping DB UUID: ${clinician.id} → ${supabaseId}`);
    try {
      await swapClinicianUuid(clinician.id, supabaseId, clinician.email);
      console.log(`  ✓ UUID swap complete for ${clinician.email}`);
      fixed++;
    } catch (err) {
      console.error(`  ✗ UUID swap failed for ${clinician.email}:`, err);
      failed++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Fixed:   ${fixed}`);
  console.log(`  Skipped: ${skipped} (already correct)`);
  console.log(`  Failed:  ${failed}`);
  console.log('');

  if (failed > 0) {
    console.error('Some clinicians failed. Check errors above.');
  } else {
    console.log('All clinicians now have matching Supabase auth accounts.');
    console.log('');
    console.log('Clinician login credentials:');
    clinicians.forEach((c) =>
      console.log(`  ${c.email}  /  ${CLINICIAN_PASSWORD}`),
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
