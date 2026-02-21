// =============================================================================
// MindLog Mobile — WatermelonDB ↔ API sync engine
// Uses Watermelon's synchronize() helper with a custom pull/push protocol
// that maps to the /api/v1/sync endpoint on the Fastify server.
//
// Pull:  server sends all changed rows since lastPulledAt
// Push:  client sends locally-dirty records to server
// =============================================================================

import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { apiFetch } from '../services/auth';

export interface SyncResult {
  success: boolean;
  pullCount: number;
  pushCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pull response shape (server → client)
// ---------------------------------------------------------------------------

interface SyncPullChanges {
  daily_entries: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  journal_entries: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  triggers: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  symptoms: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  wellness_strategies: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  daily_entry_triggers: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  daily_entry_symptoms: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
  daily_entry_strategies: {
    created: SyncRow[];
    updated: SyncRow[];
    deleted: string[];
  };
}

interface SyncRow {
  id: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main sync function — call from UI to trigger a full sync cycle
// ---------------------------------------------------------------------------

export async function syncDatabase(): Promise<SyncResult> {
  let pullCount = 0;
  let pushCount = 0;

  try {
    await synchronize({
      database,

      // -----------------------------------------------------------------------
      // PULL — fetch server changes since lastPulledAt
      // -----------------------------------------------------------------------
      pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
        const params = new URLSearchParams({
          last_pulled_at: lastPulledAt ? String(lastPulledAt) : '0',
          schema_version: String(schemaVersion),
          migration: migration ? JSON.stringify(migration) : 'null',
        });

        const res = await apiFetch(`/sync/pull?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Sync pull failed: HTTP ${res.status}`);
        }

        const json = (await res.json()) as {
          success: boolean;
          data: { changes: SyncPullChanges; timestamp: number };
        };

        if (!json.success) throw new Error('Sync pull error from server');

        // Count incoming rows for reporting
        for (const table of Object.values(json.data.changes)) {
          pullCount += table.created.length + table.updated.length + table.deleted.length;
        }

        return {
          changes: json.data.changes,
          timestamp: json.data.timestamp,
        };
      },

      // -----------------------------------------------------------------------
      // PUSH — send locally dirty records to server
      // -----------------------------------------------------------------------
      pushChanges: async ({ changes, lastPulledAt }) => {
        // Count outgoing rows
        for (const table of Object.values(changes)) {
          const t = table as { created: unknown[]; updated: unknown[]; deleted: unknown[] };
          pushCount += t.created.length + t.updated.length + t.deleted.length;
        }

        if (pushCount === 0) return; // nothing to push

        const res = await apiFetch('/sync/push', {
          method: 'POST',
          body: JSON.stringify({ changes, last_pulled_at: lastPulledAt }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Sync push failed: HTTP ${res.status} — ${text}`);
        }

        const json = (await res.json()) as { success: boolean; error?: { message: string } };
        if (!json.success) {
          throw new Error(json.error?.message ?? 'Sync push rejected by server');
        }
      },

      // Don't mark as migrated until we actually run migrations
      migrationsEnabledAtVersion: 1,
    });

    return { success: true, pullCount, pushCount };
  } catch (err) {
    return {
      success: false,
      pullCount,
      pushCount,
      error: err instanceof Error ? err.message : 'Unknown sync error',
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience: sync silently in background (fire-and-forget safe)
// ---------------------------------------------------------------------------

export function backgroundSync(): void {
  void syncDatabase().then((result) => {
    if (!result.success) {
      console.warn('[Sync] Background sync failed:', result.error);
    }
  });
}
