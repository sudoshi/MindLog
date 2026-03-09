# Authentication System — DO NOT MODIFY

## CRITICAL: Protected Auth Components

The following authentication system is production-deployed and MUST NOT be overwritten, removed, or architecturally changed without explicit user authorization:

### Backend (apps/api/)
- `apps/api/src/routes/auth.ts` — Auth endpoints including:
  - Direct bcrypt login path (checks password_hash before Supabase fallback)
  - `POST /auth/register-demo` — Demo user registration with temp password
  - `POST /auth/change-password` — Forced password change endpoint
  - Existing Supabase auth flow (login, register invite-based, MFA, refresh) preserved
- `apps/api/src/plugins/auth.ts` — JWT plugin with must_change_password in payload
- `apps/api/src/services/messaging.ts` — sendCredentialsEmail() via Resend API

### Frontend (apps/web/)
- `apps/web/src/pages/LoginPage.tsx` — Login form with "Create Account" link to /register
- `apps/web/src/pages/RegisterPage.tsx` — Demo registration form (firstName, lastName, email, phone)
- `apps/web/src/components/ChangePasswordModal.tsx` — Non-dismissable forced password change modal
- `apps/web/src/components/AppShell.tsx` — Renders ChangePasswordModal when mustChangePassword is true
- `apps/web/src/stores/auth.ts` — Auth store with mustChangePassword state and clearMustChangePassword()

### Database Schema
- `clinicians` table includes: password_hash (text), must_change_password (boolean, default true)
- Role CHECK constraint: psychiatrist, psychologist, gp, care_coordinator, nurse, researcher, admin
- Demo users registered with role 'researcher' under org f46cc7e7-163a-4291-acc3-148044a5b232

## Dual Auth Architecture

MindLog supports TWO authentication paths — both MUST be preserved:

1. **Direct bcrypt auth** — For demo users and users with password_hash set in DB
   - Login checks password_hash first; if present, verifies with bcrypt directly
   - No Supabase dependency for these users
2. **Supabase auth** — For production users managed via Supabase
   - Falls back to Supabase when password_hash is null
   - Supports MFA (TOTP) for clinicians

## Enforced Auth Flow (MediCosts Paradigm)

1. Visitor clicks "Create Account" on login page
2. Enters: first name, last name, email, phone (optional)
3. Backend generates 12-char temp password (excludes I, l, O, 0)
4. Temp password emailed via Resend API (from: MindLog <noreply@acumenus.net>)
5. Visitor logs in with temp password (direct bcrypt path)
6. Non-dismissable ChangePasswordModal forces permanent password (min 8 chars)
7. After password change: must_change_password = false, full app access

## Rules

1. **NEVER remove the "Create Account" link from LoginPage.tsx**
2. **NEVER remove or make the ChangePasswordModal dismissable**
3. **NEVER bypass the must_change_password flow in AppShell**
4. **NEVER remove the direct bcrypt login path** — demo users depend on it
5. **NEVER remove the Supabase fallback** — production users depend on it
6. **NEVER change the email sender from noreply@acumenus.net**
7. **NEVER hardcode the Resend API key in source code** (use RESEND_API_KEY env var)
8. **NEVER remove email enumeration prevention** on register-demo endpoint
9. **NEVER weaken password requirements** (min 8 chars, bcrypt 12 rounds)
10. **NEVER remove rate limiting** on auth endpoints
11. **Superuser account** `admin@acumenus.net` must always exist with must_change_password=false
12. **If modifying auth**, preserve ALL existing endpoints — additions only
13. **NEVER remove the register-demo endpoint** — it is separate from invite-based register

## Resend Configuration
- API Key: RESEND_API_KEY in .env and apps/api/.env
- From: EMAIL_FROM env var (default: MindLog <noreply@acumenus.net>)
