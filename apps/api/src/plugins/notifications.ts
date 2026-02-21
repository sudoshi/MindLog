// =============================================================================
// MindLog API — Notification dispatch plugin
// Handles push notifications (Expo Push API) and email alerts (Resend).
//
// HIPAA compliance note:
//   - Push notification payloads must NOT contain PHI (only alert metadata).
//   - Email bodies are sent via Resend — BAA with Resend required before PHI.
//   - See DECISIONS.md and compliance env gates in config.ts.
//
// These are stub implementations with proper structure; wire up Expo/Resend
// credentials via environment variables before production use.
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { sql } from '@mindlog/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

interface AlertNotificationParams {
  patientId: string;
  orgId: string;
  alertId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  ruleKey: string;
}

// ---------------------------------------------------------------------------
// Expo Push Notifications
// ---------------------------------------------------------------------------

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(
  pushTokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!config.expoPushAccessToken) {
    console.warn('[notifications] EXPO_PUSH_ACCESS_TOKEN not set — skipping push');
    return;
  }
  if (pushTokens.length === 0) return;

  const messages = pushTokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'alerts',
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.expoPushAccessToken}`,
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    console.error('[notifications] Expo push failed:', res.status, await res.text());
  } else {
    const result = (await res.json()) as { data: PushTicket[] };
    const errors = result.data.filter((t) => t.status === 'error');
    if (errors.length > 0) {
      console.warn('[notifications] Some push tickets errored:', errors);
    }
  }
}

// ---------------------------------------------------------------------------
// Resend email
// ---------------------------------------------------------------------------

async function sendResendEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<void> {
  if (!config.resendApiKey) {
    console.warn('[notifications] RESEND_API_KEY not set — skipping email');
    return;
  }
  if (to.length === 0) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.resendApiKey}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error('[notifications] Resend email failed:', res.status, await res.text());
  }
}

// ---------------------------------------------------------------------------
// Main dispatch: called from rules engine after alert creation
// ---------------------------------------------------------------------------

export async function dispatchAlertNotifications(params: AlertNotificationParams): Promise<void> {
  const { patientId, orgId, alertId, severity, title, ruleKey } = params;

  // Fetch clinicians on this patient's care team with notification prefs enabled
  const clinicians = await sql<{
    id: string;
    email: string;
    push_token: string | null;
    alert_push_enabled: boolean;
    alert_email_enabled: boolean;
  }[]>`
    SELECT
      u.id, u.email,
      np.push_token,
      COALESCE(np.alert_push_enabled, TRUE)  AS alert_push_enabled,
      COALESCE(np.alert_email_enabled, TRUE) AS alert_email_enabled
    FROM care_team_members ctm
    JOIN clinicians c ON c.id = ctm.clinician_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN notification_prefs np ON np.user_id = u.id
    WHERE ctm.patient_id   = ${patientId}
      AND ctm.unassigned_at IS NULL
  `;

  if (clinicians.length === 0) return;

  const pushTokens = clinicians
    .filter((cl) => cl.alert_push_enabled && cl.push_token)
    .map((cl) => cl.push_token!);

  const emailAddresses = clinicians
    .filter((cl) => cl.alert_email_enabled)
    .map((cl) => cl.email);

  const severityEmoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
  const pushTitle = `${severityEmoji} MindLog Alert`;
  // Push body must NOT include PHI — no patient name, just the rule category
  const pushBody = title;

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: ${severity === 'critical' ? '#d62828' : severity === 'warning' ? '#faa307' : '#2a9d8f'}">
        ${severityEmoji} Clinical Alert — ${severity.toUpperCase()}
      </h2>
      <p style="font-size: 16px;">${title}</p>
      <p style="color: #666; font-size: 14px;">Rule: ${ruleKey}</p>
      <a href="${config.webAppUrl}/alerts/${alertId}"
         style="display: inline-block; padding: 12px 24px; background: #2a9d8f; color: white;
                text-decoration: none; border-radius: 8px; margin-top: 16px;">
        View Alert
      </a>
      <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 11px; color: #999;">
        MindLog · 988 Suicide &amp; Crisis Lifeline: Call or text 988 ·
        Crisis Text Line: Text HOME to 741741
      </p>
    </div>
  `;

  await Promise.allSettled([
    sendExpoPush(pushTokens, pushTitle, pushBody, { alertId, severity, ruleKey }),
    sendResendEmail(emailAddresses, `${severityEmoji} MindLog: ${title}`, emailHtml),
  ]);

  // Log notification dispatch to audit trail
  await sql`
    INSERT INTO notification_logs (user_id, type, channel, reference_id, status)
    SELECT
      u.id,
      'ALERT',
      'push',
      ${alertId},
      'sent'
    FROM care_team_members ctm
    JOIN clinicians c ON c.id = ctm.clinician_id
    JOIN users u ON u.id = c.user_id
    WHERE ctm.patient_id = ${patientId}
      AND ctm.unassigned_at IS NULL
    ON CONFLICT DO NOTHING
  `;
}

// ---------------------------------------------------------------------------
// Fastify plugin — decorates fastify.notifications
// ---------------------------------------------------------------------------

async function notificationsPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('notifications', { dispatchAlertNotifications });
}

export default fp(notificationsPlugin, { name: 'notifications-plugin' });

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    notifications: {
      dispatchAlertNotifications: typeof dispatchAlertNotifications;
    };
  }
}
