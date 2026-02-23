# MindLog — Phase 0 Architecture Decisions

**Date:** February 2026
**Status:** Resolved
**Next Review:** Before Phase 1 kick-off

---

## Market Correction (Critical)

> **The SRS v1.0 incorrectly targets the Australian market. MindLog targets the United States.**

The following SRS references must be updated in v1.1:

| SRS Reference | Incorrect (AU) | Correct (US) |
|---|---|---|
| Regulatory body | TGA | FDA |
| SaMD framework | TGA SaMD Framework | FDA Digital Health Center of Excellence |
| Privacy legislation | Privacy Act 1988 (Cth) / APPs | HIPAA (45 CFR Parts 160 & 164) |
| Practitioner registration | AHPRA | State medical boards / NPI |
| Crisis line (SAF-002) | Lifeline 13 11 14 | 988 Suicide & Crisis Lifeline |
| Crisis text (SAF-002) | Crisis Text Line (AU) | Crisis Text Line — Text HOME to 741741 |
| Data residency | AWS ap-southeast-2 | AWS us-east-1 or us-west-2 |
| Record retention | 7 years (AU clinical) | 7 years minimum (varies by state; up to 10 years for minors) |
| Locale default | en-AU | en-US |
| Currency | AUD | USD |

**Regulatory implication:** MindLog likely constitutes a **Software as a Medical Device (SaMD)** under the FDA's Digital Health Center of Excellence framework. Classification is likely **Class II** (De Novo or 510(k) pathway) given it captures suicidal ideation and generates alerts influencing clinical decision-making. A formal regulatory assessment by a US-qualified regulatory affairs consultant is required before any clinical pilot.

**HIPAA implications:**
- MindLog is a **Business Associate** when deployed within a covered entity (hospital, clinic, health plan).
- A **Business Associate Agreement (BAA)** must be executed with every vendor receiving PHI: Supabase, Resend, Twilio, Anthropic, Expo.
- All PHI must remain within US data regions.
- A formal **HIPAA Security Risk Assessment** is required before pilot deployment.

---

## Open Questions — Resolved

### OQ-001 — Journal Encryption Model
**Decision:** Server-side encryption (AES-256 at rest via Supabase/PostgreSQL).
**Rationale:** Enables server-side search (future), clinician sharing with consent, and account recovery. E2EE deferred to v2.0 if patient demand warrants it. The `is_encrypted` flag in `journal_entries` is retained in schema for future migration path.
**Impact:** `journal_entries.body` stored as plaintext (encrypted at storage layer). No client-side key management required.

### OQ-002 — Regulatory Classification
**Decision:** US market (FDA, not TGA). Formal regulatory assessment required before pilot.
**Rationale:** See Market Correction section above.
**Action required:** Engage US regulatory affairs consultant before Phase 6. No production deployment until FDA classification is confirmed.

### OQ-003 — Real-Time Architecture
**Decision:** WebSockets (Fastify + `@fastify/websocket` + Redis pub/sub via `ioredis`).
**Rationale:** SRS §3.2 specifies WebSocket. Bidirectional capability needed for future clinician-to-patient messaging. Redis pub/sub enables horizontal scaling of the API across multiple instances without shared in-process state.
**Implementation:** Each clinician dashboard client connects to `WS /api/v1/ws`. Server broadcasts to Redis channel `alerts:{org_id}`. All API instances subscribe and forward to connected clinician sockets.

### OQ-004 — Alert Threshold Values
**Decision:** Engineering starting points retained (as documented in SRS §6.4). All thresholds **must be reviewed and signed off by a US-licensed clinical advisor before Phase 6 pilot deployment.**
**Current values (provisional):**
- Mood decline WARNING: 7d avg ≥ 2.5 points below 28d baseline
- Mood decline CRITICAL: 7d avg ≥ 3.5 points below 28d baseline
- Missed check-in WARNING: 3 consecutive days
- Missed check-in CRITICAL: 5 consecutive days
- Trigger escalation: severity ≥ 7 for 3 consecutive days

