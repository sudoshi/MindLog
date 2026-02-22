// =============================================================================
// MindLog API — Nightly batch scheduler
// Runs every night at 02:00 America/New_York (≈ 07:00 UTC) to:
//   1. Evaluate RULE-002 (missed check-in) for all active patients
//   2. Generate per-clinician population_snapshots for the dashboard KPI cards
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@mindlog/db';
import { connection, rulesQueue, type RulesJobData } from './rules-engine.js';

const SCHEDULER_QUEUE_NAME = 'mindlog-nightly';

// ---------------------------------------------------------------------------
// Snapshot generation
// ---------------------------------------------------------------------------

async function generatePopulationSnapshots(dateStr: string): Promise<void> {
  // Compute per-clinician aggregates and upsert into population_snapshots.
  // All active clinicians who have ≥1 active patient are included.
  await sql`
    INSERT INTO population_snapshots (
      organisation_id,
      clinician_id,
      snapshot_date,
      total_patients,
      active_patients,
      crisis_patients,
      avg_mood_x10,
      avg_coping_x10,
      avg_sleep_minutes,
      risk_critical_count,
      risk_high_count,
      risk_moderate_count,
      risk_low_count,
      critical_alerts_count,
      warning_alerts_count,
      checkin_rate_pct,
      generated_at
    )
    SELECT
      c.organisation_id,
      ctm.clinician_id,
      ${dateStr}::DATE                                                              AS snapshot_date,
      COUNT(DISTINCT p.id)::SMALLINT                                               AS total_patients,
      COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')::SMALLINT           AS active_patients,
      COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'crisis')::SMALLINT           AS crisis_patients,

      -- 7-day mood / coping averages (×10 to keep as SMALLINT)
      ROUND(
        AVG(de.mood) FILTER (WHERE de.entry_date >= ${dateStr}::DATE - 7) * 10
      )::SMALLINT                                                                  AS avg_mood_x10,
      ROUND(
        AVG(de.coping) FILTER (WHERE de.entry_date >= ${dateStr}::DATE - 7) * 10
      )::SMALLINT                                                                  AS avg_coping_x10,

      -- 7-day avg sleep in minutes (from sleep_logs)
      ROUND(
        AVG(sl.total_minutes) FILTER (WHERE sl.entry_date >= ${dateStr}::DATE - 7)
      )::SMALLINT                                                                  AS avg_sleep_minutes,

      -- Risk level distribution
      COUNT(DISTINCT p.id) FILTER (WHERE p.risk_level = 'critical')::SMALLINT     AS risk_critical_count,
      COUNT(DISTINCT p.id) FILTER (WHERE p.risk_level = 'high')::SMALLINT         AS risk_high_count,
      COUNT(DISTINCT p.id) FILTER (WHERE p.risk_level = 'moderate')::SMALLINT     AS risk_moderate_count,
      COUNT(DISTINCT p.id) FILTER (WHERE p.risk_level = 'low')::SMALLINT          AS risk_low_count,

      -- Open (unacknowledged) alert counts
      COUNT(DISTINCT ca.id) FILTER (
        WHERE ca.severity = 'critical'
          AND ca.auto_resolved = FALSE
          AND ca.acknowledged_at IS NULL
      )::SMALLINT                                                                  AS critical_alerts_count,
      COUNT(DISTINCT ca.id) FILTER (
        WHERE ca.severity = 'warning'
          AND ca.auto_resolved = FALSE
          AND ca.acknowledged_at IS NULL
      )::SMALLINT                                                                  AS warning_alerts_count,

      -- Yesterday check-in rate
      CASE WHEN COUNT(DISTINCT p.id) > 0 THEN
        ROUND(
          100.0
          * COUNT(DISTINCT de_yesterday.patient_id)
              FILTER (WHERE de_yesterday.submitted_at IS NOT NULL)
          / COUNT(DISTINCT p.id)
        )::SMALLINT
      END                                                                          AS checkin_rate_pct,

      NOW()                                                                        AS generated_at

    FROM care_team_members ctm
    JOIN clinicians c ON c.id = ctm.clinician_id AND c.is_active = TRUE
    JOIN patients p
      ON p.id = ctm.patient_id
      AND ctm.unassigned_at IS NULL
      AND p.is_active = TRUE

    -- 7-day entries for mood/coping/sleep averages
    LEFT JOIN daily_entries de
      ON de.patient_id = p.id
      AND de.entry_date >= ${dateStr}::DATE - 7

    -- Sleep logs linked to those entries
    LEFT JOIN sleep_logs sl
      ON sl.patient_id = p.id
      AND sl.entry_date >= ${dateStr}::DATE - 7

    -- Yesterday's entry for check-in rate
    LEFT JOIN daily_entries de_yesterday
      ON de_yesterday.patient_id = p.id
      AND de_yesterday.entry_date = ${dateStr}::DATE - 1

    -- Open alerts
    LEFT JOIN clinical_alerts ca
      ON ca.patient_id = p.id

    GROUP BY c.organisation_id, ctm.clinician_id

    ON CONFLICT (organisation_id, clinician_id, snapshot_date) DO UPDATE SET
      total_patients        = EXCLUDED.total_patients,
      active_patients       = EXCLUDED.active_patients,
      crisis_patients       = EXCLUDED.crisis_patients,
      avg_mood_x10          = EXCLUDED.avg_mood_x10,
      avg_coping_x10        = EXCLUDED.avg_coping_x10,
      avg_sleep_minutes     = EXCLUDED.avg_sleep_minutes,
      risk_critical_count   = EXCLUDED.risk_critical_count,
      risk_high_count       = EXCLUDED.risk_high_count,
      risk_moderate_count   = EXCLUDED.risk_moderate_count,
      risk_low_count        = EXCLUDED.risk_low_count,
      critical_alerts_count = EXCLUDED.critical_alerts_count,
      warning_alerts_count  = EXCLUDED.warning_alerts_count,
      checkin_rate_pct      = EXCLUDED.checkin_rate_pct,
      generated_at          = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Scheduler worker
// ---------------------------------------------------------------------------

export function startNightlyScheduler(): Worker {
  // The scheduler queue runs a single "tick" job on a cron schedule.
  // When the tick fires, we query all active patients and fan-out rules jobs.
  const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
  });

  // Register the repeatable job (idempotent — BullMQ deduplicates by jobId)
  void schedulerQueue.add(
    'nightly-tick',
    {},
    {
      repeat: {
        // 02:00 EST/EDT (UTC-5 winter, UTC-4 summer) — approximated as 07:00 UTC
        // For production, use a timezone-aware cron library or set TZ=America/New_York
        cron: '0 7 * * *',
      },
      jobId: 'nightly-tick-singleton',
    },
  );

  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0]!;

      // -----------------------------------------------------------------------
      // Step 1: Fan out rule evaluation jobs for all recently-active patients
      // -----------------------------------------------------------------------
      const patients = await sql<{ id: string; organisation_id: string }[]>`
        SELECT DISTINCT p.id, p.organisation_id
        FROM patients p
        JOIN daily_entries de ON de.patient_id = p.id
        WHERE de.entry_date >= CURRENT_DATE - INTERVAL '90 days'
          AND p.status = 'active'
      `;

      console.info(`[nightly] Processing ${patients.length} patients for ${dateStr}`);

      for (const patient of patients) {
        const jobData: RulesJobData = {
          patientId: patient.id,
          orgId: patient.organisation_id,
          entryDate: dateStr,
          triggeredBy: 'nightly_batch',
        };
        await rulesQueue.add('evaluate', jobData, {
          jobId: `nightly:${patient.id}:${dateStr}`,
        });
      }

      console.info(`[nightly] Enqueued ${patients.length} rule evaluation jobs`);

      // -----------------------------------------------------------------------
      // Step 2: Generate population snapshots for all clinicians
      // -----------------------------------------------------------------------
      try {
        await generatePopulationSnapshots(dateStr);
        console.info(`[nightly] Population snapshots generated for ${dateStr}`);
      } catch (err) {
        // Non-fatal — dashboard falls back to live counts if snapshot missing
        console.error('[nightly] Snapshot generation failed:', err);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    console.error('[nightly] Scheduler tick failed:', err.message);
  });

  return worker;
}
