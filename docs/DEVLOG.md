# MindLog — Comprehensive Development Log

**Project:** MindLog — Mental Wellness Tracking Platform
**Period:** February 2026 (v0.1a → v1.1a)
**Stack:** TypeScript monorepo — Expo SDK 52, React 19 + Vite, Fastify 5, PostgreSQL + Supabase, BullMQ, Anthropic/Ollama/MedGemma
**Status:** All 6 development phases complete; Deep AI Insights & Evidence-Based Risk Scoring shipped

---

## Table of Contents

1. [Project Genesis & Architecture Decisions](#1-project-genesis--architecture-decisions)
2. [Version 0.1a — Initial Monorepo & Foundation](#2-version-01a--initial-monorepo--foundation)
3. [Version 0.2a — Demo Environment & Auth System](#3-version-02a--demo-environment--auth-system)
4. [Version 0.3 — iOS Build Support & Push Notifications](#4-version-03--ios-build-support--push-notifications)
5. [Version 0.4a — Clinical Depth & Validated Assessments](#5-version-04a--clinical-depth--validated-assessments)
6. [Version 0.5 — Patient Registration & Onboarding](#6-version-05--patient-registration--onboarding)
7. [Version 0.6a — Admin Panel & Installer System](#7-version-06a--admin-panel--installer-system)
8. [Version 0.7a — Live Data Simulation](#8-version-07a--live-data-simulation)
9. [Version 0.8a — The Mega Release (AI, FHIR, Research, CI/CD)](#9-version-08a--the-mega-release-ai-fhir-research-cicd)
10. [Version 0.82a — Maestro E2E Testing Framework](#10-version-082a--maestro-e2e-testing-framework)
11. [Hotfix — RootLayout Stack Rendering Fix](#11-hotfix--rootlayout-stack-rendering-fix)
12. [Theme Palette System & Panel Elegance Pass](#12-theme-palette-system--panel-elegance-pass)
13. [Version 0.83a — Login Page Redesign](#13-version-083a--login-page-redesign)
14. [Version 0.9a — MedGemma Integration](#14-version-09a--medgemma-integration)
15. [Version 0.91a — AI Interactive Chat](#15-version-091a--ai-interactive-chat)
16. [Version 0.92a — Cohort Builder v2](#16-version-092a--cohort-builder-v2)
17. [Version 1.1a — Deep AI Insights & Evidence-Based Risk Scoring](#17-version-11a--deep-ai-insights--evidence-based-risk-scoring)
18. [Consolidated Architecture Reference](#18-consolidated-architecture-reference)
19. [Known Gotchas & Lessons Learned](#19-known-gotchas--lessons-learned)
20. [Appendix: Complete File Inventory](#20-appendix-complete-file-inventory)

---

## 1. Project Genesis & Architecture Decisions

### Market & Regulatory Context

MindLog targets the **US market** under **FDA (SaMD, likely Class II)** and **HIPAA** compliance requirements. This was a critical early correction — the initial scope assumed Australian regulations (TGA/Privacy Act), which would have led to different architectural choices.

Key constraints:
- **Patient age:** 18+ only (v1.0) — US state consent laws for minors are complex
- **Crisis contacts:** 988 Suicide & Crisis Lifeline, Crisis Text Line (741741)
- **Data residency:** US-based hosting required
- **AI compliance:** BAA with Anthropic OR local inference (Ollama/MedGemma)

### 10 Foundational Architecture Decisions (from DECISIONS.md)

| ID | Decision | Rationale |
|----|----------|-----------|
| OQ-001 | Server-side AES-256 journal encryption | Enables server search + clinician sharing; E2EE deferred to v2.0 |
| OQ-002 | WebSocket + Redis pub/sub for real-time | Bidirectional, horizontally scalable |
| OQ-003 | postgres.js raw SQL (no ORM) | Full control over RLS, CTEs, window functions |
| OQ-004 | Provisional alert thresholds | Engineering starting points; requires clinical sign-off before pilot |
| OQ-005 | 18+ patients only (v1.0) | Complex state consent laws for minors |
| OQ-006 | BullMQ for background jobs | Redis-backed, reliable, supports rate limiting |
| OQ-007 | AI gated behind BAA flag + env var | Prevents accidental PHI transmission; fallback heuristics |
| OQ-008 | Zustand + TanStack Query for state | Server state (TQ) vs. client state (Zustand) separation |
| OQ-009 | Shared journal = all care team members | Simplifies consent model vs. per-clinician sharing |
| OQ-010 | Org-wide + per-clinician population snapshots | Both aggregate and individual clinician views |

### Tech Stack

```
Frontend (Mobile):   Expo SDK 52, React Native, Zustand, TanStack Query v5
Frontend (Web):      React 19, Vite, Zustand, TanStack Query v5, Recharts
Backend:             Node.js 22, Fastify 5, Zod, BullMQ
Database:            PostgreSQL + Supabase Auth, postgres.js, Row-Level Security
AI:                  Anthropic Claude / Ollama (MedGemma 27B)
Testing:             Vitest, Playwright, Maestro, Jest
Infrastructure:      Docker (PostgreSQL, Redis, MailHog), GitHub Actions CI/CD, Sentry
```

### Monorepo Structure

```
mindlog/
├── apps/
│   ├── api/           # Fastify backend (Node 22)
│   ├── web/           # Clinician dashboard (React 19 + Vite)
│   └── mobile/        # Patient app (Expo SDK 52)
├── packages/
│   ├── db/            # Migrations, seeds, postgres.js client
│   └── shared/        # Types, Zod schemas, constants
├── .maestro/          # E2E test flows
└── docs/              # Documentation
```

---

## 2. Version 0.1a — Initial Monorepo & Foundation

**Commit:** `3f7dd98` — Version 0.1a

### What Was Built

The complete monorepo scaffold from scratch:

- **API (`apps/api`):** Fastify 5 server with plugin-based architecture, JWT authentication via `@fastify/jwt`, CORS, rate limiting. Route structure: health, auth, patients, daily-entries, journal, alerts, medications, sync, invites.
- **Web (`apps/web`):** React 19 + Vite clinician dashboard. Zustand auth store, TanStack Query for server state, React Router for navigation. Initial pages: Login, Dashboard, Patients list, Patient detail.
- **Mobile (`apps/mobile`):** Expo SDK 52 scaffold with file-based routing (`expo-router`), Zustand auth store, `apiFetch` service for API calls.
- **Shared (`packages/shared`):** TypeScript types for Patient, Clinician, DailyEntry, JournalEntry, Alert. Zod schemas for all API request/response bodies. Constants: `MOOD_COLORS`, `ALERT_THRESHOLDS`, `CRISIS_CONTACTS`, `LIMITS`.
- **Database (`packages/db`):** Initial migrations (001-003) creating core tables: patients, clinicians, organisations, daily_entries, journal_entries, alerts, medications, consent_records. postgres.js client with RLS context setter.

### Key Architecture Pattern: Row-Level Security

Every database query requires RLS context to be set first:

```typescript
await setRlsContext(userId, role);
const patients = await sql`SELECT * FROM patients`;
```

This ensures data isolation at the database level, not just the application level.

### Key Architecture Pattern: API Validation

All endpoints validate with Zod schemas from `@mindlog/shared`:

```typescript
const input = CreatePatientSchema.parse(req.body);
```

Single source of truth for types shared between API, web, and mobile.

### Files Created

| Scope | Count | Key Files |
|-------|-------|-----------|
| API | ~20 | `src/index.ts`, `src/routes/*.ts`, `src/middleware/*.ts` |
| Web | ~15 | `src/App.tsx`, `src/pages/*.tsx`, `src/stores/*.ts` |
| Mobile | ~10 | `app/_layout.tsx`, `app/(tabs)/*.tsx`, `services/*.ts` |
| Shared | ~5 | `src/types/index.ts`, `src/schemas/index.ts`, `src/constants.ts` |
| DB | ~5 | `migrations/001-003.sql`, `src/index.ts` |

---

## 3. Version 0.2a — Demo Environment & Auth System

**Commits:** `921acb7` (0.2alpha), `8bfb5b1` (0.2a)

### What Was Built

A complete demo environment and authentication system:

- **Demo Infrastructure:** Docker Compose for PostgreSQL, Redis, and MailHog. npm scripts: `demo:infra`, `demo:setup`, `demo:api`, `demo:web`.
- **Seed Data:** 7 clinicians, 146 patients across 4 risk cohorts (low/moderate/high/critical), 60 days of realistic daily entries, journal entries, medications, alerts.
- **Auth Flow:** Supabase Auth for identity → local PostgreSQL for app data. Login returns JWT with `sub` = `patients.id` (patients) or `clinicians.id` (clinicians).
- **Web Dashboard Wiring:** Dashboard page with real API data, patient list with search/filter, patient detail view with tabs.

### Critical Bug Fix: Patient JWT `sub`

**Problem:** Patient JWT `sub` was set to Supabase auth UUID instead of `patients.id`.
**Impact:** All patient-facing API endpoints returned 404 (RLS couldn't find the patient row).
**Fix:** Map Supabase UUID → `patients.id` during token creation in `apps/api/src/routes/auth.ts`.

**Lesson learned:** Supabase auth UUID and application entity ID are different. The JWT `sub` must match the application's primary key, not Supabase's.

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Patient | `alice@mindlogdemo.com` | `Demo@Patient1!` |
| Clinician | `dr.kim@mindlogdemo.com` | `Demo@Clinic1!` |

### Android Emulator Gotcha

Android emulator cannot reach `localhost`. Must use `10.0.2.2` as the API host in `.env.local`:

```
EXPO_PUBLIC_API_BASE=http://10.0.2.2:3000/api/v1
```

---

## 4. Version 0.3 — iOS Build Support & Push Notifications

**Commit:** `08d866b` — Version 0.3 — iOS build support, push notifications, API fixes

### What Was Built

- **iOS Build Pipeline:** `eas.json` configuration for development, preview, and production profiles. iOS-specific app.json settings (bundleIdentifier, infoPlist).
- **Push Notifications:** Expo Notifications integration in mobile app. Server-side push token registration endpoint. Alert-triggered push notification worker in BullMQ.
- **API Fixes:** Multiple endpoint corrections discovered during iOS testing — date handling, response format consistency, error message improvements.

### Key Pattern: Expo Push Notifications

```typescript
// Mobile: Register token on launch
const token = await Notifications.getExpoPushTokenAsync();
await apiFetch('/patients/me/push-token', { method: 'PUT', body: { token } });

// API: Send via Expo Push API when alert triggers
await expo.sendPushNotificationsAsync([{
  to: patient.push_token,
  title: 'Alert',
  body: alert.message,
}]);
```

---

## 5. Version 0.4a — Clinical Depth & Validated Assessments

**Commit:** `1f60637` — Version 0.4a

### What Was Built

A major clinical depth expansion:

- **Migration 004 (`expanded_daily_entry`):** 16 new clinical columns on `daily_entries`: `anxiety`, `stress`, `energy`, `focus`, `social`, `appetite`, `irritability`, `hopelessness`, `self_harm_thoughts`, `substance_use`, `psychotic_symptoms`, `rapid_thoughts`, `grandiosity`, `decreased_sleep_need`, `risk_taking`, `impulsivity`.
- **Migration 005 (`validated_assessments`):** New `validated_assessments` table supporting PHQ-9, GAD-7, ISI, C-SSRS, ASRM, WHODAS. Columns: `patient_id`, `clinician_id`, `scale`, `score`, `severity`, `item_scores`, `completed_at`, `source` (patient/clinician).
- **Migration 006 (`medical_codes`):** SNOMED CT, RxNorm, ICD-10, OMOP concept seed tables.
- **Assessments API:** `POST /assessments` (submit), `GET /assessments/me` (patient history), `GET /assessments/pending` (due assessments), `GET /assessments/:id/fhir` (FHIR R4 export).
- **Mobile Assessment Screens:** `app/assessments/[scale].tsx` — questionnaire UI for PHQ-9, GAD-7, ASRM, C-SSRS with Likert scales, auto-scoring, and submission.

### Schema Column Naming — Common Source of Bugs

The `validated_assessments` table uses specific column names that differ from what developers often assume:

| Correct Column | Common Wrong Guess |
|---------------|-------------------|
| `scale` | `scale_code` |
| `score` | `total_score` |
| `completed_at` | `assessed_at` |

Similarly, `daily_entries` uses:
| Correct | Wrong |
|---------|-------|
| `mood` | `mood_score` |
| `coping` | `coping_score` |

**Lesson learned:** Always verify column names against the migration SQL, not against what seems logical.

### Mobile Design System Established

- **Fonts:** `@expo-google-fonts/fraunces` (display headings) + `@expo-google-fonts/figtree` (body text)
- **Design Tokens:** `apps/mobile/constants/DesignTokens.ts` — COLOR, FONTS, RADIUS, SPACE, SHADOW, GRADIENT, Z_INDEX, DURATION
- **Components:** `Card.tsx` (gradient band accent), `SkeletonCard.tsx` (shimmer loading state)
- **Shared Constants:** `SCALE_LOINC_MAP` added for FHIR-compliant assessment coding

### Font Registration Names

```typescript
'Fraunces'           // Display headings
'Fraunces_Italic'    // Italic display
'Figtree'            // Body text
'Figtree_Medium'     // Medium weight body
'Figtree_SemiBold'   // Semi-bold labels
'Figtree_Bold'       // Bold emphasis
```

---

## 6. Version 0.5 — Patient Registration & Onboarding

**Commit:** `05c5555` — Version 0.5

### What Was Built

The complete patient registration and onboarding flow (V1.1 Phase 1):

- **Migration 007 (`invite_system`):** `invites` table with clinician-generated invite codes, expiry, deep link support. Added `supabase_uid`, `invite_id`, `primary_concern`, `emergency_contact_*` columns to `patients`.
- **Migration 008 (`onboarding`):** `patient_intake` table for multi-step onboarding data. Indexes on invite codes and patient lookup.
- **Invite System:** Clinician creates invite → email sent via Resend → patient opens deep link → Supabase Auth signup → intake wizard → care team auto-assignment.
- **Schemas:** `CreateInviteSchema`, `RegisterSchema`, `IntakeSchema` added to `@mindlog/shared`.
- **Messaging:** `sendInviteEmail()` and `sendWelcomeEmail()` via Resend service.
- **Mobile Onboarding:** Multi-step intake wizard collecting demographics, primary concern, emergency contact, medication list, consent acknowledgment.

### Deep Link Flow

```
Clinician creates invite
  → API generates invite code + sends email via Resend
    → Patient clicks link: mindlog://invite/{code}
      → Expo deep link handler opens registration screen
        → Supabase Auth creates account
          → API creates patient record (linked via invite_id)
            → Intake wizard collects clinical baseline
              → Care team auto-assigned from invite
```

---

## 7. Version 0.6a — Admin Panel & Installer System

**Commit:** `c471ee1` — Version 0.6a

### What Was Built

- **Admin Panel (`/admin` route):** Organisation management, user administration (clinicians + patients), audit log viewer with export, system statistics dashboard. Admin-only gate (non-admins see "Access Denied").
- **Admin API Endpoints:** `GET /admin/stats`, `GET /admin/users`, `GET /admin/audit-log`, `POST /admin/audit-log/export`.
- **Installer System:** First-run setup wizard for new deployments — creates initial organisation, admin clinician account, configures environment variables.
- **Audit Logging:** All CRUD operations logged to `audit_log` table with `occurred_at` timestamp (not `created_at`).

### Audit Log Column Gotcha

The `audit_log` table uses `occurred_at` as its timestamp column, not `created_at`. All other tables use `created_at`.

### Audit Action Types (CHECK Constraint)

```sql
CHECK (action IN ('read', 'create', 'update', 'delete', 'export',
                  'share', 'acknowledge', 'login', 'logout',
                  'consent_granted', 'consent_revoked'))
```

Note: there is no `error` action type.

---

## 8. Version 0.7a — Live Data Simulation

**Commit:** `96f78e7` — Version 0.7a

### What Was Built

An automated live data simulation system that generates realistic patient activity every 8 hours (6am, 2pm, 10pm) to maintain a convincing demo environment.

### Simulation Parameters by Risk Level

| Parameter | Low | Moderate | High | Critical |
|-----------|-----|----------|------|----------|
| Check-in probability | 95% | 80% | 65% | 50% |
| Mood range | 7–10 | 4–8 | 3–6 | 2–5 |
| Med adherence | 92% | 78% | 65% | 50% |
| Symptom reporting | 10% | 40% | 70% | 90% |
| Journal probability | 30% | 40% | 50% | 60% |

### Data Correlation Model

The simulation generates correlated data to ensure clinical realism:
- Sleep quality affects next-day mood (+/- 0.5)
- Exercise boosts mood (+0.3)
- High symptom count depresses mood (-0.4)
- Trigger presence depresses mood (-0.2)
- Day-of-week modifiers: Monday -0.3, Friday +0.2, Saturday +0.5
- Time distribution: 35% morning, 25% afternoon, 40% evening

### Clinical Response Simulation

- Alert acknowledgment: 80% critical within 4h, 60% warning within 8h, 40% info within 24h
- Clinical notes generated for acknowledged alerts
- Risk level reassessment after significant score changes
- Safety event handling for critical patients

### Implementation

`packages/db/src/live-simulation.ts` (~750 lines). Idempotent operations, demo-only safety checks.

```bash
# Cron setup
0 6,14,22 * * * cd /path/to/MindLog && npm run db:simulate
```

---

## 9. Version 0.8a — The Mega Release (AI, FHIR, Research, CI/CD)

**Commit:** `78985a1` — Version 0.8a

This was the largest single release, shipping V1.1 Phases 2–6 simultaneously. It included voice transcription, health data sync, AI-powered clinical intelligence, FHIR R4 interoperability, research export infrastructure, CI/CD, and monitoring.

### Phase 2: Mobile Clinical Depth

**Voice Transcription:**
- `apps/api/src/routes/voice/index.ts` — `POST /voice/transcribe` using OpenAI Whisper
- `apps/mobile/components/VoiceRecorder.tsx` — animated waveform, start/stop, upload
- Rate limited: 5 transcriptions per hour per patient
- `@fastify/multipart` for audio file upload

**Health Data Sync:**
- `packages/db/migrations/009_passive_health.sql` — `passive_health_snapshots` table
- `apps/api/src/routes/health-data/index.ts` — `POST /health-data/sync`, `GET /health-data/me`
- `apps/mobile/services/healthData.ts` — HealthKit (iOS) + Health Connect (Android)
- Step count, heart rate, sleep analysis, active energy

**Dark Mode & Accessibility:**
- `apps/mobile/hooks/useColorScheme.ts` — custom hook wrapping RN useColorScheme + SecureStore override
- `apps/mobile/constants/DesignTokens.ts` — `DARK_TOKENS` + `LIGHT_TOKENS` exports
- `apps/mobile/utils/a11y.ts` — WCAG 2.1 AA accessibility label helpers

**Important:** The custom `useColorScheme` hook returns an object (`{ isDark, scheme, preference, setOverride }`), NOT a string like React Native's built-in. All components must use `useColorScheme().scheme`.

### Phase 3: AI-Powered Clinical Intelligence

**Risk Scoring Engine:**
`apps/api/src/services/riskScoring.ts` — 7-factor composite score:

| Factor | Weight | Source |
|--------|--------|--------|
| C-SSRS (suicidal ideation) | 35% | Latest assessment |
| PHQ-9 (depression) | 20% | Latest assessment |
| Mood streak (declining trend) | 15% | Last 7 daily entries |
| Missed check-ins | 10% | Last 14 days |
| ASRM (mania) | 10% | Latest assessment |
| Medication non-adherence | 5% | Last 7 daily entries |
| Social anhedonia | 5% | Daily entry social score |

**Database:**
- `packages/db/migrations/010_ai_insights.sql` — `patient_ai_insights` + `ai_usage_log` tables
- `packages/db/migrations/011_search_risk_score.sql` — `risk_score` columns on `patients` + GIN tsvector on `clinician_notes`

**AI Gateway:**
`apps/api/src/middleware/aiGate.ts` — preHandler that blocks AI routes unless:
- `AI_INSIGHTS_ENABLED=true` in env
- `ANTHROPIC_BAA_SIGNED=true` in env (skipped when `AI_PROVIDER=ollama`)

**BullMQ Worker:**
`apps/api/src/workers/ai-insights-worker.ts` — 4 job types:
1. Weekly clinical summary
2. Anomaly detection (score spike/drop)
3. Journal sentiment analysis (RULE-008)
4. Treatment response prediction

**Frontend:**
- Mobile: `AiInsightsSection` + `RiskGauge` components in Insights tab
- Web: `AiInsightsTab` in `PatientDetailPage.tsx` with factor breakdown + narrative

### Phase 4: EHR Interoperability & FHIR R4

**FHIR R4 Mappers:**
`apps/api/src/services/fhir/mappers.ts` — Pure functions mapping MindLog entities to FHIR R4 resources:
- Patient, Observation, MedicationRequest, QuestionnaireResponse, Condition, Consent, Bundle, CapabilityStatement

**FHIR Validator:**
`apps/api/src/services/fhir/validator.ts` — Lightweight structural validation + OperationOutcome builder.

**9 FHIR Endpoints:**
Under `/api/v1/fhir`:
- `GET /metadata` — CapabilityStatement
- `GET /Patient/:id` — Patient resource
- `GET /Patient/:id/$everything` — Patient bundle
- `GET /Observation` — Observations (mood, sleep, etc.)
- `GET /MedicationRequest` — Active medications
- `GET /QuestionnaireResponse` — Assessment results
- `GET /Condition` — Diagnoses
- `GET /CarePlan` — Safety plans
- `GET /Consent` — Consent records

Content-Type: `application/fhir+json; fhirVersion=4.0`

**CDA R2 Generator:**
`apps/api/src/services/cdaGenerator.ts` — XML clinical handover document with 8 sections. Used for traditional EHR export.

**Crisis Safety Plans:**
- `packages/db/migrations/013_crisis_safety_plan.sql` — `crisis_safety_plans` table (Stanley-Brown model)
- API endpoints: PUT/GET/history, patient sign

**Research Exports:**
- `packages/db/migrations/012_research_exports.sql` — `research_exports` + `cohort_definitions` tables
- Safe Harbour de-identification worker (BullMQ)
- API routes for creating/managing research export jobs

### Phase 5: Web Dashboard Intelligence

- Population breakdown analytics
- Global search with patient, clinician, and note results
- Assessment request workflow
- Trends page enhancements with comparison overlays
- Quick Note panel for rapid clinical notes
- Keyboard shortcuts (`?` for help, `⌘K` for search)
- Cohort page (v1 — flat filters, precursor to v2)

### Phase 6: Infrastructure, Testing & Compliance

- **CI/CD:** GitHub Actions — lint, test-api, test-web, test-mobile, deploy stages
- **Monitoring:** Sentry error monitoring with PII stripping via `beforeSend`
- **HIPAA:** Audit plugin for Fastify (logs all requests), rate limiting, security headers
- **Security:** `security.yml` with vulnerability reporting guidelines

### TypeScript Strictness Fixes

All three apps (api, web, mobile) were brought to 0 TypeScript errors with strict mode:
- `exactOptionalPropertyTypes` — required conditional spreads instead of `undefined` values
- `noUncheckedIndexedAccess` — explicit `undefined` checks on array/object access
- `verbatimModuleSyntax` — required `import type` for type-only imports
- `@fastify/jwt` augmentation — module declaration for decoded token shape
- `Buffer → BodyInit` cast — `new Uint8Array(buf) as unknown as BodyInit` for fetch body

### API tsconfig.json Paths Gotcha

TypeScript `paths` in `apps/api/tsconfig.json` must point to `dist/*.d.ts`, NOT `src/*.ts`:

```json
{
  "paths": {
    "@mindlog/shared": ["../../packages/shared/dist/index.d.ts"],
    "@mindlog/db": ["../../packages/db/dist/index.d.ts"]
  }
}
```

Source paths cause `rootDir` errors because tsc tries to include files outside the project root.

---

## 10. Version 0.82a — Maestro E2E Testing Framework

**Commit:** `be09748` — Version 0.82a

### What Was Built

A comprehensive mobile E2E testing suite using **Maestro** (YAML-based, no code compilation required):

- **46 test flows** across **14 categories**
- Located in `.maestro/` directory
- Covers: authentication, onboarding, daily check-in, journal, medications, assessments, insights, settings, crisis safety, notifications, offline mode, accessibility, deep links, edge cases

### Test Architecture

```
.maestro/
├── config.yaml          # Global config (app ID, timeouts)
├── auth/                # Login, logout, MFA, biometric
├── onboarding/          # Intake wizard, consent, demographics
├── checkin/             # Daily entry flow, skip steps, edit
├── journal/             # Create, edit, share, voice input
├── medications/         # Add, edit, adherence toggle
├── assessments/         # PHQ-9, GAD-7, ASRM, C-SSRS flows
├── insights/            # AI insights, risk gauge, correlations
├── settings/            # Profile, notifications, dark mode
├── crisis/              # Safety plan, crisis modal, 988 link
├── notifications/       # Push token, alert handling
├── offline/             # Queue entries, sync on reconnect
├── accessibility/       # VoiceOver labels, contrast, tap targets
├── deeplinks/           # Invite links, notification deep links
└── edge-cases/          # Network errors, token expiry, large data
```

### Running Tests

```bash
maestro test .maestro/           # Run all flows
maestro test .maestro/auth/      # Run auth flows only
maestro cloud .maestro/          # Run on Maestro Cloud
```

---

## 11. Hotfix — RootLayout Stack Rendering Fix

**Commit:** `f7fdc77` — Fix RootLayout to render Stack on first frame for Expo Router SDK 52

### The Bug

`router.replace()` called before `<Stack>` was mounted silently dropped the navigation, resulting in a blank white screen on app launch.

### Root Cause

In `apps/mobile/app/_layout.tsx`, the auth bootstrap logic called `router.replace()` before `setReady(true)`, which meant the `<Stack>` component hadn't mounted yet. Expo Router SDK 52 requires the Stack to be rendered on the very first frame.

### The Fix

Restructured the layout to always render `<Stack>` immediately, using `useEffect` to defer navigation until after mount:

```typescript
// BEFORE (broken): conditional rendering delayed Stack
if (!ready) return <SplashScreen />;
return <Stack />;

// AFTER (fixed): Stack always renders, navigation deferred
return (
  <Stack>
    {/* Stack mounts on first frame */}
  </Stack>
);
// useEffect handles navigation after mount
```

**Lesson learned:** In Expo Router SDK 52, `router.replace()` must be called AFTER `setReady(true)` and the `<Stack>` must render on the first frame. Never conditionally render the root navigator.

---

## 12. Theme Palette System & Panel Elegance Pass

**Commit:** `0cf54ae` — Add theme palette system and panel elegance/legibility fixes

### Theme Palettes

Five clinician-selectable dark theme palettes added to the web dashboard:

1. **Midnight** (default) — Deep navy/slate `#0c0f18`
2. **Charcoal** — Warm grey tones
3. **Ocean** — Deep blue-green
4. **Forest** — Dark green
5. **Plum** — Deep purple

Each palette defines CSS custom properties for all color tokens (`--bg`, `--bg-elevated`, `--ink`, `--ink-mid`, `--border`, etc.). Palette selection stored in `localStorage` and applied via `data-palette` attribute on `<html>`.

### Panel Elegance & Legibility Fixes

A comprehensive visual pass across the web dashboard:

**Gradient tokens** added to `tokens-dark.css`:
- `--gradient-panel` — subtle vertical gradient for panel backgrounds
- `--gradient-panel-raised` — slightly lighter for elevated panels
- `--gradient-panel-inset` — darker for inset/nested panels

**14 CSS selectors** received background-image gradients across `cards.css`, `theme.css`, `theme-legacy-backup.css`.

**Shimmer highlight:** `.panel::before`, `.metric-card::before` — 1px top-edge gradient for depth.

**Padding standardisation:**

| Tier | Value | Usage |
|------|-------|-------|
| Compact | 16px | Tight lists, sidebar items |
| Standard | 20px | Cards, metric panels |
| Spacious | 24px | Detail headers, hero sections |
| Empty | 48px | Empty states, placeholders |

**Minimum font size 12px** enforced across DashboardPage.tsx (3 fixes) and QuickNotePanel.tsx (5 fixes). Exception: uppercase labels with letter-spacing (allowed at 11px).

---

## 13. Version 0.83a — Login Page Redesign

**Commit:** `ddb9906` — Version 0.83a

### What Was Built

A redesigned login page for the web dashboard:

- **Split layout:** Left panel with branding/illustration, right panel with login form
- **Animated transitions:** Fade-in on load, smooth field focus states
- **MFA support:** TOTP input field with auto-advance
- **Password reset flow:** Inline "Forgot password?" → email input → confirmation
- **Responsive:** Collapses to single column on mobile viewport
- **Palette-aware:** Respects the selected theme palette

### CSS Architecture

Login-specific styles in `apps/web/src/styles/pages/login.css` — isolated from global styles to prevent leakage. Uses CSS custom properties from the palette system.

---

## 14. Version 0.9a — MedGemma Integration

**Commit:** `87890d1` — Version 0.9a MedGemma Integration

### What Was Built

Provider-agnostic AI inference supporting both Anthropic Claude (cloud) and Ollama/MedGemma (local).

### Architecture

Single abstraction in `apps/api/src/services/llmClient.ts`:

```
AI_PROVIDER=anthropic  →  Anthropic API (claude-sonnet-4-6)
AI_PROVIDER=ollama     →  Ollama local API (MedGemma 27B)
```

Both use the same `generateCompletion()` / `generateChat()` interface. The AI gateway middleware (`aiGate.ts`) skips the BAA check when `AI_PROVIDER=ollama` since no PHI leaves the machine.

### Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull MedGemma 27B
ollama pull alibayram/medgemma:27b

# Dev/testing model (much smaller)
ollama pull llama3.2:1b
```

### GPU Acceleration — Critical for Usability

| Mode | Speed | Usability |
|------|-------|-----------|
| CPU (llama3.2:1b) | ~0.1 tok/s (52s per response) | Unusable |
| GPU Vulkan (llama3.2:1b) | ~31.7 tok/s (0.13s per response) | Practical |

For AMD GPUs (e.g., Radeon 7900 XTX), Vulkan is the correct acceleration path, NOT ROCm (which requires LTS Ubuntu):

```bash
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_VULKAN=1"
```

### Compliance Advantage

Local inference via Ollama means:
- No PHI transmitted to third parties
- No BAA required
- $0 inference cost
- Patient consent for AI still required (clinical governance)

### Environment Configuration

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=alibayram/medgemma:27b
```

### Known Gotcha: `.env` Reload

Node's `--env-file` flag loads environment variables at startup only. The `--watch` flag reloads on `.ts` file changes but does NOT reload `.env` changes. You must manually restart the API server after changing `.env`.

---

## 15. Version 0.91a — AI Interactive Chat

**Commit:** `78d0f73` — Version 0.91a

### What Was Built

Interactive AI chat on the clinician dashboard's AI Insights tab. The tab splits into two columns:

- **Left panel (420px):** Condensed risk score card, risk factor grid, latest insight summary (expandable), Generate Insight button, HIPAA disclaimer
- **Right panel (flex):** Full chat interface with discussion selector, message history, auto-growing textarea, "Thinking..." indicator, per-message timestamps

### Database

`packages/db/migrations/014_ai_discussions.sql`:
- `ai_discussions` — conversation containers (patient_id, clinician_id, title, created_at, updated_at)
- `ai_discussion_messages` — individual messages (discussion_id, role, content, created_at)

### API Endpoints

All under `/api/v1/insights`, gated by `authenticate` + `aiGate` + care-team membership:

- **`POST /:patientId/ai/chat`** — Synchronous chat. Creates discussion if needed. Full conversation history + 30-day clinical snapshot sent to LLM each turn.
- **`GET /:patientId/ai/discussions`** — List discussions (most recent first)
- **`GET /:patientId/ai/discussions/:discussionId`** — Full discussion with all messages

### Clinical Snapshot RAG Pattern

Each chat turn injects a real-time clinical context via 7 SQL queries:

1. Patient demographics + risk score
2. Last 30 days of daily entries (mood, anxiety, sleep trends)
3. Latest validated assessments (PHQ-9, GAD-7, ASRM scores)
4. Active medications
5. Recent journal entries (shared ones only)
6. Active diagnoses
7. Safety plan status

This context is formatted as a structured system prompt, ensuring the LLM always reasons from current clinical data rather than hallucinating.

### Architecture Decision: Synchronous Chat

Chat is NOT queued via BullMQ — it's synchronous request/response. Rationale:
- Clinicians expect immediate responses
- BullMQ would add complexity (polling, status endpoint) for marginal benefit
- Latency with local Ollama/MedGemma is already acceptable (~2s with GPU)

### Bugs Fixed During Integration

1. **`consent_records.granted_at`** — 5 queries used `created_at` (wrong column name)
2. **`validated_assessments` columns** — worker used `scale_code`/`total_score`/`assessed_at` instead of `scale`/`score`/`completed_at`
3. **Migrations 010/011 not applied** — demo seed only runs through migration 008
4. **No AI consent records seeded** — all AI endpoints rejected every patient
5. **Dr. Kim care team scope** — only on 21/146 patients (added to all via enrichment script)
6. **Ollama models not pulled** — fresh install had no models
7. **`.env` not reloaded by `--watch`** — required manual API restart

### Demo Data Enrichment

`packages/db/seeds/009_demo_enrichment.sql` — run AFTER `npm run db:seed-demo`:

```bash
PGPASSWORD=acumenus psql -h localhost -p 5432 -U smudoshi -d mindlogdemo \
  < packages/db/seeds/009_demo_enrichment.sql
```

Creates:
- Admin role for `np.zhang@mindlogdemo.com` + adds to all 146 care teams
- Backfills 16 clinical fields in all `daily_entries`
- 1,224 validated assessments (PHQ-9 ×584, GAD-7 ×584, ASRM ×56)
- 218 patient diagnoses, 415 appointments
- 210 updated population snapshots

**PostgreSQL ROUND() gotcha:** `ROUND(x, n)` requires `numeric` type — must cast: `ROUND((expr)::numeric, n)`.

---

## 16. Version 0.92a — Cohort Builder v2

**Status:** In progress (uncommitted)

### What Was Built

A complete rewrite of the cohort system from flat v1 filters to a recursive AND/OR filter DSL with materialized view backend.

**Before (v1):** Flat `{ risk_levels: ['high'], active_only: true }`, no sorting, no export, no analytics.

**After (v2):**
- Recursive filter groups with AND/OR logic (max depth 2)
- 18 filterable fields across 5 categories
- Live count preview (debounced 500ms)
- Paginated patient results (50/page) with 6 sortable columns
- Risk/gender analytics charts (Recharts)
- Point-in-time snapshots (30-snapshot history per cohort)
- Save/load cohorts with color picker + pinning
- CSV export with actual filter data

### Database

**Migration 015 (`cohort_v2`):**

```sql
-- Point-in-time snapshot table
CREATE TABLE cohort_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  patient_count INT NOT NULL,
  avg_mood NUMERIC(4,2), avg_phq9 NUMERIC(4,2), avg_gad7 NUMERIC(4,2),
  risk_distribution JSONB, avg_tracking_streak NUMERIC(6,2),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Materialized view: 96 columns pre-computed per patient
CREATE MATERIALIZED VIEW mv_patient_cohort_stats AS
  SELECT p.id AS patient_id, p.organisation_id, p.first_name, p.last_name,
         p.risk_level, p.status, p.gender, p.age, ...
         -- 30-day aggregates from daily_entries
         -- Latest assessment scores from validated_assessments
         -- Active medication count, diagnosis codes
  FROM patients p LEFT JOIN ... GROUP BY ...;

-- Adds filter_version, is_pinned, color columns to cohort_definitions
```

### Query Engine

`apps/api/src/services/cohortQueryEngine.ts` — converts filter DSL → parameterized postgres.js SQL:

**Security model:**
1. **Whitelist-only field access** — `FIELD_MAP` maps allowed field names to column expressions
2. **All values parameterized** — via postgres.js template literals (no string interpolation)
3. **`sql.unsafe()` only for hardcoded column names** — from the whitelist, not user input
4. **Depth-limited recursion** — max 2 levels of nesting

**18 filterable fields:**

| Category | Fields |
|----------|--------|
| Demographics | age, gender, status, is_active, app_installed, onboarding_complete |
| Risk & Engagement | risk_level, tracking_streak |
| Assessments | latest_phq9, latest_gad7, latest_asrm |
| 30-Day Aggregates | avg_mood_30d, avg_coping_30d, avg_stress_30d, avg_anxiety_30d, checkins_30d |
| Clinical | active_med_count, diagnosis_codes |

**Operators:** eq, neq, gt, gte, lt, lte, in, contains (for arrays)

### API Endpoints

8 endpoints under `/api/v1/research`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/cohorts/query` | Execute full query (patients + aggregates + pagination) |
| POST | `/cohorts/count` | Live count preview |
| POST | `/cohorts/v2` | Create v2 cohort |
| PUT | `/cohorts/:id` | Update cohort |
| DELETE | `/cohorts/:id` | Delete cohort |
| GET | `/cohorts/:id/stats` | Aggregate stats for a cohort |
| POST | `/cohorts/:id/snapshot` | Capture point-in-time snapshot |
| POST | `/admin/refresh-cohort-mv` | Refresh materialized view |

### Frontend Components

**`CohortFilterBuilder`** — Recursive filter group editor:
- Categorized field catalog (5 categories, 18 fields)
- Operator selector (contextual per field type)
- ICD-10 autocomplete for `diagnosis_codes`
- Add rule / add nested group / remove buttons
- Live count badge (debounced 500ms)
- "Run Query" button

**`CohortResultsPanel`** — Three-tab results display:
1. **Patient List:** Sortable table with 8 columns, pagination controls
2. **Analytics:** Recharts bar charts for risk distribution and gender distribution, aggregate score averages
3. **Export:** CSV export with filter data

**`CohortPage`** — State container:
- Two-column layout (380px filter sidebar + flex results)
- Saved cohorts list with color dots, v2 badge, snapshot button
- Save/update form with color picker
- v1 backward compatibility (flat filters → AND group conversion)

### Shared Types (Zod)

```typescript
const FilterOpSchema = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);

const CohortFilterRuleSchema = z.object({
  field: z.string(),
  op: FilterOpSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

const CohortFilterGroupSchema: z.ZodType<CohortFilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    rules: z.array(z.union([CohortFilterRuleSchema, CohortFilterGroupSchema])),
  })
);
```

### Bugs Fixed

1. **Missing columns in cohort list SELECT:** `GET /research/` was missing `filter_version`, `color`, `is_pinned` from the SQL query. Frontend checks `filter_version === 2` for v2 badge display and uses `color` for the color dot.

2. **Response shape mismatch:** API returns `{ data: { items: [...], total, ... } }` but frontend was typed as `SavedCohort[]`. After `api.ts` auto-unwraps `.data`, the component received the paginated wrapper object, not the array.

   ```typescript
   // BEFORE (broken):
   api.get<SavedCohort[]>('/research/', token).then(setSavedCohorts)

   // AFTER (fixed):
   api.get<{ items: SavedCohort[] }>('/research/', token).then(res => setSavedCohorts(res.items))
   ```

3. **Export tab empty filters:** `ExportTab` sent `{ filters: {} }` (hardcoded) instead of actual filter group. Fixed by threading `filterGroup` prop through `CohortPage → CohortResultsPanel → ExportTab`.

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Materialized view over real-time joins | Sub-second queries; accept ~daily staleness |
| Recursive Zod schema with `z.lazy()` | Enables nested AND/OR groups in shared types |
| Snapshots for trends | Don't re-run historical queries; capture point-in-time |
| Clinician access (not admin-only) | All care team clinicians can build and share cohorts |
| v1 backward compatibility | Existing saved cohorts auto-convert to v2 AND groups |
| Parallel SQL execution | 3 Promise.all queries (patients + aggregates + count) |
| Depth limit = 2 | Prevents unbounded recursion; sufficient for clinical use |

---

## 17. Version 1.1a — Deep AI Insights & Evidence-Based Risk Scoring

**Date:** 2026-02-24
**Status:** Complete — typecheck 0 errors, build passes

### Motivation

The previous AI Insights panel (shipped in v0.8a/v0.91a) had significant limitations that reduced its clinical utility:

1. **Binary risk scoring** — 7 rules that either fired (full weight) or didn't. A patient scoring 2/5 on C-SSRS (passive ideation) received the same +35 points as 5/5 (active ideation with plan and intent). No graduated signal.
2. **No longitudinal tracking** — risk scores were computed and stored on the `patients` table as a single snapshot. No history. No ability to see whether a patient was trending better or worse over weeks.
3. **Shallow clinical snapshots** — LLM prompts contained only basic mood/sleep/coping averages. No assessment trajectories, no cross-domain correlations, no medication detail, no passive health integration.
4. **Manual-only generation** — insights were only created when a clinician clicked "Generate Insight." No nightly automation. No proactive detection.
5. **Flat UI** — a horizontal bar gauge, a 2×2 grid of fired/not-fired factor cards, and a collapsible narrative block. No domain grouping, no trajectory visualization, no structured findings display.

### What Changed

This release replaces the entire risk scoring + insight generation + UI pipeline with an evidence-based system grounded in the latest psychiatric literature.

### Phase 1: Database Migration (017)

**File:** `packages/db/migrations/017_deep_insights.sql`

```sql
-- New columns on patient_ai_insights
ALTER TABLE patient_ai_insights
  ADD COLUMN IF NOT EXISTS structured_findings JSONB,
  ADD COLUMN IF NOT EXISTS clinical_trajectory TEXT
    CHECK (clinical_trajectory IN ('improving', 'stable', 'declining', 'acute'));

-- Expand insight_type CHECK to allow new job type
ALTER TABLE patient_ai_insights
  DROP CONSTRAINT IF EXISTS patient_ai_insights_insight_type_check;
ALTER TABLE patient_ai_insights
  ADD CONSTRAINT patient_ai_insights_insight_type_check
    CHECK (insight_type IN ('weekly_summary','trend_narrative','detect_anomaly',
                            'risk_stratification','nightly_deep_analysis'));

-- Longitudinal risk score tracking
CREATE TABLE IF NOT EXISTS patient_risk_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  score       SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
  band        TEXT        NOT NULL CHECK (band IN ('low','moderate','high','critical')),
  factors     JSONB       NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_risk_history_patient_date
  ON patient_risk_history (patient_id, computed_at DESC);

-- Performance index for "new data since last insight" queries
CREATE INDEX IF NOT EXISTS idx_daily_entries_patient_submitted
  ON daily_entries (patient_id, submitted_at DESC);
```

**Design decisions:**

- `patient_risk_history` is write-append. Each nightly risk computation writes a new row. No updates, no deletes. This creates a clean longitudinal record suitable for sparkline rendering and clinical audit.
- `structured_findings JSONB` stores the full LLM output (domain findings, early warnings, treatment response, recommended focus). The `narrative` column remains for backward compatibility and legacy display.
- `clinical_trajectory` is an enum-like CHECK constraint (`improving`/`stable`/`declining`/`acute`), not a free-text field. This ensures the UI can reliably render trajectory badges without parsing.
- The `daily_entries` index supports the nightly scheduler's `EXISTS` subquery that checks whether a patient has new data since their last deep analysis — turning an O(n) scan into an indexed lookup.

### Phase 2: Graduated Risk Scoring Engine

**File:** `apps/api/src/services/riskScoring.ts` — complete rewrite

#### Architecture: Over-Allocation with Capping

The previous system was binary: each rule contributed its full weight or zero. The new system uses **graduated contributions** — a rule may contribute anywhere from 0 to its maximum weight, based on severity, recency, and trend.

Maximum possible raw score is **132**, deliberately over-allocated and capped at **100**. This over-allocation ensures patients with multiple co-occurring moderate risks are properly flagged at the critical level. For example, a patient with moderate PHQ-9 (10 pts), moderate C-SSRS (10 pts), medication non-adherence (5 pts), social withdrawal (5 pts), poor sleep (4 pts), and anxiety (3 pts) scores 37/100 — appropriately "moderate" even though no single factor is alarming.

#### Extended `RiskFactor` Interface

```typescript
interface RiskFactor {
  rule:         string;       // e.g. 'CSSRS_GRADUATED'
  label:        string;       // "C-SSRS Ideation"
  domain:       RiskDomain;   // 'safety' | 'mood' | 'engagement' | 'physical' | 'medication'
  weight:       number;       // max possible contribution (e.g. 35)
  contribution: number;       // actual graduated score (e.g. 10)
  fired:        boolean;      // backward compat: true if contribution > 0
  value:        unknown;      // raw data (for tooltips)
  detail:       string;       // "Level 2 ideation (8d ago, 0.8× recency)"
}
```

The `domain` field is new — it enables the UI to group factors into collapsible sections (Safety, Mood, Engagement, Physical, Medication) instead of a flat grid.

#### 10 Graduated Rules

| # | Rule | Max | Domain | Graduation Logic | Literature |
|---|------|-----|--------|------------------|------------|
| R01 | C-SSRS Ideation | 35 | safety | Level 1-2 → 10, Level 3 → 25, Level 4-5 → 35. Recency decay: 48h = 1.0×, 7d = 0.8×, 14d = 0.6×, >14d = 0.4× | OR 1.5–6.9 per ideation level (Columbia validation studies) |
| R02 | PHQ-9 + Trajectory | 20 | mood | Severity: 10-14 → 5, 15-19 → 10, 20+ → 15. Deterioration bonus: +5 if ≥5pt increase from prior assessment | MCID = 5 pts (Jacobson-Truax methodology) |
| R03 | Low Mood Streak | 15 | mood | 3 consecutive days mood ≤ 3 → 10, 5d → 13, 7d+ → 15 | Digital phenotyping evidence (sustained low mood as prodromal marker) |
| R04 | Engagement | 12 | engagement | 3 missed check-ins → 5, 5+ → 10. Declining week-over-week trend → +2 bonus | Post-discharge disengagement is highest-risk window |
| R05 | ASRM Mania | 10 | mood | 6-9 → 5, 10-13 → 8, 14+ → 10 | Sensitivity 85.5% at cutoff 6 (Altman self-rating) |
| R06 | Med Non-Adherence | 10 | medication | 2d missed → 2, 3-4d → 5, 5+d → 8. Consecutive 3d+ streak → +2 bonus | AOR 3.09 for relapse (non-adherence meta-analysis) |
| R07 | Social Withdrawal | 8 | engagement | Avoidance alone → 3, + anhedonia → 5, acute (5/7 days) → 8 | Dose-response relationship with SI in MDD studies |
| R08 | Sleep Disruption | 7 | physical | < 5h for 3+/7 nights → 4, quality ≤ 2 for 4+/7 nights → +3, cap at 7 | OR 2.10–3.0 for SI/attempt (sleep disruption meta-analysis) |
| R09 | GAD-7 Anxiety | 7 | mood | 10-14 → 3, 15+ → 5. Deterioration bonus: +2 if ≥5pt increase from prior | Comorbid anxiety amplifies depression risk and treatment resistance |
| R10 | PHQ-9 Item 9 (SI) | 8 | safety | q9=1 → 3, q9=2 → 5, q9=3 → 8 (from `item_responses->>'q9'`) | Direct SI screening — captured from the self-report instrument |
| | **Total** | **132** | | **Capped at 100** | |

**New rules vs. previous system:**

- R08 (Sleep Disruption), R09 (GAD-7 Anxiety), and R10 (PHQ-9 Item 9) are entirely new. The old system had 7 binary rules; the new system has 10 graduated rules.
- Every rule now produces a `detail` string explaining the graduation (e.g., "Level 2 ideation, 8 days ago, 0.8× recency factor → 8 of 35"). This powers the expanded UI tooltips.

#### `persistRiskScore` — Dual Write

Risk scores are now written to **two destinations**:

1. `patients` table — `risk_score`, `risk_score_factors` JSONB, `risk_level`, `risk_score_updated_at` (same as before — powers the patient list view)
2. `patient_risk_history` table — `score`, `band`, `factors` JSONB, `computed_at` (new — powers longitudinal sparklines)

This dual-write ensures backward compatibility (everything that previously read `patients.risk_score` still works) while enabling the new trajectory features.

### Phase 3A: Enriched Clinical Snapshot & Deep Analysis

**File:** `apps/api/src/workers/ai-insights-worker.ts`

#### New `EnrichedClinicalSnapshot` Interface

The previous `ClinicalSnapshot` provided 12 fields (basic mood/sleep/coping averages, top triggers, recent assessments). The new `EnrichedClinicalSnapshot` extends it with:

| Field | Source | Purpose |
|-------|--------|---------|
| `phq9_trajectory` | Last 3 PHQ-9 scores with deltas | Depression trend detection |
| `gad7_trajectory` | Last 3 GAD-7 scores with deltas | Anxiety trend detection |
| `asrm_trajectory` | Last 3 ASRM scores with deltas | Mania monitoring |
| `sleep_pattern` | 7-day avg hours, variability, quality, short nights, trend | Sleep quality assessment |
| `passive_health` | Avg steps, step trend, HRV, resting HR | Behavioral activation markers |
| `med_adherence_detail` | Per-medication rates, longest miss streak | Medication-specific compliance |
| `social_trend` | Avg social score, avoidance days, trend | Social functioning trajectory |
| `correlations` | Sleep→mood and exercise→mood (PostgreSQL `CORR()`) | Cross-domain pattern detection |
| `prior_insight_summary` | First 200 chars of most recent insight narrative | Continuity of clinical reasoning |
| `risk_factors` | Active graduated factors with details | Evidence basis for risk assessment |

`buildEnrichedClinicalSnapshot()` calls the base `buildClinicalSnapshot()` for core fields, then runs **10 parallel SQL queries** via `Promise.all()` for the enrichment fields. This keeps latency manageable (~200ms total for a patient with 60 days of data).

#### Deep Analysis Prompt

`buildDeepAnalysisPrompt()` generates a comprehensive structured prompt requesting a JSON response with:

- `clinical_trajectory` — `improving`/`stable`/`declining`/`acute` + rationale
- `narrative` — 3–5 paragraph clinical narrative
- `key_findings` — 4–8 items, max 20 words each
- `domain_findings` — per-domain summaries (mood, sleep, anxiety, social, medications)
- `early_warnings` — prodromal signals with urgency level + domain
- `treatment_response` — assessment of treatment effectiveness
- `recommended_focus` — 2–4 prioritized areas with rationale
- `cross_domain_patterns` — observed cross-domain correlations

The prompt uses `maxTokens: 2048` (vs 1024 for weekly summaries), `temperature: 0.2` (lower than the 0.3 used for weekly summaries — favoring factual precision over creative expression), and `jsonMode: true`.

#### Updated Job Processor

The `processAiInsightJob` function now branches on `nightly_deep_analysis`:

- Uses `buildEnrichedClinicalSnapshot(patientId, 30)` instead of `buildClinicalSnapshot(patientId, 7)`
- Passes the enriched snapshot to `runInference()`
- Extracts `structured_findings` and `clinical_trajectory` from the parsed response
- Stores both in the new columns via the updated INSERT statement

### Phase 3B: Nightly Scheduler Fix + Deep Analysis Fan-out

**File:** `apps/api/src/workers/nightly-scheduler.ts`

#### Bug Fix: Ollama Gate

**Before (line 253):**
```typescript
if (config.aiInsightsEnabled && config.anthropicBaaSigned) {
```

**After:**
```typescript
if (config.aiInsightsEnabled && (config.aiProvider === 'ollama' || config.anthropicBaaSigned)) {
```

This bug meant that nightly AI summaries **never ran** when using Ollama as the AI provider. The gate required `anthropicBaaSigned` even though Ollama doesn't need a BAA (local inference, no PHI transmission). The same fix was applied to the new Step 5B gate.

#### New Step 5B: Nightly Deep Analysis Fan-out

After the existing weekly summary fan-out (Step 5), a new step fans out `nightly_deep_analysis` jobs for all consented active patients who have **new data since their last deep analysis**. The key optimization is an efficient `EXISTS` subquery:

```sql
WHERE p.status = 'active'
  AND EXISTS (
    SELECT 1 FROM daily_entries de
    WHERE de.patient_id = p.id
      AND de.submitted_at IS NOT NULL
      AND de.submitted_at > COALESCE(
        (SELECT MAX(pai.generated_at)
         FROM patient_ai_insights pai
         WHERE pai.patient_id = p.id
           AND pai.insight_type = 'nightly_deep_analysis'),
        '1970-01-01'::timestamptz
      )
  )
```

This avoids re-processing patients with no new data, keeping the nightly batch efficient. A patient who hasn't submitted new check-ins since their last deep analysis is skipped entirely.

### Phase 3C: Route Updates

**File:** `apps/api/src/routes/insights/index.ts`

#### New Endpoint: `GET /:patientId/risk-history`

Returns longitudinal risk scores for sparkline rendering. Accepts `?days=` query parameter (default 90, max 365). Care-team gated.

```typescript
// Response shape
{
  success: true,
  data: {
    patient_id: string,
    days: number,
    history: Array<{
      score: number,
      band: string,
      factors: RiskFactor[],
      computed_at: string
    }>
  }
}
```

#### Updated `GET /:patientId/ai`

Now includes:
- `structured_findings` and `clinical_trajectory` in each insight record
- `risk_history` — latest 30 risk history points for inline sparkline rendering (reverse-chronological fetch, reversed to ascending for the UI)
- Limit increased from 5 → 10 on the frontend

#### Updated Trigger Endpoint

`POST /:patientId/ai/trigger` now accepts `nightly_deep_analysis` as a valid type, with automatic `period_days: 30` default.

### Phase 4: Web UI Redesign

**File:** `apps/web/src/pages/PatientDetailPage.tsx`

#### New Types

- `StructuredFindings` — domain_findings (5 domains), early_warnings, treatment_response, recommended_focus, cross_domain_patterns
- `RiskHistoryPoint` — score, band, computed_at
- `RiskFactorItem` — extended with `domain`, `contribution`, `detail`
- `AiInsightsData` — gains `risk_history: RiskHistoryPoint[]`

#### 5 New Components

**1. `RiskGaugeArc`** — SVG semicircular arc gauge replacing the flat progress bar.

- 4 color segments (green → yellow → orange → red) mapped to risk bands
- Animated needle dot positioned at the current score
- Score + band text centered in the arc
- Delta indicator (▲/▼ pts) from risk history comparison
- Dimensions: 240×130 SVG viewBox

**2. `RiskFactorBars`** — Domain-grouped collapsible sections.

Each of the 5 domains (Safety, Mood, Engagement, Physical, Medication) renders as a collapsible section with:
- Domain icon + label + total contribution/max
- Individual factor bars showing graduated contribution as a percentage of max weight
- Detail text for active factors (explains the graduation logic)
- Collapsed/expanded toggle per domain

**3. `TrajectorySparklines`** — SVG polyline mini-charts.

- 160×40 SVG with polyline rendering
- Last point highlighted with a filled circle
- Delta arrow + numeric change from penultimate point
- Currently renders risk score history; designed to extend to PHQ-9/GAD-7 when assessment trajectory data is available from the API

**4. `EarlyWarningSignals`** — Urgency-sorted warning display from the latest deep insight.

- Sorted: urgent → elevated → routine
- Color-coded: red/amber/blue backgrounds and borders
- Each warning shows: urgency icon, signal text, domain badge, urgency label
- Only renders when `structured_findings.early_warnings` has entries

**5. `DeepInsightPanel`** — Structured insight display replacing the simple collapsed narrative.

Sections (when structured findings are available):
- Trajectory badge + rationale (color-coded `improving`/`stable`/`declining`/`acute`)
- Key findings (bullet list)
- Domain findings cards (2-column grid, 5 domains with colored left border + icons)
- Treatment response paragraph
- Recommended focus (numbered priority list with rationale)
- Cross-domain patterns (diamond-bullet list)
- Expandable full narrative

**Legacy fallback:** When displaying older insights that lack `structured_findings`, the panel renders the original simple view (type label, date, key findings bullets, expandable narrative).

#### Updated Layout

**Left column (480px, scrollable):**
1. Risk gauge arc (score + band + delta)
2. Risk factor bars (domain-grouped, graduated)
3. Trajectory sparklines (risk score trends)
4. Early warning signals (from latest deep insight)
5. Generate controls (dropdown: Deep Analysis 30-day / Weekly Summary 7-day)
6. HIPAA disclaimer

**Right column (flex, scrollable):**
1. Deep insight panel (latest structured insight with full detail)
2. Insight history timeline (collapsible entries with timeline dots + trajectory badges)
3. AI Chat (preserved from v0.91a — discussion selector, message history, input area)

### Files Created / Modified

| File | Action | Key Changes |
|------|--------|-------------|
| `packages/db/migrations/017_deep_insights.sql` | **Created** | structured_findings, clinical_trajectory, patient_risk_history |
| `apps/api/src/services/riskScoring.ts` | **Rewritten** | 10 graduated rules, domain grouping, dual-write persistence |
| `apps/api/src/workers/ai-insights-worker.ts` | **Extended** | EnrichedClinicalSnapshot, deep analysis prompt, nightly_deep_analysis job |
| `apps/api/src/workers/nightly-scheduler.ts` | **Fixed + extended** | Ollama gate bug fix, Step 5B deep analysis fan-out |
| `apps/api/src/routes/insights/index.ts` | **Extended** | risk-history endpoint, structured_findings in responses, trigger accepts deep analysis |
| `apps/web/src/pages/PatientDetailPage.tsx` | **Redesigned** | 5 new components, new types, two-column layout overhaul |

### Architecture Decision: Structured Findings vs. Free-Text Narrative

The deep analysis prompt requests structured JSON with explicit fields (`domain_findings`, `early_warnings`, `recommended_focus`), not just a free-text narrative. This is a significant architectural choice:

**Pro structured:**
- UI can render domain-specific cards, urgency-sorted warnings, and priority lists without NLP parsing
- `clinical_trajectory` enum enables reliable badge rendering and trend comparison
- `early_warnings` urgency levels can trigger visual emphasis (amber/red highlighting) deterministically
- Frontend backward compatibility is trivial — just check `if (structured_findings)` and fall back to narrative-only display

**Con structured:**
- LLM must reliably produce valid JSON conforming to the schema (mitigated by `jsonMode: true`)
- More rigid output format may constrain LLM's clinical reasoning expression (mitigated by still including a full narrative field)

The free-text `narrative` field is still populated and available via the expandable panel. The structured fields supplement it, they don't replace it.

### Architecture Decision: Over-Allocation Risk Scoring

The 10 rules sum to a maximum of 132, deliberately exceeding the 0-100 cap. This is intentional:

**Problem with exact-100 allocation:** If maximum total = 100 and each rule's weight perfectly partitions that space, then a patient must accumulate extreme scores in *specific* rules to reach the critical band. But psychiatric risk is often characterized by moderate elevation across multiple domains simultaneously.

**Over-allocation solution:** By allowing the theoretical max to exceed the cap, patients with widespread moderate-severity factors appropriately reach the critical range. Example: a patient with moderate PHQ-9 depression (+10), passive SI on C-SSRS (+10), 4 missed check-ins (+10), medication non-adherence (+5), social withdrawal (+5), and poor sleep (+4) scores 44/100 — firmly in the "moderate" band, which correctly triggers clinical attention without false-alarming.

### Bug Fix: Ollama Nightly AI Gate

The Ollama gate bug (Phase 3B) is worth documenting as a class of errors: when a system has two authentication paths (BAA-signed cloud provider OR local inference), the gate logic must be a disjunction (`||`), not a conjunction (`&&`). The original code required *both* conditions — `aiInsightsEnabled AND anthropicBaaSigned` — which silently disabled nightly AI for all Ollama deployments. This pattern is easy to introduce when the second authentication path (Ollama) is added later without updating all gate checks.

### Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors across all 5 workspaces |
| `npm run build` | All packages compile; web bundles in 2.1s |
| Migration 017 | Applied via psql, recorded in `_migrations` |
| Risk scoring | 10 rules compile, dual-write to `patients` + `patient_risk_history` |
| Worker | `nightly_deep_analysis` job type registered and handled |
| Nightly scheduler | Ollama gate fixed; Step 5B enqueues deep analysis jobs |
| Routes | risk-history endpoint, structured_findings in AI response |
| UI | 5 new components render; legacy fallback for older insights |

---

## 18. Consolidated Architecture Reference

### API Response Pattern

All API responses follow: `{ success: true, data: T }` or `{ success: false, error: string }`.

The web client (`apps/web/src/services/api.ts`) auto-unwraps `data`:

```typescript
// api.ts extracts .data automatically
const json = await res.json();
return (json as { data: T }).data;

// So frontend types should NOT include the wrapper:
api.get<{ items: Patient[] }>('/patients', token)  // ✅ Correct
api.get<{ success: boolean; data: { items: Patient[] } }>('/patients', token)  // ❌ Wrong
```

### Database Schema Quick Reference

48+ tables across 16 migrations. Key tables:

| Table | Purpose | Gotcha |
|-------|---------|--------|
| `patients` | Patient profiles | JWT `sub` = `patients.id` (NOT Supabase UUID) |
| `daily_entries` | Daily check-ins (20 columns) | `mood` not `mood_score` |
| `validated_assessments` | Clinical assessments | `scale`/`score`/`completed_at` |
| `consent_records` | Patient consent | `granted_at` not `created_at` |
| `audit_log` | Audit trail | `occurred_at` not `created_at` |
| `cohort_definitions` | Saved cohort filters | `filter_version` distinguishes v1/v2 |
| `mv_patient_cohort_stats` | Materialized view for cohort queries | Must be manually refreshed |
| `ai_discussions` | AI chat conversations | Linked to both patient and clinician |

### Migration Inventory

| # | Name | Key Changes |
|---|------|-------------|
| 001 | Core tables | patients, clinicians, organisations, daily_entries |
| 002 | Alerts & medications | alerts, medications, alert_rules |
| 003 | Journal & consent | journal_entries, consent_records |
| 004 | Expanded daily entry | 16 clinical columns on daily_entries |
| 005 | Validated assessments | validated_assessments table |
| 006 | Medical codes | SNOMED, RxNorm, ICD-10, OMOP seeds |
| 007 | Invite system | invites table, patient onboarding columns |
| 008 | Onboarding | patient_intake table, indexes |
| 009 | Passive health | passive_health_snapshots, colour_scheme column |
| 010 | AI insights | patient_ai_insights, ai_usage_log |
| 011 | Search & risk score | risk_score columns, GIN tsvector index |
| 012 | Research exports | research_exports, cohort_definitions |
| 013 | Crisis safety plans | crisis_safety_plans (Stanley-Brown) |
| 014 | AI discussions | ai_discussions, ai_discussion_messages |
| 015 | Cohort v2 | cohort_snapshots, mv_patient_cohort_stats, filter_version/color/is_pinned |
| 017 | Deep insights | structured_findings JSONB, clinical_trajectory on patient_ai_insights; patient_risk_history table |

### BullMQ Workers

| Worker | Jobs | Trigger |
|--------|------|---------|
| Rules Engine | Alert evaluation, risk assessment | Daily entry submission |
| Report Generator | PDF/CSV reports, CDA handover XML | Manual or scheduled |
| AI Insights | Weekly summary, anomaly detection, nightly deep analysis, risk stratification | Scheduled + manual trigger |
| Research Exports | Safe Harbour de-identification | Manual |

### Real-Time Architecture

```
Browser ←WebSocket→ Fastify API ←Redis pub/sub→ Fastify API (other instances)
```

WebSocket at `/api/v1/ws` for clinician dashboard. Redis pub/sub enables horizontal scaling — any API instance can publish an alert, and all connected clinicians receive it.

### Mobile API Call Pattern

```typescript
// CORRECT: Use apiFetch (prepends full API URL including host)
const data = await apiFetch('/patients/me', { method: 'GET' });

// WRONG: Raw fetch with API_PREFIX (no host — fails on Android)
const data = await fetch(API_PREFIX + '/patients/me');
```

`apiFetch` in `apps/mobile/services/auth.ts` is the ONLY correct way to make API calls from the mobile app.

---

## 19. Known Gotchas & Lessons Learned

### Database

1. **Column name drift:** Migrations define one name, code assumes another. Always verify against the SQL file, not intuition. Most common: `granted_at` vs `created_at`, `score` vs `total_score`.

2. **`ROUND(x, n)` requires numeric:** PostgreSQL's `ROUND()` with precision parameter requires `numeric` type input. Cast first: `ROUND((expr)::numeric, 2)`.

3. **Migration application gap:** `npm run db:seed-demo` only runs migrations through 008. Later migrations (010+) must be applied manually for the demo environment. This has caused multiple integration failures.

4. **Materialized view refresh:** `mv_patient_cohort_stats` is not auto-refreshed. Must be manually refreshed via API endpoint or `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

### TypeScript

5. **tsconfig paths must point to `dist/`:** In `apps/api/tsconfig.json`, path mappings must reference `dist/*.d.ts`, not `src/*.ts`. Source paths cause `rootDir` errors.

6. **`exactOptionalPropertyTypes`:** Cannot assign `undefined` to optional properties — must use conditional spread: `...(value !== undefined && { key: value })`.

7. **`Buffer → BodyInit`:** For TypeScript strict mode with fetch, use `new Uint8Array(buf) as unknown as BodyInit`.

### Mobile

8. **Expo Router SDK 52:** `<Stack>` must render on the first frame. Never conditionally render the root navigator. `router.replace()` must be called AFTER mount.

9. **Custom `useColorScheme`:** Returns an object `{ isDark, scheme, preference, setOverride }`, NOT a string. All components must use `useColorScheme().scheme`.

10. **Android emulator:** Cannot reach `localhost`. Must use `10.0.2.2` in `.env.local`.

11. **Metro monorepo config:** Requires `watchFolders: [monorepoRoot]` and `nodeModulesPaths` for npm workspaces. Also needs `.js → .ts` fallback resolver for `@mindlog/shared`.

12. **Expo icon cache:** `.expo/web/cache/production/images/` is keyed by source PNG SHA256 hash. Replacing a PNG with a new file of the same name does NOT invalidate the cache. Must `rm -rf` the cache directory and re-run `npx expo prebuild --platform android --clean`.

### AI

13. **Ollama Vulkan vs ROCm:** For AMD GPUs on non-LTS Ubuntu, use Vulkan (`OLLAMA_VULKAN=1`), not ROCm. ROCm requires specific Ubuntu LTS versions.

14. **`.env` not hot-reloaded:** Node's `--env-file` loads at startup only. `--watch` reloads on `.ts` changes but NOT `.env` changes. Must manually restart the API.

15. **AI consent records:** AI endpoints require explicit consent records in the `consent_records` table. Without seeding these, all AI requests fail with 403/409.

### Web

16. **API response unwrapping:** `api.ts` auto-extracts `.data` from responses. Frontend types should represent the unwrapped shape, not the full envelope.

17. **Minimum font size 12px:** Enforced across the dashboard for legibility. Exception: uppercase labels with letter-spacing (11px allowed).

---

## 20. Appendix: Complete File Inventory

### Migrations (16 files)

```
packages/db/migrations/
├── 001_core_tables.sql
├── 002_alerts_medications.sql
├── 003_journal_consent.sql
├── 004_expanded_daily_entry.sql
├── 005_validated_assessments.sql
├── 006_medical_codes.sql
├── 007_invite_system.sql
├── 008_onboarding.sql
├── 009_passive_health.sql
├── 010_ai_insights.sql
├── 011_search_risk_score.sql
├── 012_research_exports.sql
├── 013_crisis_safety_plan.sql
├── 014_ai_discussions.sql
├── 015_cohort_v2.sql
└── 017_deep_insights.sql
```

### API Routes

```
apps/api/src/routes/
├── auth.ts
├── patients.ts
├── daily-entries.ts
├── journal.ts
├── alerts.ts
├── medications.ts
├── assessments/index.ts
├── insights/index.ts
├── voice/index.ts
├── health-data/index.ts
├── safety/index.ts
├── fhir/index.ts
├── research/index.ts
├── sync.ts
└── invites.ts
```

### API Services

```
apps/api/src/services/
├── llmClient.ts              # Provider-agnostic LLM abstraction
├── riskScoring.ts            # 10-rule graduated risk score (literature-backed)
├── cdaGenerator.ts           # CDA R2 XML clinical handover
├── cohortQueryEngine.ts      # Filter DSL → SQL query engine
└── fhir/
    ├── mappers.ts            # FHIR R4 resource mappers
    └── validator.ts          # FHIR structural validation
```

### API Workers

```
apps/api/src/workers/
├── rules-engine.ts           # Alert evaluation, risk assessment
├── report-generator.ts       # PDF/CSV reports, CDA handover
├── ai-insights-worker.ts     # Weekly summary, anomaly detection, nightly deep analysis
└── research-export-worker.ts # Safe Harbour de-identification
```

### Web Pages

```
apps/web/src/pages/
├── DashboardPage.tsx
├── PatientsPage.tsx
├── PatientDetailPage.tsx
├── CohortPage.tsx
├── TrendsPage.tsx
├── ReportsPage.tsx
├── AdminPage.tsx
├── LoginPage.tsx
└── SettingsPage.tsx
```

### Web Components (Cohort v2)

```
apps/web/src/components/
├── CohortFilterBuilder.tsx   # Recursive AND/OR filter editor
├── CohortResultsPanel.tsx    # Patient list, analytics, export tabs
└── AppShell.tsx              # Layout with cohort nav link
```

### Mobile App Screens

```
apps/mobile/app/
├── _layout.tsx               # Root layout + auth bootstrap
├── (tabs)/
│   ├── index.tsx             # Today screen
│   ├── journal.tsx           # Journal + voice recorder
│   ├── insights.tsx          # AI insights + risk gauge
│   └── settings.tsx          # Settings
├── checkin.tsx               # Daily check-in wizard
├── onboarding.tsx            # Intake wizard
├── assessments/
│   └── [scale].tsx           # PHQ-9, GAD-7, ASRM, C-SSRS
└── settings/
    └── index.tsx             # Appearance, notifications
```

### Shared Package

```
packages/shared/src/
├── types/index.ts            # All TypeScript interfaces
├── schemas/index.ts          # All Zod schemas (including cohort v2)
└── constants.ts              # Colors, thresholds, LOINC maps, crisis contacts
```

### Documentation

```
docs/
├── DEVLOG.md                 # This file — comprehensive development log
├── DEVLOG-014-ai-chat.md     # AI chat feature deep dive
├── DEVLOG-015-cohort-builder-v2.md  # Cohort v2 deep dive
├── DECISIONS.md              # Phase 0 architecture decisions
├── MOBILE_PLAN.md            # 8-phase mobile roadmap
├── V1.1_DEVELOPMENT_PLAN.md  # Full v1.1 scope (6 phases)
├── V1.1_TODO.md              # Master checkbox list
├── DEMO.md                   # Demo environment setup
├── DEV_NOTES.md              # Quick developer reference
├── MEDGEMMA_INTEGRATION.md   # Ollama + MedGemma guide
├── live-simulation.md        # Live data simulation system
├── PLAN-live-data-simulation.md  # Simulation planning doc
├── WORKLIST-broken-links.md  # Admin panel status
└── USER_MANUAL_AND_ADMIN_GUIDE.md  # End-user documentation
```

### E2E Tests

```
.maestro/
├── config.yaml
├── auth/           # 4 flows
├── onboarding/     # 3 flows
├── checkin/        # 4 flows
├── journal/        # 4 flows
├── medications/    # 3 flows
├── assessments/    # 4 flows
├── insights/       # 3 flows
├── settings/       # 3 flows
├── crisis/         # 3 flows
├── notifications/  # 3 flows
├── offline/        # 3 flows
├── accessibility/  # 3 flows
├── deeplinks/      # 3 flows
└── edge-cases/     # 3 flows
```

---

## 18a. Security Hardening — Care Team Access Control (2026-02-24)

Security audit revealed three categories of endpoints lacking proper care-team gating. Non-admin clinicians could access patients outside their designated care team via:

1. **Cohort Builder endpoints** — returned full patient rows (names, PHQ-9 scores, demographics) across entire org
2. **Alert mutation endpoints** — any clinician could acknowledge/resolve/escalate alerts for any org patient
3. **Alert detail endpoint** — `GET /alerts/:id` lacked admin bypass (JOIN on care_team_members without fallback)

### Changes

| File | Change |
|------|--------|
| `apps/api/src/routes/research/index.ts` | 11 cohort routes changed from `clinicianOnly` to `adminOnly`; unused `clinicianOnly` const removed |
| `apps/api/src/routes/alerts/index.ts` | `GET /:id` — admin bypass added (dual-mode query); `PATCH /:id/acknowledge`, `/resolve`, `/escalate` — care-team pre-check added (403 for non-team clinicians) |
| `apps/web/src/components/AppShell.tsx` | Cohort Builder nav item wrapped in `{role === 'admin' && (...)}` guard |
| `apps/web/src/pages/CohortPage.tsx` | Client-side admin guard — non-admin sees "Access Restricted" panel |
| `packages/db/seeds/009_demo_enrichment.sql` | Removed `INSERT INTO care_team_members ... CROSS JOIN` block that added NP Zhang to all 146 patients (admin role bypass makes it redundant) |

### Design Rationale

- Cohort queries return population-level PHI — restricting to admin is appropriate since querying cohorts of ~22 care-team patients has limited clinical utility
- Alert mutations use a pre-check pattern (query `care_team_members` JOIN `clinical_alerts` on `patient_id`) rather than inlining into the UPDATE, to return a clear 403 vs ambiguous 404
- Admin users bypass all care-team checks via `isAdminUser()` helper (already existed in alerts routes)

---

*Last updated 2026-02-24. This document consolidates learnings from 17 versions, 16 migrations, and 14 existing documentation files into a single development reference.*
