// =============================================================================
// MindLog Mobile — useTodayEntry hook
// Phase 2: reads from local WatermelonDB, falls back to API if empty.
// =============================================================================

import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database, DailyEntry } from '../db/index';
import { apiFetch } from '../services/auth';
import { getStoredUser } from '../services/auth';

export interface TodayEntry {
  id: string;
  entry_date: string;
  mood: number | null;
  coping: number | null;
  completion_pct: number;
  submitted_at: string | null;
  core_complete: boolean;
  wellness_complete: boolean;
  triggers_complete: boolean;
  symptoms_complete: boolean;
  journal_complete: boolean;
}

function dbRowToEntry(row: DailyEntry): TodayEntry {
  return {
    id: row.id,
    entry_date: row.entryDate,
    mood: row.moodScore ?? null,
    coping: null, // not stored separately on client
    completion_pct: row.completionPct,
    submitted_at: row.submittedAt ?? null,
    core_complete: row.coreComplete,
    wellness_complete: row.wellnessComplete,
    triggers_complete: row.triggersComplete,
    symptoms_complete: row.symptomsComplete,
    journal_complete: row.journalComplete,
  };
}

export function useTodayEntry(): { entry: TodayEntry | null; loading: boolean; error: string | null; refresh: () => void } {
  const [entry, setEntry] = useState<TodayEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().split('T')[0]!;

    const fetchToday = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Try local WatermelonDB first
        const user = await getStoredUser();
        if (user) {
          const localRows = await database
            .get<DailyEntry>('daily_entries')
            .query(
              Q.where('patient_id', user.id),
              Q.where('entry_date', today),
            )
            .fetch();

          if (localRows.length > 0 && !cancelled) {
            setEntry(dbRowToEntry(localRows[0]!));
            setLoading(false);
            // Still fetch from API in background to ensure freshness
          }
        }

        // 2. Fetch from API (authoritative)
        const res = await apiFetch('/daily-entries/today');

        if (res.status === 404) {
          if (!cancelled) {
            setEntry(null);
            setLoading(false);
          }
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as {
          success: boolean;
          data: {
            id: string;
            entry_date: string;
            mood_score: number | null;
            completion_pct: number;
            submitted_at: string | null;
            core_complete: boolean;
            wellness_complete: boolean;
            triggers_complete: boolean;
            symptoms_complete: boolean;
            journal_complete: boolean;
          };
        };

        if (!cancelled && json.success) {
          const d = json.data;
          setEntry({
            id: d.id,
            entry_date: d.entry_date,
            mood: d.mood_score,
            coping: null,
            completion_pct: d.completion_pct,
            submitted_at: d.submitted_at,
            core_complete: d.core_complete,
            wellness_complete: d.wellness_complete,
            triggers_complete: d.triggers_complete,
            symptoms_complete: d.symptoms_complete,
            journal_complete: d.journal_complete,
          });
        }
      } catch (err) {
        if (!cancelled) {
          // If we already have local data, don't show network errors
          if (!entry) {
            setError(err instanceof Error ? err.message : 'Failed to load entry');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchToday();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { entry, loading, error, refresh };
}
