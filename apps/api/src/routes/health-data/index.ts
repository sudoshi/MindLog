// =============================================================================
// MindLog API — Passive health data sync route
// POST /api/v1/health-data/sync   — batch upsert passive health snapshots
// GET  /api/v1/health-data/me     — last 30 days of snapshots for calling patient
//
// Deduplicates via UNIQUE (patient_id, snapshot_date, source) — safe to call
// repeatedly from the app foreground handler.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const HealthSnapshotSchema = z.object({
  snapshot_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
  source:          z.enum(['healthkit', 'health_connect', 'manual']),
  step_count:      z.number().int().min(0).optional().nullable(),
  active_calories: z.number().int().min(0).optional().nullable(),
  resting_hr:      z.number().int().min(20).max(300).optional().nullable(),
  hrv_ms:          z.number().min(0).optional().nullable(),
  sleep_hours:     z.number().min(0).max(24).optional().nullable(),
  sleep_deep_pct:  z.number().min(0).max(100).optional().nullable(),
  sleep_rem_pct:   z.number().min(0).max(100).optional().nullable(),
  o2_saturation:   z.number().min(50).max(100).optional().nullable(),
});

const SyncBodySchema = z.object({
  snapshots: z.array(HealthSnapshotSchema).min(1).max(60), // max 60 days at once
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function healthDataRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ── POST /health-data/sync ─────────────────────────────────────────────────
  fastify.post('/sync', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Patient access only' },
      });
    }

    const patientId = request.user.sub;
    const body = SyncBodySchema.parse(request.body);

    let upserted = 0;
    for (const s of body.snapshots) {
      await sql`
        INSERT INTO passive_health_snapshots (
          patient_id, snapshot_date, source,
          step_count, active_calories, resting_hr, hrv_ms,
          sleep_hours, sleep_deep_pct, sleep_rem_pct, o2_saturation
        ) VALUES (
          ${patientId}, ${s.snapshot_date}, ${s.source},
          ${s.step_count ?? null}, ${s.active_calories ?? null},
          ${s.resting_hr ?? null}, ${s.hrv_ms ?? null},
          ${s.sleep_hours ?? null}, ${s.sleep_deep_pct ?? null},
          ${s.sleep_rem_pct ?? null}, ${s.o2_saturation ?? null}
        )
        ON CONFLICT (patient_id, snapshot_date, source) DO UPDATE SET
          step_count      = COALESCE(EXCLUDED.step_count,      passive_health_snapshots.step_count),
          active_calories = COALESCE(EXCLUDED.active_calories, passive_health_snapshots.active_calories),
          resting_hr      = COALESCE(EXCLUDED.resting_hr,      passive_health_snapshots.resting_hr),
          hrv_ms          = COALESCE(EXCLUDED.hrv_ms,          passive_health_snapshots.hrv_ms),
          sleep_hours     = COALESCE(EXCLUDED.sleep_hours,     passive_health_snapshots.sleep_hours),
          sleep_deep_pct  = COALESCE(EXCLUDED.sleep_deep_pct,  passive_health_snapshots.sleep_deep_pct),
          sleep_rem_pct   = COALESCE(EXCLUDED.sleep_rem_pct,   passive_health_snapshots.sleep_rem_pct),
          o2_saturation   = COALESCE(EXCLUDED.o2_saturation,   passive_health_snapshots.o2_saturation),
          updated_at      = NOW()
      `;
      upserted++;
    }

    return reply.send({
      success: true,
      data: { synced: upserted },
    });
  });

  // ── GET /health-data/me ────────────────────────────────────────────────────
  fastify.get('/me', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Patient access only' },
      });
    }

    const patientId = request.user.sub;

    const rows = await sql<{
      snapshot_date: string;
      source: string;
      step_count: number | null;
      active_calories: number | null;
      resting_hr: number | null;
      hrv_ms: string | null;
      sleep_hours: string | null;
      sleep_deep_pct: string | null;
      sleep_rem_pct: string | null;
      o2_saturation: string | null;
    }[]>`
      SELECT
        snapshot_date, source,
        step_count, active_calories, resting_hr,
        hrv_ms::float, sleep_hours::float,
        sleep_deep_pct::float, sleep_rem_pct::float, o2_saturation::float
      FROM passive_health_snapshots
      WHERE patient_id = ${patientId}
        AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY snapshot_date DESC, source
    `;

    return reply.send({ success: true, data: { snapshots: rows } });
  });
}
