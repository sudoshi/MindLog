// =============================================================================
// MindLog API — Notification preference routes (patient-facing + clinician)
// GET  /api/v1/notifications/prefs                  — read patient notification preferences
// PUT  /api/v1/notifications/prefs                  — update preferences + register push token
// POST /api/v1/notifications/send-assessment-request — clinician → patient push
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { config } from '../../config.js';
import { UuidSchema } from '@mindlog/shared';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPatientPush(pushToken: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  if (!config.expoPushAccessToken) {
    console.warn('[notifications] EXPO_PUSH_ACCESS_TOKEN not set — skipping push');
    return;
  }
  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.expoPushAccessToken}`,
    },
    body: JSON.stringify([{ to: pushToken, title, body, data, sound: 'default', priority: 'high', channelId: 'assessments' }]),
  }).catch((err: unknown) => console.error('[notifications] Expo push error:', err));
}

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

  // ---------------------------------------------------------------------------
  // POST /notifications/send-assessment-request — clinician sends assessment push
  // Clinician auth required; validates care-team membership.
  // ---------------------------------------------------------------------------
  fastify.post('/send-assessment-request', { preHandler: [fastify.requireRole(['clinician', 'admin'])] }, async (request, reply) => {
    const body = z.object({
      patient_id: UuidSchema,
      scale: z.enum(['PHQ-9', 'GAD-7', 'ASRM', 'C-SSRS', 'ISI', 'WHODAS']),
      message: z.string().max(200).optional(),
    }).parse(request.body);

    const { sub: clinicianId } = request.user as { sub: string };

    // Verify care-team membership
    const [access] = await sql<{ id: string }[]>`
      SELECT ctm.id FROM care_team_members ctm
      WHERE ctm.patient_id   = ${body.patient_id}
        AND ctm.clinician_id = ${clinicianId}::UUID
        AND ctm.unassigned_at IS NULL
    `;
    if (!access) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not on this patient\'s care team' } });
    }

    // Fetch clinician name + patient push token
    const [[clinician], [prefs]] = await Promise.all([
      sql<{ first_name: string; last_name: string; title: string | null }[]>`
        SELECT first_name, last_name, title FROM clinicians WHERE id = ${clinicianId}::UUID LIMIT 1
      `,
      sql<{ push_token: string | null }[]>`
        SELECT push_token FROM patient_notification_preferences
        WHERE patient_id = ${body.patient_id} LIMIT 1
      `,
    ]);

    const pushToken = prefs?.push_token;
    if (!pushToken) {
      return reply.status(422).send({
        success: false,
        error: { code: 'NO_PUSH_TOKEN', message: 'Patient does not have a registered push token' },
      });
    }

    const clinicianName = clinician
      ? `${clinician.title ? clinician.title + ' ' : ''}${clinician.first_name} ${clinician.last_name}`
      : 'Your clinician';

    const pushTitle = `Assessment Requested: ${body.scale}`;
    const pushBody = body.message ?? `${clinicianName} has requested a ${body.scale} assessment. Please open MindLog to complete it.`;

    await sendPatientPush(pushToken, pushTitle, pushBody, {
      type: 'assessment_request',
      scale: body.scale,
      clinicianId,
    });

    return reply.status(200).send({ success: true, data: { sent: true, scale: body.scale } });
  });
}
