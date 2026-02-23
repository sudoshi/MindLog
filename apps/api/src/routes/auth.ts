// =============================================================================
// MindLog API — Auth routes
// POST /api/v1/auth/login        — clinician OR patient login
// POST /api/v1/auth/mfa/verify   — TOTP second factor (clinicians)
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// GET  /api/v1/auth/me
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '@mindlog/db';
import { LoginSchema, RefreshTokenSchema, RegisterSchema } from '@mindlog/shared';
import { config } from '../config.js';
import { auditLog } from '../middleware/audit.js';
import { sendWelcomeEmail } from '../services/messaging.js';
import type { JwtPayload } from '../plugins/auth.js';

// MFA verify only needs the 6-digit code; factor_id + supabase token
// are embedded in the partial JWT issued during login.
const MfaVerifyBodySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Must be a 6-digit code'),
});

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /login — supports both clinician and patient accounts
  // ---------------------------------------------------------------------------
  fastify.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);

    // Authenticate against Supabase Auth
    const supabaseRes = await fetch(
      `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseServiceRoleKey,
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
      },
    );

    if (!supabaseRes.ok) {
      await auditLog({
        actor: { sub: 'unknown', email: body.email, role: 'clinician', org_id: 'unknown' },
        action: 'login',
        resourceType: 'auth',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        failureReason: 'invalid_credentials',
      });
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const supabaseData = (await supabaseRes.json()) as {
      access_token: string;
      refresh_token: string;
      user: {
        id: string;
        email: string;
        factors?: Array<{ id: string; factor_type: string; status: string }>;
      };
    };

    // -------------------------------------------------------------------------
    // Clinician path
    // -------------------------------------------------------------------------
    const [clinician] = await sql<{
      id: string; organisation_id: string; role: string; mfa_enabled: boolean;
    }[]>`
      SELECT id, organisation_id, role, mfa_enabled
      FROM clinicians
      WHERE email = ${body.email} AND is_active = TRUE
      LIMIT 1
    `;

    if (clinician) {
      if (clinician.mfa_enabled) {
        // Get the TOTP factor_id so the MFA verify endpoint can use it server-side
        const factorId = supabaseData.user.factors?.find(
          (f) => f.factor_type === 'totp' && f.status === 'verified',
        )?.id ?? '';

        const partialToken = fastify.jwt.sign(
          {
            sub: supabaseData.user.id,
            email: body.email,
            role: 'clinician',
            org_id: clinician.organisation_id,
            mfa_pending: true,
            supabase_token: supabaseData.access_token,  // aal1 token for challenge
            factor_id: factorId,
            clinician_id: clinician.id,
          },
          { expiresIn: '5m' },
        );

        return reply.send({ success: true, data: { mfa_required: true, partial_token: partialToken } });
      }

      const payload: JwtPayload = {
        sub: supabaseData.user.id,
        email: body.email,
        role: 'clinician',
        org_id: clinician.organisation_id,
      };
      const accessToken = fastify.jwt.sign(payload, { expiresIn: config.jwtAccessExpiry });

      await sql`UPDATE clinicians SET last_login_at = NOW() WHERE id = ${clinician.id}`;

      await auditLog({
        actor: payload,
        action: 'login',
        resourceType: 'auth',
        resourceId: clinician.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        data: {
          access_token: accessToken,
          refresh_token: supabaseData.refresh_token,
          clinician_id: clinician.id,
          org_id: clinician.organisation_id,
          role: 'clinician',
          user: { id: clinician.id, email: body.email, role: 'clinician', org_id: clinician.organisation_id },
        },
      });
    }

    // -------------------------------------------------------------------------
    // Patient path — fallback when not a clinician
    // -------------------------------------------------------------------------
    const [patient] = await sql<{ id: string; organisation_id: string }[]>`
      SELECT id, organisation_id
      FROM patients
      WHERE email = ${body.email} AND is_active = TRUE
      LIMIT 1
    `;

    if (!patient) {
      await auditLog({
        actor: { sub: 'unknown', email: body.email, role: 'patient', org_id: 'unknown' },
        action: 'login',
        resourceType: 'auth',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        failureReason: 'account_not_found',
      });
      return reply.status(403).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'No account found for this email' },
      });
    }

    const patientPayload: JwtPayload = {
      sub: patient.id,  // Use the patients table UUID, not the Supabase auth UUID
      email: body.email,
      role: 'patient',
      org_id: patient.organisation_id,
    };
    const accessToken = fastify.jwt.sign(patientPayload, { expiresIn: config.jwtAccessExpiry });

    await auditLog({
      actor: patientPayload,
      action: 'login',
      resourceType: 'auth',
      resourceId: patient.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: supabaseData.refresh_token,
        patient_id: patient.id,
        org_id: patient.organisation_id,
        role: 'patient',
        user: { id: patient.id, email: body.email, role: 'patient', org_id: patient.organisation_id },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /register — invite-only patient self-registration
  // ---------------------------------------------------------------------------
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);

    // --- 1. Validate invite token -------------------------------------------
    const [invite] = await sql<{
      id: string; clinician_id: string; org_id: string;
      email: string; personal_message: string | null;
    }[]>`
      SELECT id, clinician_id, org_id, email, personal_message
      FROM patient_invites
      WHERE token = ${body.invite_token}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `;

    if (!invite) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVITE_INVALID', message: 'Invite token is invalid or has expired' },
      });
    }

    // Emails must match (case-insensitive)
    if (invite.email.toLowerCase() !== body.email.toLowerCase()) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMAIL_MISMATCH', message: 'Email does not match the invite' },
      });
    }

    // --- 2. Guard: email already registered ---------------------------------
    const [existingPatient] = await sql<{ id: string }[]>`
      SELECT id FROM patients
      WHERE lower(email) = lower(${body.email})
        AND is_active = TRUE
      LIMIT 1
    `;
    if (existingPatient) {
      return reply.status(409).send({
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
      });
    }

    // --- 3. Create Supabase Auth user ----------------------------------------
    const supabaseRes = await fetch(
      `${config.supabaseUrl}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseServiceRoleKey,
          Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          email_confirm: true,
        }),
      },
    );

    if (!supabaseRes.ok) {
      const errBody = (await supabaseRes.json()) as { message?: string };
      const msg = errBody.message ?? 'Failed to create auth account';
      if (msg.toLowerCase().includes('already')) {
        return reply.status(409).send({
          success: false,
          error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'AUTH_ERROR', message: msg },
      });
    }

    // --- 4. Insert patient row (new UUID, NOT Supabase auth UUID) -----------
    const autoMrn = `AUTO-${Date.now().toString(36).toUpperCase()}`;

    const [newPatient] = await sql<{ id: string }[]>`
      INSERT INTO patients (
        organisation_id, mrn, email,
        first_name, last_name, date_of_birth,
        timezone, invite_id
      ) VALUES (
        ${invite.org_id}::UUID,
        ${autoMrn},
        ${body.email},
        ${body.first_name},
        ${body.last_name},
        ${body.date_of_birth}::DATE,
        ${body.timezone},
        ${invite.id}::UUID
      )
      RETURNING id
    `;

    if (!newPatient) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create patient record' },
      });
    }

    const patientId = newPatient.id;

    // --- 5. Mark invite as accepted -----------------------------------------
    await sql`
      UPDATE patient_invites
      SET status      = 'accepted',
          patient_id  = ${patientId}::UUID,
          accepted_at = NOW()
      WHERE id = ${invite.id}::UUID
    `;

    // --- 6. Add clinician to care team --------------------------------------
    await sql`
      INSERT INTO care_team_members (patient_id, clinician_id, role)
      VALUES (${patientId}::UUID, ${invite.clinician_id}::UUID, 'primary')
      ON CONFLICT (patient_id, clinician_id, role) DO NOTHING
    `;

    // --- 7. Seed required consents (user agreed to ToS/PP by submitting form) ---
    const ipAddress = request.ip;
    await sql`
      INSERT INTO consent_records
        (patient_id, consent_type, granted, consent_version, ip_address)
      VALUES
        (${patientId}::UUID, 'terms_of_service', TRUE, '1.0', ${ipAddress}::INET),
        (${patientId}::UUID, 'privacy_policy',   TRUE, '1.0', ${ipAddress}::INET)
    `;

    // --- 8. Alert clinician: new patient registered -------------------------
    try {
      await sql`
        INSERT INTO clinical_alerts
          (patient_id, organisation_id, alert_type, severity, title, body)
        VALUES (
          ${patientId}::UUID,
          ${invite.org_id}::UUID,
          'patient_registered',
          'info',
          'New patient registered',
          ${`${body.first_name} ${body.last_name} has registered and completed their account setup.`}
        )
      `;
    } catch (err) {
      fastify.log.warn({ err }, '[register] Failed to insert patient_registered alert');
    }

    // --- 9. Audit log -------------------------------------------------------
    await auditLog({
      actor: { sub: patientId, email: body.email, role: 'patient', org_id: invite.org_id },
      action: 'create',
      resourceType: 'patient',
      resourceId: patientId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // --- 10. Send welcome email ---------------------------------------------
    try {
      const [clinicianRow] = await sql<{ first_name: string; last_name: string }[]>`
        SELECT first_name, last_name FROM clinicians WHERE id = ${invite.clinician_id}::UUID LIMIT 1
      `;
      await sendWelcomeEmail({
        to: body.email,
        firstName: body.first_name,
        clinicianName: clinicianRow
          ? `${clinicianRow.first_name} ${clinicianRow.last_name}`
          : 'your care team',
      });
    } catch (err) {
      fastify.log.error({ err }, '[register] sendWelcomeEmail failed');
    }

    // --- 11. Issue tokens ---------------------------------------------------
    // Use Supabase password grant to obtain a valid refresh token
    const tokenRes = await fetch(
      `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseServiceRoleKey,
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
      },
    );

    const tokenData = tokenRes.ok
      ? ((await tokenRes.json()) as { access_token: string; refresh_token: string })
      : null;

    const jwtPayload: JwtPayload = {
      sub: patientId,
      email: body.email,
      role: 'patient',
      org_id: invite.org_id,
    };
    const accessToken = fastify.jwt.sign(jwtPayload, { expiresIn: config.jwtAccessExpiry });

    return reply.status(201).send({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: tokenData?.refresh_token ?? null,
        patient_id: patientId,
        org_id: invite.org_id,
        role: 'patient',
        user: { id: patientId, email: body.email, role: 'patient', org_id: invite.org_id },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /mfa/verify — complete TOTP second factor for clinicians
  // factor_id and supabase_token are read from the partial JWT (not the request body)
  // ---------------------------------------------------------------------------
  fastify.post('/mfa/verify', async (request, reply) => {
    const body = MfaVerifyBodySchema.parse(request.body);

    try {
      const partial = await request.jwtVerify<JwtPayload & {
        mfa_pending?: boolean;
        supabase_token?: string;
        factor_id?: string;
        clinician_id?: string;
      }>();

      if (!partial.mfa_pending) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'MFA not required for this token' },
        });
      }

      const factorId = partial.factor_id;
      const supabaseToken = partial.supabase_token;

      if (!factorId || !supabaseToken) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid partial token — missing MFA context' },
        });
      }

      // Step 1: Create a challenge (Supabase requires this before verify)
      const challengeRes = await fetch(
        `${config.supabaseUrl}/auth/v1/factors/${factorId}/challenge`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: config.supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseToken}`,
          },
        },
      );

      if (!challengeRes.ok) {
        return reply.status(401).send({
          success: false,
          error: { code: 'MFA_CHALLENGE_FAILED', message: 'Failed to initiate MFA challenge' },
        });
      }

      const challengeData = (await challengeRes.json()) as { id: string };

      // Step 2: Verify code using challenge_id
      const verifyRes = await fetch(
        `${config.supabaseUrl}/auth/v1/factors/${factorId}/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: config.supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseToken}`,
          },
          body: JSON.stringify({ challenge_id: challengeData.id, code: body.code }),
        },
      );

      if (!verifyRes.ok) {
        return reply.status(401).send({
          success: false,
          error: { code: 'MFA_INVALID', message: 'Invalid MFA code' },
        });
      }

      // Issue full-access JWT (strip MFA internals from payload)
      const { mfa_pending: _mp, supabase_token: _st, factor_id: _fi, clinician_id, ..._ } = partial;
      void _mp; void _st; void _fi; void _;

      const fullPayload: JwtPayload = {
        sub: partial.sub,
        email: partial.email,
        role: partial.role,
        org_id: partial.org_id,
      };
      const accessToken = fastify.jwt.sign(fullPayload, { expiresIn: config.jwtAccessExpiry });

      if (clinician_id) {
        await sql`UPDATE clinicians SET last_login_at = NOW() WHERE id = ${clinician_id}`;
      }

      return reply.send({
        success: true,
        data: {
          access_token: accessToken,
          clinician_id: clinician_id ?? null,
          org_id: fullPayload.org_id,
          role: 'clinician',
          user: {
            id: clinician_id ?? fullPayload.sub,
            email: fullPayload.email,
            role: 'clinician',
            org_id: fullPayload.org_id,
          },
        },
      });
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired partial token' },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /refresh — supports both clinician and patient sessions
  // ---------------------------------------------------------------------------
  fastify.post('/refresh', async (request, reply) => {
    const body = RefreshTokenSchema.parse(request.body);

    const supabaseRes = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseServiceRoleKey,
      },
      body: JSON.stringify({ refresh_token: body.refresh_token }),
    });

    if (!supabaseRes.ok) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' },
      });
    }

    const data = (await supabaseRes.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email: string };
    };

    // Clinician first
    const [clinician] = await sql<{ id: string; organisation_id: string }[]>`
      SELECT id, organisation_id FROM clinicians
      WHERE email = ${data.user.email} AND is_active = TRUE
      LIMIT 1
    `;

    if (clinician) {
      const payload: JwtPayload = {
        sub: data.user.id,
        email: data.user.email,
        role: 'clinician',
        org_id: clinician.organisation_id,
      };
      const accessToken = fastify.jwt.sign(payload, { expiresIn: config.jwtAccessExpiry });
      return reply.send({
        success: true,
        data: { access_token: accessToken, refresh_token: data.refresh_token },
      });
    }

    // Patient fallback
    const [patient] = await sql<{ id: string; organisation_id: string }[]>`
      SELECT id, organisation_id FROM patients
      WHERE email = ${data.user.email} AND is_active = TRUE
      LIMIT 1
    `;

    if (!patient) {
      return reply.status(403).send({
        success: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const payload: JwtPayload = {
      sub: patient.id,  // Use the patients table UUID, not the Supabase auth UUID
      email: data.user.email,
      role: 'patient',
      org_id: patient.organisation_id,
    };
    const accessToken = fastify.jwt.sign(payload, { expiresIn: config.jwtAccessExpiry });
    return reply.send({
      success: true,
      data: { access_token: accessToken, refresh_token: data.refresh_token },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /logout
  // ---------------------------------------------------------------------------
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    await auditLog({
      actor: request.user,
      action: 'logout',
      resourceType: 'auth',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({ success: true, data: { message: 'Logged out' } });
  });

  // ---------------------------------------------------------------------------
  // GET /me — current user profile (clinician or patient)
  // ---------------------------------------------------------------------------
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role === 'patient') {
      const [patient] = await sql<{
        id: string; first_name: string; last_name: string; email: string;
        date_of_birth: string; status: string; preferred_name: string | null;
      }[]>`
        SELECT id, first_name, last_name, email, date_of_birth, status, preferred_name
        FROM patients
        WHERE email = ${request.user.email} AND is_active = TRUE
        LIMIT 1
      `;
      if (!patient) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Patient not found' },
        });
      }
      return reply.send({ success: true, data: { ...patient, role: 'patient' } });
    }

    // Clinician
    const [clinician] = await sql<{
      id: string; first_name: string; last_name: string; title: string | null;
      role: string; npi: string | null; email: string; mfa_enabled: boolean;
    }[]>`
      SELECT id, first_name, last_name, title, role, npi, email, mfa_enabled
      FROM clinicians
      WHERE email = ${request.user.email} AND is_active = TRUE
      LIMIT 1
    `;
    if (!clinician) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Clinician not found' },
      });
    }
    return reply.send({ success: true, data: clinician });
  });
}
