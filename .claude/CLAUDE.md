# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MindLog is a mental wellness tracking platform with:
- **Patient mobile app** (React Native + Expo SDK 52)
- **Clinician web dashboard** (React 19 + Vite)
- **Backend API** (Node.js 22 + Fastify 5)
- **PostgreSQL database** with Supabase + Row-Level Security

TypeScript monorepo using npm workspaces and Turbo for orchestration.

## Commands

### Root-level (via Turbo)
```bash
npm run dev              # Watch mode for all workspaces
npm run build            # Compile all workspaces
npm run test             # Run all test suites
npm run lint             # ESLint all source
npm run typecheck        # tsc strict mode check
npm run format           # Prettier all code
```

### Database
```bash
npm run db:migrate       # Apply pending migrations
npm run db:seed          # Seed production data
npm run db:seed-demo     # Seed demo data (7 clinicians, 146 patients, 60d history)
```

### API (apps/api)
```bash
npm run dev              # tsx --watch (auto-reload)
npm run dev:worker       # BullMQ job processor
npm run test             # vitest run
npm run test:watch       # vitest interactive
```

### Web (apps/web)
```bash
npm run dev              # Vite dev server with HMR
npm run test             # vitest run
npm run test:e2e         # Playwright E2E tests
```

### Mobile (apps/mobile)
```bash
npm run start            # Expo dev server
npm run android          # Build + run on Android emulator
npm run ios              # Build + run on iOS simulator
npm run test             # jest --watchAll
```

### Demo Environment
```bash
npm run demo:infra       # Start Docker (PostgreSQL, Redis, MailHog)
npm run demo:setup       # Run migrations + seed demo data
npm run demo:api         # Start API at http://localhost:3000
npm run demo:web         # Start web at http://localhost:5173
```

## Architecture

### Monorepo Structure
```
apps/
├── api/           # Fastify backend (Node 22)
├── web/           # Clinician dashboard (React 19 + Vite)
└── mobile/        # Patient app (Expo SDK 52)
packages/
├── db/            # Database migrations & postgres.js client
└── shared/        # Shared types, Zod schemas, constants
```

### Shared Package (`@mindlog/shared`)
Single source of truth for API contracts:
- **Types**: `Patient`, `Clinician`, `Alert`, `DailyEntry`, `JournalEntry`, etc.
- **Schemas**: Zod validation for all API request/response bodies
- **Constants**: `MOOD_COLORS`, `ALERT_THRESHOLDS`, `CRISIS_CONTACTS`, `LIMITS`

Import pattern:
```typescript
import { Patient, LoginSchema, MOOD_COLORS, ALERT_THRESHOLDS } from '@mindlog/shared';
```

### Database (`@mindlog/db`)
- **postgres.js** client (raw SQL templates, no ORM)
- **RLS enforcement**: Each request sets `app.current_user_id` and `app.current_user_role`
- **Migrations**: Numbered SQL files in `packages/db/migrations/` (001-008)
- **RLS context setter**: `setRlsContext(userId, role)` must be called before queries

### API Routes
All routes under `/api/v1/`:
- `/health` - Liveness check
- `/auth` - Login, refresh, MFA
- `/patients`, `/patients/me` - Patient CRUD
- `/daily-entries` - Mood/sleep/exercise check-ins
- `/journal` - Journal entries + sharing
- `/alerts` - Alert feed + acknowledgment
- `/assessments` - PHQ-9, GAD-7, ISI, C-SSRS, ASRM, WHODAS
- `/medications` - Medication tracking
- `/sync` - Offline-first sync (mobile)
- `/invites` - Patient invite management

### State Management
- **Server state**: TanStack Query v5 (web + mobile)
- **Auth/UI state**: Zustand (web + mobile)
- **Offline DB**: WatermelonDB (mobile, Phase 2)

### Real-Time
- WebSocket at `/api/v1/ws` for clinician dashboard
- Redis pub/sub for horizontal scaling of alert broadcasts

## Key Patterns

### API Validation
All endpoints use Zod schemas from `@mindlog/shared`:
```typescript
const input = CreatePatientSchema.parse(req.body);
```

### Row-Level Security
Queries require RLS context to be set first:
```typescript
await setRlsContext(userId, role);
const patients = await sql`SELECT * FROM patients`;
```

### Compliance-Gated AI
AI insights only work when both env vars are true:
- `AI_INSIGHTS_ENABLED=true`
- `ANTHROPIC_BAA_SIGNED=true`

Falls back to rule-based heuristics otherwise.

## Code Style

- **Line width**: 100 chars
- **Indent**: 2 spaces
- **Files**: kebab-case (`error-handler.ts`)
- **Routes**: lowercase with hyphens (`/daily-entries`)
- **Database**: snake_case tables/columns

## Compliance Context

- **Market**: US (FDA/HIPAA required)
- **Classification**: SaMD, likely FDA Class II
- **Patient age**: 18+ only (v1.0)
- **Alert thresholds**: Provisional, require clinical sign-off before pilot
- **Crisis contacts**: 988 Suicide & Crisis Lifeline, Crisis Text Line (741741)

See `DECISIONS.md` for architectural decisions (OQ-001 through OQ-010).
