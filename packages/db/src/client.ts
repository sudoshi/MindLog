// =============================================================================
// MindLog — PostgreSQL client (postgres.js)
// =============================================================================

import postgres from 'postgres';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Shared postgres.js connection pool.
 *
 * postgres.js creates a pool of connections automatically.
 * Max connections default: 10. Adjust via DB_POOL_MAX env var.
 *
 * Usage:
 *   import { sql } from '@mindlog/db';
 *   const rows = await sql`SELECT * FROM patients WHERE id = ${id}`;
 */
export const sql = postgres(DATABASE_URL, {
  max: Number(process.env['DB_POOL_MAX'] ?? 10),
  idle_timeout: 30,
  connect_timeout: 10,
  // Prepared statements are disabled for PgBouncer transaction mode compatibility
  prepare: false,
  // Type parsers — parse PostgreSQL dates as JS strings to avoid timezone issues
  types: {
    date: {
      to: 1082,
      from: [1082],
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
  },
  onnotice: () => {
    // Suppress NOTICE messages in production
  },
});

/**
 * Set the Supabase/Postgres RLS context variables for a request.
 * Must be called at the start of each request that requires RLS enforcement.
 *
 * @param userId - The authenticated user's UUID (from JWT sub claim)
 * @param role   - The user's application role
 */
export async function setRlsContext(
  userId: string,
  role: 'patient' | 'clinician' | 'admin',
): Promise<void> {
  await sql`
    SELECT
      set_config('app.current_user_id', ${userId}, TRUE),
      set_config('app.current_user_role', ${role}, TRUE)
  `;
}

/**
 * Gracefully close all pool connections. Call during process shutdown.
 */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
