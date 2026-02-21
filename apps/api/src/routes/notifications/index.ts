// =============================================================================
// MindLog API — Notification preference routes (patient-facing)
// GET /api/v1/notifications/prefs    — read patient notification preferences
// PUT /api/v1/notifications/prefs    — update preferences + register push token
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';

const UpdatePrefsSchema = z.object({
  daily_reminder_enabled: z.boolean().optional(),
  daily_reminder_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')
    .optional(),
  medication_reminder_enabled: z.boolean().optional(),
  streak_notifications: z.boolean().optional(),
  appointment_reminders: z.boolean().optional(),
  push_token: z.string().max(512).nullable().optional(),
});

export default async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  const patientOnly = { preHandler: [fastify.requireRole(['patient'])] };

  // ---------------------------------------------------------------------------
  // GET /notifications/prefs — patient reads their notification prefs
  // ---------------------------------------------------------------------------
  fastify.get('/prefs', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;

    const [prefs] = await sql`
      SELECT id, daily_reminder_enabled, daily_reminder_time,
             medication_reminder_enabled, streak_notifications,
             appointment_reminders, push_token, updated_at
      FROM patient_notification_preferences
      WHERE patient_id = ${patientId}
      LIMIT 1
    `;

    if (!prefs) {
      // Insert defaults and return
      const [created] = await sql`
        INSERT INTO patient_notification_preferences (patient_id)
        VALUES (${patientId})
        ON CONFLICT (patient_id) DO UPDATE SET updated_at = NOW()
        RETURNING id, daily_reminder_enabled, daily_reminder_time,
                  medication_reminder_enabled, streak_notifications,
                  appointment_reminders, push_token, updated_at
      `;
      return reply.send({ success: true, data: created });
    }

    return reply.send({ success: true, data: prefs });
  });

  // ---------------------------------------------------------------------------
  // PUT /notifications/prefs — patient updates notification prefs
  // ---------------------------------------------------------------------------
  fastify.put('/prefs', patientOnly, async (request, reply) => {
    const patientId = request.user.sub;
    const body = UpdatePrefsSchema.parse(request.body);
    const tokenUpdatedAt = body.push_token != null ? new Date() : null;

    // Use UPDATE … WHERE + INSERT fallback pattern to avoid complex UPSERT
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM patient_notification_preferences WHERE patient_id = ${patientId} LIMIT 1
    `;

    if (existing) {
      const [updated] = await sql`
        UPDATE patient_notification_preferences SET
          daily_reminder_enabled      = COALESCE(${body.daily_reminder_enabled ?? null}, daily_reminder_enabled),
          daily_reminder_time         = COALESCE(${body.daily_reminder_time ?? null}::TIME, daily_reminder_time),
          medication_reminder_enabled = COALESCE(${body.medication_reminder_enabled ?? null}, medication_reminder_enabled),
          streak_notifications        = COALESCE(${body.streak_notifications ?? null}, streak_notifications),
          appointment_reminders       = COALESCE(${body.appointment_reminders ?? null}, appointment_reminders),
          push_token                  = COALESCE(${body.push_token ?? null}, push_token),
          push_token_updated_at       = COALESCE(${tokenUpdatedAt}, push_token_updated_at),
          updated_at                  = NOW()
        WHERE patient_id = ${patientId}
        RETURNING id, daily_reminder_enabled, daily_reminder_time,
                  medication_reminder_enabled, streak_notifications,
                  appointment_reminders, push_token, updated_at
      `;
      return reply.send({ success: true, data: updated });
    }

    // Insert with provided values (or defaults)
    const [created] = await sql`
      INSERT INTO patient_notification_preferences (
        patient_id, daily_reminder_enabled, daily_reminder_time,
        medication_reminder_enabled, streak_notifications,
        appointment_reminders, push_token, push_token_updated_at
      )
      VALUES (
        ${patientId},
        ${body.daily_reminder_enabled ?? true},
        ${body.daily_reminder_time ?? '20:00'}::TIME,
        ${body.medication_reminder_enabled ?? true},
        ${body.streak_notifications ?? true},
        ${body.appointment_reminders ?? true},
        ${body.push_token ?? null},
        ${tokenUpdatedAt}
      )
      RETURNING id, daily_reminder_enabled, daily_reminder_time,
                medication_reminder_enabled, streak_notifications,
                appointment_reminders, push_token, updated_at
    `;
    return reply.send({ success: true, data: created });
  });
}
