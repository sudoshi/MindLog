// =============================================================================
// MindLog Mobile — WatermelonDB schema
// Mirrors the server-side PostgreSQL schema for offline-first sync.
// Only tables relevant to patient self-service are included.
// =============================================================================

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // -------------------------------------------------------------------------
    // daily_entries — one per patient per day
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'daily_entries',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'patient_id', type: 'string' },
        { name: 'entry_date', type: 'string' }, // ISO date YYYY-MM-DD
        { name: 'mood_score', type: 'number', isOptional: true },
        { name: 'sleep_hours', type: 'number', isOptional: true },
        { name: 'exercise_minutes', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'is_complete', type: 'boolean' },
        { name: 'completion_pct', type: 'number' },
        { name: 'core_complete', type: 'boolean' },
        { name: 'wellness_complete', type: 'boolean' },
        { name: 'triggers_complete', type: 'boolean' },
        { name: 'symptoms_complete', type: 'boolean' },
        { name: 'journal_complete', type: 'boolean' },
        { name: 'submitted_at', type: 'string', isOptional: true },
        { name: 'synced_at', type: 'number', isOptional: true }, // ms epoch
        { name: 'is_dirty', type: 'boolean' }, // needs push to server
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // daily_entry_triggers
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'daily_entry_triggers',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'daily_entry_id', type: 'string' }, // WDB local id
        { name: 'trigger_id', type: 'string' },
        { name: 'severity', type: 'number' },
        { name: 'is_dirty', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // daily_entry_symptoms
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'daily_entry_symptoms',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'daily_entry_id', type: 'string' },
        { name: 'symptom_id', type: 'string' },
        { name: 'severity', type: 'number' },
        { name: 'is_dirty', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // daily_entry_strategies
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'daily_entry_strategies',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'daily_entry_id', type: 'string' },
        { name: 'strategy_id', type: 'string' },
        { name: 'helped', type: 'boolean' },
        { name: 'is_dirty', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // journal_entries
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'journal_entries',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'daily_entry_id', type: 'string', isOptional: true }, // WDB local id
        { name: 'patient_id', type: 'string' },
        { name: 'body', type: 'string' },
        { name: 'word_count', type: 'number' },
        { name: 'is_shared_with_care_team', type: 'boolean' },
        { name: 'created_at_iso', type: 'string' }, // keep ISO for display
        { name: 'is_dirty', type: 'boolean' },
        { name: 'synced_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // triggers — catalogue, synced read-only
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'triggers',
      columns: [
        { name: 'server_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // symptoms — catalogue, synced read-only
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'symptoms',
      columns: [
        { name: 'server_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'is_safety_symptom', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // wellness_strategies — catalogue, synced read-only
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'wellness_strategies',
      columns: [
        { name: 'server_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
