// =============================================================================
// MindLog API — Messaging service (Resend email)
// Handles all outbound email: patient invites, welcome emails.
//
// Graceful degradation: if RESEND_API_KEY is absent (local dev without key),
// the email body is printed to the console instead of crashing the request.
// =============================================================================

import { Resend } from 'resend';
import { config } from '../config.js';

// Lazy singleton — only instantiated when RESEND_API_KEY is set.
let _resend: Resend | null = null;

function getClient(): Resend | null {
  if (!config.resendApiKey) return null;
  if (!_resend) _resend = new Resend(config.resendApiKey);
  return _resend;
}

// App deep-link scheme — used in invite email CTAs.
const APP_SCHEME = 'mindlog';

// ---------------------------------------------------------------------------
// Shared HTML layout
// ---------------------------------------------------------------------------

function emailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MindLog</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="540" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#161a27;border-radius:16px;overflow:hidden;max-width:540px;width:100%;">

          <!-- Header band -->
          <tr>
            <td style="background:linear-gradient(135deg,#6C63FF,#3B82F6);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                MindLog
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
                Mental health tracking for you and your care team
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #252d40;">
              <p style="margin:0;color:#4b5563;font-size:12px;line-height:1.6;">
                If you are in crisis or need immediate help, call or text
                <strong style="color:#9ca3af;">${config.crisisLinePhone}</strong>
                (${config.crisisLinePhone === '988' ? '988 Suicide &amp; Crisis Lifeline' : 'Crisis Line'}) —
                available 24/7.<br /><br />
                This email was sent by MindLog on behalf of your care team.
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Primary CTA button component
// ---------------------------------------------------------------------------

function ctaButton(href: string, label: string): string {
  return `<a href="${href}"
     style="display:inline-block;background:linear-gradient(135deg,#6C63FF,#3B82F6);
            color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;
            font-size:15px;font-weight:600;margin-top:24px;margin-bottom:8px;">
    ${label}
  </a>`;
}

// ---------------------------------------------------------------------------
// sendInviteEmail
// Sends the clinician-issued invite to the prospective patient.
// ---------------------------------------------------------------------------

export interface InviteEmailOpts {
  to: string;
  token: string;
  clinicianName: string;
  orgName: string;
  personalMessage?: string;
  expiresAt: Date;
}

export async function sendInviteEmail(opts: InviteEmailOpts): Promise<void> {
  const { to, token, clinicianName, orgName, personalMessage, expiresAt } = opts;

  const deepLink = `${APP_SCHEME}://invite?token=${encodeURIComponent(token)}`;
  const expiryStr = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const personalBlock = personalMessage
    ? `<div style="background:#1e2535;border-left:3px solid #6C63FF;border-radius:6px;
                   padding:14px 18px;margin:20px 0;">
         <p style="margin:0;color:#c8d0e0;font-size:14px;line-height:1.6;font-style:italic;">
           "${personalMessage}"
         </p>
         <p style="margin:8px 0 0;color:#6C63FF;font-size:12px;font-weight:600;">
           — ${clinicianName}
         </p>
       </div>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;font-weight:600;
              text-transform:uppercase;letter-spacing:0.5px;">
      ${orgName}
    </p>
    <h2 style="margin:0 0 16px;color:#f0f4ff;font-size:22px;font-weight:700;line-height:1.3;">
      ${clinicianName} has invited you to MindLog
    </h2>
    <p style="margin:0;color:#8892a4;font-size:15px;line-height:1.7;">
      MindLog helps you track your mood, sleep, and wellbeing between appointments —
      giving your care team the insights they need to support you better.
    </p>

    ${personalBlock}

    <p style="margin:20px 0 0;color:#c8d0e0;font-size:14px;line-height:1.6;">
      To get started, download the MindLog app and tap the button below to
      create your account.
    </p>

    <div style="text-align:center;margin:8px 0 4px;">
      ${ctaButton(deepLink, 'Open MindLog &amp; Create Account')}
    </div>

    <p style="margin:16px 0 0;color:#4b5563;font-size:12px;text-align:center;">
      Or enter invite code manually in the app:<br />
      <code style="color:#6C63FF;font-size:13px;letter-spacing:1px;">${token}</code>
    </p>

    <div style="background:#1e2535;border-radius:8px;padding:14px 18px;margin:24px 0 0;">
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
        ⏳ This invite expires on <strong style="color:#9ca3af;">${expiryStr}</strong>.
        If you have questions, contact your care team at ${orgName}.
      </p>
    </div>
  `;

  const subject = `${orgName} — ${clinicianName} has invited you to MindLog`;
  const html = emailLayout(bodyHtml);
  const text = [
    `${clinicianName} has invited you to MindLog (${orgName}).`,
    personalMessage ? `\nMessage: "${personalMessage}"` : '',
    `\nCreate your account using invite code: ${token}`,
    `Or open this link: ${deepLink}`,
    `\nThis invite expires on ${expiryStr}.`,
  ].join('');

  await send({ to, subject, html, text });
}

