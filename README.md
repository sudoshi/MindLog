# MindLog

A mental wellness tracking platform for patients with depression, anxiety, and bipolar disorder. Patients track daily mood, sleep, exercise, medication adherence, triggers, and symptoms via a mobile app. Clinicians monitor patient cohorts, receive real-time alerts, and generate clinical reports through a web dashboard.

**Version:** 0.4a (February 2026)
**Target Market:** United States (FDA/HIPAA compliance)

---

## Features

### Patient Mobile App (Expo/React Native)
- Daily multi-domain check-ins (mood 1–10, sleep, exercise, coping strategies)
- Trigger and symptom tracking with severity ratings
- Journaling with optional care team sharing
- Medication tracking and adherence reminders
- Personal trend visualization
- Offline-first sync (WatermelonDB)
- Biometric authentication (Face ID / fingerprint)
- Push notifications for daily reminders

### Clinician Web Dashboard (React)
- Population-level KPIs (mood averages, active alerts, adherence rates)
- Real-time alert feed via WebSocket
- Patient timeline with mood trends and clinical notes
- Standardized assessments (PHQ-9, GAD-7, ISI, C-SSRS, ASRM, WHODAS)
- PDF report generation
- MFA authentication (TOTP)

### Backend API (Fastify)
- RESTful API with Zod validation
- WebSocket for real-time clinician alerts
- BullMQ job queue for background processing
- Row-Level Security (RLS) via PostgreSQL
- AI-powered insights (Anthropic Claude, BAA-gated)

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐
│  Patient Mobile │    │ Clinician Web    │    │ Background Worker │
│  (Expo SDK 52)  │    │ (React 19)       │    │ (BullMQ + Redis)  │
└────────┬────────┘    └────────┬─────────┘    └─────────┬─────────┘
         │                      │                        │
         └──────────────────────┼────────────────────────┘
                                │ HTTP / WebSocket
                   ┌────────────▼────────────┐
                   │     Fastify API         │
                   │     (Node 22 LTS)       │
                   └─────┬──────────┬────────┘
                         │          │
              ┌──────────▼──┐  ┌────▼─────┐
              │ PostgreSQL  │  │  Redis   │
              │ (Supabase)  │  │          │
              └─────────────┘  └──────────┘
```

### Monorepo Structure

```
MindLog/
├── apps/
│   ├── api/           # Fastify REST API + WebSocket
│   ├── web/           # React + Vite clinician dashboard
│   └── mobile/        # Expo patient app
├── packages/
│   ├── db/            # PostgreSQL migrations + seed scripts
│   └── shared/        # Types, Zod schemas, constants
├── COPEApp-Prototype/ # Design wireframes (open HTML files in browser)
├── DECISIONS.md       # Architectural decisions (OQ-001 through OQ-010)
├── DEMO.md            # 5-minute setup guide
└── MOBILE_PLAN.md     # 8-phase mobile development roadmap
```

---

## Quick Start

### Prerequisites

- Node.js 20+ (tested with 22 LTS)
- Docker Desktop
- Supabase account (free tier)
- Expo Go app (for mobile testing)

### Setup

```bash
# Clone and install
git clone <repo>
cd MindLog
npm install

# Configure environment
cp .env.demo .env
# Edit .env: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET

# Start local infrastructure (PostgreSQL, Redis, MailHog)
npm run demo:infra

# Build shared packages
npx turbo run build --filter=@mindlog/shared --filter=@mindlog/db

# Run migrations and seed demo data
npm run demo:setup
```

### Run

```bash
# Terminal 1 — API server
npm run demo:api        # http://localhost:3000

# Terminal 2 — Web dashboard
npm run demo:web        # http://localhost:5173