### OQ-005 — Minor Patient Policy
**Decision:** **18+ only for v1.0.** (Market corrected to US.)
**Rationale:** US minor consent laws are complex and vary by state (e.g., HIPAA's right to access for minors vs. parental rights, state-specific mental health confidentiality laws). Building a minor-safe consent model requires legal review. Age gate at 18 eliminates this complexity for the initial pilot. Parental consent flows and minor-specific protections deferred to v2.0 with dedicated legal review.
**Implementation:** Age gate check during onboarding (date of birth → must be ≥ 18). API rejects patient records with `date_of_birth` < 18 years ago.

### OQ-006 — FHIR Export Scope
**Decision:** Design for FHIR R4 compatibility but do not implement in v1.0. No architectural decisions that block future FHIR export.
**Target resource set for v2.0:** `Patient`, `Observation` (mood/sleep/exercise), `Condition` (diagnosis), `MedicationStatement`, `DocumentReference` (journal), `Flag` (safety events).

### OQ-007 — AI Insight Generation
**Decision:** Anthropic Claude API (`claude-sonnet-4-5-20250929`) for patient insight cards.
**Critical prerequisite:** A **BAA with Anthropic must be executed before any PHI is sent to the API.** The `AI_INSIGHTS_ENABLED` environment variable defaults to `false`. The feature is gated behind `ANTHROPIC_BAA_SIGNED=true`.
**Fallback:** Rule-based heuristic templates are implemented as the default until the BAA is signed and `AI_INSIGHTS_ENABLED=true` is set in production.
**Prompt design:** Insight generation uses only the patient's own aggregated statistics (mood deltas, correlation scores, sleep averages) — never raw journal text, names, or MRNs. Minimum data required for clinical insight.

### OQ-008 — Biometric Auth for Clinician Dashboard
**Decision:** TOTP MFA (via Supabase Auth) for v1.0. WebAuthn/passkey support deferred to v1.1.
**Rationale:** TOTP is well-understood, HIPAA-compatible, and Supabase Auth supports it natively. WebAuthn adds complexity and browser compatibility edge cases. The HIPAA Security Rule requires MFA for remote access to ePHI — TOTP satisfies this.

### OQ-009 — Multi-Clinician Journal Visibility
**Decision:** Shared journal entries are visible to **all active care team members**.
**Implementation:** `consent_records.granted_to_organisation_id` is set (not `granted_to_clinician_id`) when a patient shares a journal entry. The RLS policy checks care team membership, not a specific clinician ID. The patient sees a single "Share with my care team" toggle (not a per-clinician selector).

### OQ-010 — Population Snapshot Granularity
**Decision:** Both org-wide AND per-clinician snapshots generated nightly.
**Rationale:** Per-clinician snapshots make the dashboard KPI load instant (reads a single pre-aggregated row). The storage and compute overhead is acceptable at v1.0 scale.
**Implementation:** The nightly job generates one `population_snapshots` row per clinician (with `clinician_id` set) plus one org-wide row (with `clinician_id = NULL`).

---

## Technology Stack — Confirmed

| Component | Technology | Version |
|---|---|---|
| Patient Mobile App | React Native (Expo) | Expo 52, SDK 52 |
| Clinician Dashboard | React + Vite + TypeScript | React 19, Vite 6 |
| Backend API | Node.js + Fastify + TypeScript | Node 22 LTS, Fastify 5 |
| Database | PostgreSQL 15+ | Managed via Supabase |
| ORM / Query Builder | Postgres.js (raw SQL + typed) | postgres@3 |
| Auth | Supabase Auth | JWT + TOTP MFA |
| Real-time | WebSocket (`@fastify/websocket` + Redis pub/sub) | ioredis |
| Rules Engine | BullMQ + Redis | BullMQ 5 |
| Offline Sync (Mobile) | WatermelonDB | Latest |
| Charting (Dashboard) | Recharts | Recharts 2 |
| State (Dashboard) | TanStack Query | v5 |
| Validation | Zod | v3 |
| Email | Resend | Latest |
| SMS | Twilio | Latest |
| Push Notifications | Expo Push Service (APNs + FCM) | Via Expo |
| File Storage | Supabase Storage (S3-compatible) | — |
| PDF Generation | Puppeteer | v23 |
| AI Insights | Anthropic Claude API | claude-sonnet-4-5-20250929 |
| Logging | Pino | v9 |
| Testing (API) | Vitest + Supertest | — |
| Testing (Dashboard) | Vitest + React Testing Library + Playwright | — |
| Testing (Mobile) | Detox | — |
| Monorepo | Turborepo | v2 |

---

## Monorepo Structure

```
mindlog/
├── apps/
│   ├── api/          # Fastify REST API + WebSocket server
│   ├── web/          # React + Vite clinician dashboard
│   └── mobile/       # Expo React Native patient app (from COPE-new)
├── packages/
│   ├── shared/       # Types, Zod schemas, constants shared across all apps
│   └── db/           # PostgreSQL client, migrations, seed scripts
├── COPEApp-Prototype/ # Design artefacts (read-only reference)
├── DECISIONS.md      # This file
├── turbo.json
├── tsconfig.base.json
├── package.json
└── .env.example
```

---

## Phase 0 Checklist

- [x] All Open Questions resolved
- [x] Market corrected to United States
- [x] Technology stack confirmed
- [x] Monorepo structure defined
- [x] Environment variable template created
- [x] Coding standards defined (TypeScript strict, Prettier, ESLint)
- [ ] Supabase project provisioned (manual step — requires account)
- [ ] Redis instance provisioned (local Docker for dev)
- [ ] CI/CD pipeline configured (GitHub Actions)
- [ ] BAA review initiated with: Supabase, Resend, Twilio, Anthropic, Expo
- [ ] US regulatory affairs consultant engaged
- [ ] HIPAA Security Risk Assessment scheduled
- [ ] Clinical advisor engaged for alert threshold review (OQ-004)

---

## Crisis Line References (US) — SAF-002

These contacts are embedded in the patient app safety resource card and must be verified quarterly.

| Service | Contact | Last Verified |
|---|---|---|
| 988 Suicide & Crisis Lifeline | Call or text **988** | February 2026 |
| Crisis Text Line | Text **HOME** to **741741** | February 2026 |
| Veterans Crisis Line | Call **988**, Press 1 | February 2026 |

Next verification due: **May 2026**