// ---------------------------------------------------------------------------
// sendWelcomeEmail
// Sent immediately after a patient completes self-registration.
// ---------------------------------------------------------------------------

export interface WelcomeEmailOpts {
  to: string;
  firstName: string;
  clinicianName: string;
}

export async function sendWelcomeEmail(opts: WelcomeEmailOpts): Promise<void> {
  const { to, firstName, clinicianName } = opts;

  const appLink = `${APP_SCHEME}://`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#f0f4ff;font-size:22px;font-weight:700;line-height:1.3;">
      Welcome to MindLog, ${firstName}! 🎉
    </h2>
    <p style="margin:0 0 16px;color:#8892a4;font-size:15px;line-height:1.7;">
      Your account has been created and ${clinicianName} can now see your check-ins
      as you build your streak.
    </p>
    <p style="margin:0;color:#c8d0e0;font-size:14px;line-height:1.7;">
      <strong style="color:#f0f4ff;">What happens next:</strong>
    </p>
    <ul style="margin:12px 0 0;padding:0 0 0 20px;color:#8892a4;font-size:14px;line-height:2;">
      <li>Complete a short setup to personalise your daily check-in</li>
      <li>Do your first check-in — it takes under 2 minutes</li>
      <li>Check your Insights tab after 7 days to see your first patterns</li>
    </ul>

    <div style="text-align:center;">
      ${ctaButton(appLink, 'Open MindLog')}
    </div>

    <div style="background:#1e2535;border-radius:8px;padding:14px 18px;margin:24px 0 0;">
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
        🔒 Your data is encrypted and only visible to you and the clinicians on
        your care team. You can manage your privacy settings any time in the
        app under Profile → Privacy.
      </p>
    </div>
  `;

  const subject = `Welcome to MindLog, ${firstName}!`;
  const html = emailLayout(bodyHtml);
  const text = [
    `Welcome to MindLog, ${firstName}!`,
    `Your account is ready. ${clinicianName} can now see your check-ins.`,
    `Open the app to get started: ${appLink}`,
  ].join('\n');

  await send({ to, subject, html, text });
}

// ---------------------------------------------------------------------------
// Internal send helper — handles dev fallback + Resend errors
// ---------------------------------------------------------------------------

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send(payload: EmailPayload): Promise<void> {
  const client = getClient();

  if (!client) {
    // Dev/CI mode: print to console instead of sending
    console.info(
      '[messaging] RESEND_API_KEY not set — email not sent (dev mode).\n' +
      `  To: ${payload.to}\n` +
      `  Subject: ${payload.subject}\n` +
      `  Body (plain text):\n${payload.text}`,
    );
    return;
  }

  const { error } = await client.emails.send({
    from: config.emailFrom,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });

  if (error) {
    // Log but don't crash the request — email delivery is best-effort.
    console.error('[messaging] Resend delivery error:', error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