# Terminal 3 — Mobile app
cd apps/mobile && npx expo start
```

### Demo Credentials

**Clinician Dashboard:**
| Email | Password |
|-------|----------|
| `dr.kim@mindlogdemo.com` | `Demo@Clinic1!` |

**Patient Mobile App:**
| Email | Password | Story |
|-------|----------|-------|
| `alice@mindlogdemo.com` | `Demo@Patient1!` | Recovering — improving mood |
| `bob@mindlogdemo.com` | `Demo@Patient1!` | Volatile — mood swings, active alerts |
| `david@mindlogdemo.com` | `Demo@Patient1!` | Crisis — declining, critical alerts |

See [DEMO.md](DEMO.md) for the full demo guide with 7 clinicians and 146 patients.

---

## Design Wireframes

Interactive HTML wireframes are in `COPEApp-Prototype/`. Open in a browser to explore:

| File | Description |
|------|-------------|
| `mindlog-wireframes.html` | Patient mobile app flow |
| `mindlog-ux-flow.html` | Patient UX journey |
| `mindlog-clinician.html` | Clinician dashboard |
| `mindlog-v2-interactive.html` | Extended interactive prototype |
| `MobileAppCoreDesignPrinciples.md` | Clinical design rationale |

### Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#2a9d8f` | Teal accent |
| Danger | `#d62828` | Alerts, critical |
| Display Font | Fraunces | Headers |
| Body Font | Figtree | Text |
| Mood Scale | 1–10 | Red → Yellow → Teal → Blue |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Patient App | Expo SDK 52, React Native, WatermelonDB |
| Clinician Dashboard | React 19, Vite 6, TanStack Query, Recharts |
| API | Node.js 22, Fastify 5, TypeScript |
| Database | PostgreSQL 15 (Supabase) |
| Auth | Supabase Auth (JWT + TOTP MFA) |
| Real-time | WebSocket + Redis pub/sub |
| Jobs | BullMQ |
| Validation | Zod |
| Email | Resend |
| Push | Expo Push Service |
| AI | Anthropic Claude (BAA-gated) |
| Monorepo | Turborepo |

---

## Development

### Commands

```bash
# Root (via Turbo)
npm run dev          # Watch mode all workspaces
npm run build        # Compile all
npm run test         # Run all tests
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run format       # Prettier

# Database
npm run db:migrate   # Apply migrations
npm run db:seed      # Seed production data
npm run db:seed-demo # Seed demo data (146 patients, 60 days)

# Demo Data Enrichment
npm run db:enrich-demo     # Add clinical data (diagnoses, assessments, notes)
npm run db:enrich-low-risk # Establish mood patterns for low-risk patients
npm run db:simulate        # Run live simulation (or schedule via cron)

# Individual apps
cd apps/api && npm run dev
cd apps/web && npm run dev
cd apps/mobile && npm run start
```

### Project Status

**Phase 0 (Complete):**
- ✅ Architecture decisions finalized
- ✅ API implemented (18 route modules)
- ✅ Web dashboard implemented (7 pages)
- ✅ Database schema (8 migrations, RLS policies)
- ✅ Demo seed scripts

**In Progress:**
- Mobile app core UI
- Patient onboarding flow
- Offline sync

**Planned:**
- Validated assessments
- Health data integration (HealthKit, Google Health Connect)
- Clinical pilot

---

## Compliance

- **Market:** United States
- **Regulatory:** SaMD, likely FDA Class II (formal assessment required)
- **Privacy:** HIPAA (BAAs required with all PHI vendors)
- **Patient age:** 18+ only (v1.0)
- **AI insights:** Gated behind `ANTHROPIC_BAA_SIGNED=true`

### Crisis Resources (US)

| Service | Contact |
|---------|---------|
| 988 Suicide & Crisis Lifeline | Call or text **988** |
| Crisis Text Line | Text **HOME** to **741741** |
| Veterans Crisis Line | Call **988**, Press 1 |

---

## Documentation

- [DEMO.md](DEMO.md) — Full demo setup guide
- [DECISIONS.md](DECISIONS.md) — Architectural decisions
- [MOBILE_PLAN.md](MOBILE_PLAN.md) — Mobile development roadmap
- [docs/live-simulation.md](docs/live-simulation.md) — Live data simulation system
- [.env.example](.env.example) — Environment variables (85 documented)

---

## License

Proprietary. All rights reserved.
