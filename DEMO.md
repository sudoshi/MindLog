# MindLog — Demo Setup Guide

Get the full MindLog suite running locally in about 5 minutes.

---

## What you'll have

| Component | URL |
|-----------|-----|
| API server | http://localhost:3000 |
| Clinician web dashboard | http://localhost:5173 |
| Patient mobile app | Expo Go on your device |
| Email inbox (MailHog) | http://localhost:8025 |

**Pre-seeded data:**
- 7 clinicians, 146 patients across 4 risk cohorts
- 60 days of realistic daily check-in history per patient
- Medications, adherence logs, journal entries, clinical alerts, clinician notes

---

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Docker Desktop running | `docker info` |
| Node.js 20+ | `node --version` |
| npm 10+ | `npm --version` |
| Supabase project (free tier) | [supabase.com](https://supabase.com) |
| Expo Go app | iOS App Store / Google Play |

---

## 5-Minute Setup

### Step 1 — Configure environment

```bash
cp .env.demo .env
```

Open `.env` and fill in **3 values** from your Supabase project
(**Settings → API** in the Supabase dashboard):

```
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
JWT_SECRET=your-jwt-secret  # Settings → API → JWT Secret
```

Everything else in `.env` is pre-configured for the Docker stack.

---

### Step 2 — Start infrastructure

```bash
npm run demo:infra
```

Starts:
- **PostgreSQL 15** on port 5432
- **Redis 7** on port 6379
- **MailHog** SMTP on 1025, web UI on 8025

Wait for containers to be healthy (about 10 seconds):

```bash
docker ps  # all three should show (healthy)
```

---

### Step 3 — Install dependencies & build shared packages

```bash
npm install
npx turbo run build --filter=@mindlog/shared --filter=@mindlog/db
```

---

### Step 4 — Migrate and seed

```bash
npm run demo:setup
```

This runs:
1. **Database migrations** — creates all 35 tables
2. **Demo seed** — creates 7 clinicians + 146 patients + 60 days of data in Supabase Auth and your local PostgreSQL

Expected output:
```
Seeded: 7 clinicians, 146 patients
Daily entries: ~7,200
Medications:   ~365
Alerts:        ~350
```

> Takes 2–4 minutes. Supabase auth users are created in parallel batches.

**Re-seeding:** If you need a clean slate:
```bash
npm run demo:infra:reset   # wipe Docker volumes
npm run demo:infra          # restart fresh containers
npm run demo:setup          # migrate + seed
```

Or to keep the DB but re-seed only:
```bash
npm run db:seed-demo -- --force  # wipe demo data and re-seed
```

---

### Step 5 — Start servers

Open two terminal windows:

**Terminal 1 — API server**
```bash
npm run demo:api
# API running on http://localhost:3000
```

**Terminal 2 — Web dashboard**
```bash
npm run demo:web
# Dashboard running on http://localhost:5173
```

**Terminal 3 (optional) — Rules engine / background worker**
```bash
npm run dev --workspace=apps/api -- --worker
# Or: node dist/worker.js (after building)
```

---

## Access the Demo

### Web Dashboard (Clinician)

Open: **http://localhost:5173**

Login with any clinician account:

| Email | Role | Patients |
|-------|------|----------|
| `dr.kim@mindlogdemo.com` | Psychiatrist | 22 |
| `dr.torres@mindlogdemo.com` | Psychiatrist | 22 |
| `dr.walsh@mindlogdemo.com` | Psychiatrist | 20 |
| `dr.okafor@mindlogdemo.com` | Psychologist | 20 |
| `dr.patel@mindlogdemo.com` | Psychologist | 20 |
| `dr.johnson@mindlogdemo.com` | Care Coordinator | 20 |
| `np.zhang@mindlogdemo.com` | Psychiatric NP | 22 |

**Password for all clinicians:** `Demo@Clinic1!`

**Suggested demo flow:**
1. Login as `dr.kim@mindlogdemo.com`
2. Dashboard → KPI overview (caseload, active alerts, mood averages)
3. Click into **Bob Williams** → Mood trend, active alerts, medications tab
4. Open **Alerts** page → filter by critical/unacknowledged
5. Open **Reports** → generate a PDF report for Alice Johnson

---

### Mobile App (Patient)

1. **Find your machine's local IP:**
   ```bash
   ipconfig getifaddr en0   # macOS
   ip route get 1 | awk '{print $7; exit}'  # Linux
   ```

2. **Create the mobile env file:**
   ```bash
   echo "EXPO_PUBLIC_API_BASE=http://192.168.X.X:3000" > apps/mobile/.env.local
   ```
   Replace `192.168.X.X` with your machine's actual IP.

3. **Start Expo:**
   ```bash
   cd apps/mobile
   npx expo start
   ```

4. **Scan the QR code** with Expo Go on your phone.

5. **Login with a spotlight patient:**

| Email | Password | Story |
|-------|----------|-------|
| `alice@mindlogdemo.com` | `Demo@Patient1!` | Recovering — 58/60 day streak, improving mood (5→8) |
| `bob@mindlogdemo.com` | `Demo@Patient1!` | Volatile — mood swings 2–7, active alerts |
| `carol@mindlogdemo.com` | `Demo@Patient1!` | Stable — perfect 60-day streak, consistently high |
| `david@mindlogdemo.com` | `Demo@Patient1!` | Crisis — declining mood, critical alerts pending |

**All other patients** also use password: `Demo@Patient1!`

**Suggested demo flow (as Alice):**
1. Today screen → medication reminder widget → tap Taken/Skip
2. Start check-in → complete mood + coping + wellness steps
3. Journal screen → write an entry
4. Medications screen → view adherence history

---

### Email Inbox (MailHog)

Open: **http://localhost:8025**

All emails sent by the app (password resets, notifications, report links) are captured here. Nothing goes to real email addresses.

---

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐
│  Patient Mobile  │    │ Clinician Web     │    │  Background Worker │
│  (Expo/RN)       │    │ Dashboard (React) │    │  (Rules Engine)    │
│  :Expo Go        │    │ :5173             │    │  BullMQ + Redis     │
└────────┬─────────┘    └────────┬─────────┘    └─────────┬─────────┘
         │                       │                         │
         └───────────────────────┼─────────────────────────┘
                                 │ HTTP / WebSocket
                    ┌────────────▼────────────┐
                    │     Fastify API          │
                    │     :3000                │
                    │  JWT auth (Supabase)     │
                    └─────┬──────────┬─────────┘
                          │          │
               ┌──────────▼──┐  ┌───▼──────┐
               │ PostgreSQL  │  │  Redis   │
               │ :5432       │  │  :6379   │
               │ (Docker)    │  │ (Docker) │
               └─────────────┘  └──────────┘
                    +
               Supabase Auth (hosted)
               for JWT + user management
```

---

## Troubleshooting

### "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
Make sure you've copied `.env.demo` to `.env` and filled in the 3 Supabase values.

### Seed fails with "already been registered"
This is normal — the script detects existing users and retrieves their IDs. Re-runs are idempotent.

### Mobile can't connect to API
- Ensure your phone and laptop are on the **same WiFi network**
- Check the IP in `apps/mobile/.env.local` matches `ipconfig getifaddr en0`
- Make sure the API is running on port 3000 and not blocked by firewall

### Docker containers not starting
```bash
docker compose -f docker-compose.demo.yml logs
```

### Database migration errors
Ensure PostgreSQL is healthy before migrating:
```bash
docker exec mindlog-demo-postgres pg_isready -U postgres -d mindlogdemo
```

---

## Resetting Everything

```bash
# Stop and remove Docker volumes (wipes database)
npm run demo:infra:reset

# Start fresh containers
npm run demo:infra

# Re-run migrations + seed
npm run demo:setup
```

To delete Supabase Auth users from a previous run, go to your Supabase dashboard
**Authentication → Users** and delete the demo accounts, or use `--force` which
will attempt to re-use existing auth users.
