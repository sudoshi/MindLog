# MindLog Mobile — Phased Development Plan
**Target:** Expo (React Native) patient-facing app
**Audience:** Patients with depression, anxiety, and bipolar disorder
**Basis:** HTML wireframes in `COPEApp-Prototype/`, `MobileAppCoreDesignPrinciples.md`, existing API

---

## Executive Summary

The mobile app is a **daily self-monitoring tool** for patients, complementing the clinician web dashboard already built. Patients complete multi-domain mood check-ins, track wellness strategies and triggers, journal, and review their own trends. The backend REST + sync APIs are substantially complete; the mobile work is primarily UI and native integration.

**8 phases over ~12 weeks.** Phases 1–3 (core entry flow) form the MVP required for clinical pilot. Phases 4–8 add depth, assessments, and release readiness.

---

## Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Expo SDK 52** (managed workflow) | OTA updates, EAS Build/Submit, hardware APIs without ejecting |
| Language | **TypeScript** (strict) | Already the repo language; share `@mindlog/shared` types |
| Navigation | **React Navigation 6** (bottom tabs + stack) | Industry standard; supports deep linking |
| State | **Zustand** (same pattern as web) | Already used in web app; lightweight, no boilerplate |
| Server state | **TanStack Query v5** | Same as web; automatic caching, background refetch, offline queue |
| Offline | **WatermelonDB** | Sync protocol already implemented at `GET/POST /sync` |
| Charts | **Victory Native XL** | Recharts is web-only; Victory Native is performant on RN |
| Forms | **React Hook Form + Zod** | Reuses `@mindlog/shared` schemas for validation |
| Styling | **StyleSheet + design tokens** | Native performance; no Tailwind on RN |
| Secure storage | **Expo SecureStore** | JWT tokens, biometric flag |
| Push notifications | **Expo Notifications** | Managed workflow; unified APNs/FCM |
| Biometrics | **Expo LocalAuthentication** | Face ID / fingerprint for re-auth |
| Voice input | **Expo Speech (STT)** | On-device, no cloud upload; journal dictation |
| Health data | **expo-health** (via bare workflow for Phase 6+) | HealthKit / Google Health Connect |
| Build / CI | **EAS Build + EAS Submit** | TestFlight + Play Console submission |

### Monorepo Integration

```
MindLog/
├── apps/
│   ├── api/          ← existing Fastify API
│   ├── web/          ← existing React + Vite clinician app
│   └── mobile/       ← NEW: Expo patient app
├── packages/
│   ├── shared/       ← types, schemas, constants (consumed by mobile)
│   └── db/           ← server-only; NOT imported by mobile
└── turbo.json        ← add mobile workspace tasks
```

`apps/mobile/package.json` imports `@mindlog/shared` (`*`) for types and Zod schemas — the same API contract shapes the web app, so validation is consistent across all clients.

### Design Token Mapping (Prototype → React Native)

| Prototype CSS | Token Name | RN Value |
|---|---|---|
| `--teal` | `colors.teal` | `#2a9d8f` |
| `--rose` | `colors.rose` | `#e05c6e` |
| `--lavender` | `colors.lavender` | `#7c6fa0` |
| `--gold` | `colors.gold` | `#c9972a` |
| `--sage` | `colors.sage` | `#5a8a6a` |
| Mood 1→10 | `moodColors[n]` | Red→Yellow→Teal→Blue scale |
| `Fraunces` | `fonts.display` | `Fraunces_700Bold` via `@expo-google-fonts` |
| `Figtree` | `fonts.body` | `Figtree_400Regular`, `600SemiBold` |

---

## API Gap Analysis

Most patient-facing endpoints exist. The following need to be **added to the API** before or alongside each phase:

| Gap | Endpoint | Phase Needed |
|---|---|---|
| Patient catalogue profile read/write | `GET/POST/DELETE /patients/me/symptoms`, `/triggers`, `/strategies` | Phase 3 |
| Patient self-update | `PATCH /patients/me` (alias to /:id with patient auth) | Phase 1 |
| Patient insights/correlations | `GET /insights/me?days=N` | Phase 5 |
| Periodic assessments | `POST/GET /assessments` (new table + route) | Phase 7 |
| Crisis resources | `GET /safety/resources` (static, config-driven) | Phase 3 |

All other required endpoints (`/daily-entries`, `/journal`, `/medications`, `/catalogues`, `/notifications/prefs`, `/sync`, `/auth`) are **already implemented**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Expo Mobile App                    │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐  ┌──────────┐  │
│  │   Screens   │   │  Zustand     │  │ SecureStore│  │
│  │  (6 tabs +  │──▶│  auth store  │  │ JWT tokens│  │
│  │ onboarding) │   │  ui store    │  └──────────┘  │
│  └──────┬──────┘   └──────────────┘                 │
│         │                                            │
│  ┌──────▼──────────────────────────────────────┐    │
│  │          TanStack Query Layer                │    │
│  │   (API queries + mutations + cache)          │    │
│  └──────┬──────────────────┬────────────────────┘    │
│         │                  │                          │
│  ┌──────▼──────┐   ┌───────▼──────────┐             │
│  │  REST API   │   │  WatermelonDB    │             │
│  │  Client     │   │  (offline-first) │             │
│  └──────┬──────┘   └───────┬──────────┘             │
└─────────┼──────────────────┼─────────────────────────┘
          │   online         │   sync pull/push
          ▼                  ▼
┌──────────────────────────────────────────────────────┐
│              MindLog API  :3000                       │
│  /auth  /daily-entries  /journal  /medications        │
│  /catalogues  /notifications  /sync  /patients        │
└──────────────────────────────────────────────────────┘
```

---

## Phase 0 — Monorepo Setup & Project Scaffold
**Duration:** 3–4 days | **Goal:** Working skeleton that builds and runs

### Deliverables
- `apps/mobile/` Expo project initialised with TypeScript
- Turborepo tasks added: `dev:mobile`, `build:mobile`, `typecheck:mobile`
- Navigation shell: bottom tab bar (6 tabs, placeholder screens)
- Design token file (`theme.ts`) mapping all prototype colours/fonts
- `AuthContext` + `api.ts` client (reusing same fetch wrapper pattern as web)
- JWT stored in `SecureStore`; auto-refresh on 401
- `@mindlog/shared` imported and Zod schemas validated at build time
- EAS `eas.json` configured (development / preview / production profiles)
- `app.json` with bundle IDs, splash screen, icon assets

### Key Files Created
```
apps/mobile/
├── app.json
├── eas.json
├── tsconfig.json        (extends ../../tsconfig.base.json)
├── src/
│   ├── theme.ts         design tokens
│   ├── api/
│   │   ├── client.ts    fetch wrapper + auth header injection
│   │   └── hooks/       per-resource TanStack Query hooks
│   ├── stores/
│   │   ├── auth.ts      Zustand auth (same pattern as web)
│   │   └── entry.ts     in-progress daily entry draft state
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── AuthStack.tsx
│   │   └── TabNavigator.tsx
│   └── screens/
│       └── placeholders/
```

### API work
None — Phase 0 is client-only.

---

## Phase 1 — Onboarding & Authentication
**Duration:** 5 days | **Goal:** Patient can register, log in, and complete first-run setup

### Screens
1. **Welcome** (`/onboarding/welcome`) — Logo animation, tagline, Sign In / Get Started buttons
2. **Carousel** (`/onboarding/what-it-does`) — 4 slides: Track mood → Log triggers → See patterns → Stay connected; dot pagination with pill-active indicator; skip button
3. **Medication Setup** (`/onboarding/medications`) — Add initial medications during onboarding; chips with ✕ remove; progress bar; skip option
4. **Notification Permission** (`/onboarding/notifications`) — Sample notification preview; Accept/Decline; links to Settings if declined
5. **Login** (`/auth/login`) — Email + password; biometric re-auth toggle (SecureStore flag)
6. **MFA Verify** (`/auth/mfa`) — 6-digit TOTP input; auto-submit on last digit; resend timer

### Key Components
- `<SlideCarousel>` — FlatList-based with gesture scroll + dot indicator
- `<MedicationChip>` — Removable pill tag
- `<OtpInput>` — 6-cell custom input, auto-advance on digit
- `<BiometricButton>` — Face ID / fingerprint with `expo-local-authentication`

### Technical Notes
- On first successful login, check `AsyncStorage` for `onboarding_complete` flag
- Onboarding writes notification prefs via `PUT /notifications/prefs` (includes push token from `expo-notifications`)
- Token refresh chain: 401 → refresh → retry → if refresh fails → logout
- `PATCH /patients/me` **[new API endpoint]** — allow patient to set preferred name, timezone

### API endpoints used
`POST /auth/login`, `POST /auth/mfa/verify`, `PUT /notifications/prefs`, `PATCH /patients/me` *(new)*

---

## Phase 2 — Today Screen (Core Daily Entry)
**Duration:** 8 days | **Goal:** Patient can complete and submit a full daily check-in

This is the **highest-priority screen** — it's the primary clinical data collection surface and the entry point every day.

### Screen: Today Tab
Mirrors wireframe `Screen 1` exactly:

**Header:** Dark teal gradient, greeting with first name, current date
**Completion Ring:** Circular SVG progress (0–100%), colour shifts green at 100%; interior shows `65%` + section breakdown (Core ✓, Wellness 4/13, Triggers –)

**Card 1 — Mood (1–10)**
- 10 circular dots in a row; colour from red→yellow→teal→blue via `moodColors[]` map
- Selected dot scales up (1.3×) with spring animation
- Label below: numeric + text label (e.g., "7 · Good") from `MOOD_LABELS` constant in shared pkg

**Card 2 — Coping (1–10)**
- Identical dot-selector component; separate state

**Card 3 — Sleep**
- Large hours display (`7h 30m`)
- Two `<Stepper>` components: ± hours (0–24), ± minutes (0/15/30/45)
- Sub-rating: sleep quality 1–10 slider (teal thumb)

**Card 4 — Exercise**
- Quick-preset row: `[15m] [30m] [60m] [90m] [···]`
- Active preset highlighted in teal; `···` opens manual number input
- Minutes stored; duration_minutes in API

**Card 5 — Medications**
- One row per `patient_medication`; name + dose + timing label
- Toggle pill: green ON / grey OFF → writes to `POST /medications/:id/logs`
- Loaded from `GET /medications/today`

**Submit button** — full-width teal; appears when completion_pct ≥ 40%; calls `PATCH /daily-entries/:id/submit`

### Data Flow
```
Screen mount
  → GET /daily-entries/today (or create via POST /daily-entries if 404)
  → Populate card states from response

User changes mood/coping/sleep/exercise
  → debounce 1.5s → POST /daily-entries (upsert) → update completion_pct

User toggles medication
  → POST /medications/:id/logs (immediate, optimistic update)

User taps Submit
  → PATCH /daily-entries/:id/submit
  → Show confetti / completion animation
  → Navigate to Insights tab
```

### Key Components
- `<MoodDotSelector>` — reusable for mood + coping
- `<Stepper>` — ± control with haptic feedback
- `<SleepQualitySlider>` — react-native Slider with teal styling
- `<ExercisePresets>` — horizontal scroll with active highlight
- `<MedicationToggle>` — medication card with animated pill toggle
- `<CompletionRing>` — SVG ring with animated stroke-dashoffset

### WatermelonDB Integration
Daily entry draft stored locally first; sync protocol pushes on submit. Enables full offline completion — critical for patients in low-connectivity environments (rural, inpatient).

### API endpoints used
`GET /daily-entries/today`, `POST /daily-entries`, `PATCH /daily-entries/:id/submit`, `GET /medications/today`, `POST /medications/:id/logs`

---

## Phase 3 — Wellness, Triggers & Symptoms Tabs
**Duration:** 7 days | **Goal:** Complete multi-domain daily check-in; safety screening live

### Screen: Wellness Tab
Mirrors wireframe `Screen 2`:
- Green gradient header; summary stats: `4 Done / 2 Didn't / 7 N/A`
- Date strip with `<` `>` navigation (past 7 days selectable)
- Grouped list (Physical / Social & Mental / Custom)
- Per-item: name, `[Yes] [No] [N/A]` tristate pill selector
- If YES selected: inline quality slider (1–10) slides in with spring animation
- `+ Add Custom Strategy` button (dashed border) → modal to pick from catalogue or name a new one

### Screen: Triggers Tab
Mirrors wireframe `Screen 3`:
- Rose gradient header; stats: `3 Active / 15 N/A / 6.2 Avg Severity`
- Binary `[Active] [N/A]` toggle (no "No" state for triggers)
- If Active: rose severity slider (1–10) appears inline
- Average severity computed locally from active items
- `+ Add Custom Trigger` button

### Screen: Symptoms Tab
Mirrors wireframe `Screen 4`:
- Lavender gradient header; stats: `2 Present / 10 N/A / 4.5 Avg Level`
- Binary `[Present] [N/A]` toggle
- If Present: lavender intensity slider (1–10)
- **Safety Section** (visually separated card, amber border):
  - "Suicidal Thoughts" row — if marked Present:
    - Full-screen modal overlay (cannot be dismissed without action)
    - Non-alarmist language: *"It sounds like you're going through something really hard."*
    - Three action buttons: `Call Lifeline (13 11 14)`, `SMS Text Line`, `Tell My Clinician`
    - "I'm safe right now" dismissal (requires explicit tap)
    - Immediately fires `POST /daily-entries` with safety symptom → backend creates safety_event + critical alert
  - Resources link visible even when N/A

### New API Endpoints (build alongside Phase 3)

**Patient catalogue profile management:**
```
GET    /patients/me/profile-items        list patient's tracked symptoms/triggers/strategies
POST   /patients/me/profile-items        add item (body: {type, catalogue_id})
DELETE /patients/me/profile-items/:id   remove item
```
These map to `patient_symptoms`, `patient_triggers`, `patient_wellness_strategies` tables.

**Crisis resources:**
```
GET /safety/resources   returns CRISIS_CONTACTS from shared constants + org-specific override
```

### Key Components
- `<TriStateSelector>` — Yes/No/NA pill row (reusable; colour-themed per section)
- `<BinaryToggle>` — Active/NA (triggers + symptoms)
- `<InlineSlider>` — animated expand/collapse with themed gradient track
- `<SafetyModal>` — full-screen, cannot background dismiss; tracks which action taken
- `<CataloguePickerModal>` — searchable list of all catalogue items; select + save to profile

### API endpoints used
`GET/POST /daily-entries` (for wellness/trigger/symptom sub-logs), `GET /catalogues/triggers`, `GET /catalogues/symptoms`, `GET /catalogues/strategies`, `GET/POST/DELETE /patients/me/profile-items` *(new)*, `GET /safety/resources` *(new)*

---

## Phase 4 — Journal Tab
**Duration:** 5 days | **Goal:** Private journaling with prompts, history, and clinician sharing

### Screen: Journal Tab
Mirrors wireframe `Screen 5`:
- Gold gradient header: *"Your private space to reflect"*
- **Daily Prompt Card** (dismissible, amber tint): today's prompt text from server or local rotation
- **Writing Area:**
  - `<TextInput multiline>` with rich-text toolbar above keyboard: **B** *I* _U_ • 1. (using `@10play/tentap-editor` or `react-native-pell-rich-editor`)
  - Word count display; 🎤 voice button
  - Auto-save on blur (debounced `POST /journal`)
- **Past Entries List:**
  - `<FlatList>` of recent entries; date + first 100 chars preview
  - Pull-to-refresh
  - Swipe-left to delete; tap to expand full entry
- **Search bar** — client-side filter on loaded entries (no server search required for MVP)
- **Share toggle** — per-entry: "Share with my clinician" → calls `PATCH /journal/:id/share`
  - Confirmation: *"Once shared, your clinician can see this entry. You can un-share it at any time."*

### Voice Input
- `expo-speech` (STT using device on-board recognition)
- Hold-to-record button; release to transcribe and append to text field
- On-device only; no audio leaves device

### Journal Prompts
- 30 prompts bundled in the app (`assets/prompts.json`)
- Rotated by `(dayOfYear % 30)` — deterministic, same prompt across sessions same day
- Server can override via `GET /journal/today-prompt` (optional future API)

### API endpoints used
`POST /journal`, `GET /journal`, `GET /journal/:id`, `PATCH /journal/:id`, `PATCH /journal/:id/share`

---

## Phase 5 — Insights Tab
**Duration:** 7 days | **Goal:** Patient sees their own trends, correlations, and AI-detected patterns

### Screen: Insights Tab
Mirrors wireframe `Screen 6`:
- Teal gradient header: *"Patterns from your data"*
- **Period selector:** `[2W] [1M] [3M] [Custom]` pill row → controls all charts below

**Chart 1 — Mood & Coping (line chart, Victory Native)**
- Two lines: Mood (teal, thick) + Coping (grey, thin)
- Y-axis 1–10, X-axis dates
- Last point labelled with value
- Tap on any data point → tooltip with date + values

**Chart 2 — Sleep Hours (bar chart)**
- One bar per day for selected period
- Bars below 7h in rose; bars ≥ 7h in lavender
- Dashed reference line at 7h (configurable by patient in settings)
- Empty days shown as hairline (no entry)

**Correlation Card:**
- Top positive factors (e.g., `Exercise +1.8`, `7h+ Sleep +1.4`)
- Top negative factors (e.g., `Work stress −1.3`)
- Computed server-side by new `/insights/me` endpoint
- Badge: *"Based on your last 60 days"*

**AI Pattern Card** (on-device, Phase 5B):
- Simple rule-based patterns computed in JS from cached WatermelonDB data:
  - *"Your mood is X points higher on days you exercise"*
  - *"You tend to sleep less before high-stress days"*
  - *"Your check-in streak: N days"*
- No server ML required for MVP patterns

**Action Row:**
- `📄 Generate Clinician Report` → `POST /reports` with `report_type: weekly_summary`
- `⬇ Export Data` → JSON / CSV download of own entries

### New API Endpoint

```
GET /insights/me?days=60
```
Returns pre-computed correlation data:
```json
{
  "correlations": [
    { "factor": "exercise", "mood_delta": 1.8, "days_present": 18 },
    { "factor": "sleep_7h", "mood_delta": 1.4, "days_present": 22 },
    { "factor": "work_stress", "mood_delta": -1.3, "days_present": 14 }
  ],
  "avg_mood": 6.9,
  "avg_sleep_hours": 7.2,
  "checkin_streak": 14,
  "total_days": 60
}
```
Implemented as a SQL query over `daily_entries`, `sleep_logs`, `trigger_logs`, `exercise_logs` — fast with existing indexes.

### API endpoints used
`GET /daily-entries` (paginated, for chart data), `GET /insights/me` *(new)*, `POST /reports`

---

## Phase 6 — Push Notifications & Passive Data
**Duration:** 5 days | **Goal:** Timely reminders; step count as a passive engagement proxy

### Push Notifications
- **Expo Notifications** — handles both APNs (iOS) and FCM (Android)
- Push token registered at login / first launch → `PUT /notifications/prefs`
- Server sends notifications via `expo-server-sdk` in Node.js (add to `apps/api/src/workers/`)

**Notification types:**
| Type | Trigger | Default time |
|---|---|---|
| Daily check-in reminder | Every day | 8:00 PM local |
| Medication reminder | Per medication timing | Per med schedule |
| Streak milestone | N-day streak reached | Immediate |
| Clinician message | Clinician creates a note | Immediate |
| Safety follow-up | 24h after safety flag | Next morning |

**User controls** (Settings → Notifications):
- Enable/disable each type
- Adjust daily reminder time (time picker)
- Quiet hours configuration

### Passive Data — Step Count
- **iOS:** HealthKit via `expo-health` (or `react-native-health`)
- **Android:** Google Health Connect
- Requires user permission grant (separate permission flow, Phase 6B)
- Steps written into `exercise_logs` as passive supplement: if `duration_minutes` null but steps > 3000, infer 30 min moderate activity
- Screen time, GPS mobility: Phase 8+ (deferred; requires additional privacy governance)

### Background Sync
- `expo-background-fetch` — sync WatermelonDB every 4 hours when app backgrounded
- Only sync if entry exists locally (avoids unnecessary network calls)

---

## Phase 7 — Periodic Full-Scale Assessments
**Duration:** 7 days | **Goal:** Weekly/biweekly validated clinical instruments

### Assessment Schedule (from `MobileAppCoreDesignPrinciples.md`)

| Scale | Frequency | Domains | Items |
|---|---|---|---|
| PHQ-9 | Weekly | Depression | 9 items, 0–3 each |
| GAD-7 | Weekly | Anxiety | 7 items, 0–3 each |
| ASRM | Weekly | Mania (bipolar patients only) | 5 items, 0–4 each |
| ISI | Biweekly | Insomnia | 7 items, 0–4 each |
| C-SSRS | Weekly | Suicide risk | Branching logic |
| WHODAS 2.0 | Monthly | Functional disability | 12 items |

### Implementation

**New DB table:** `patient_assessments`
```sql
CREATE TABLE patient_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  scale_id        TEXT NOT NULL,           -- 'phq9', 'gad7', 'asrm', 'isi', 'cssrs'
  responses       JSONB NOT NULL,          -- {q1: 2, q2: 1, ...}
  total_score     SMALLINT,
  severity_band   TEXT,                    -- 'minimal'|'mild'|'moderate'|'severe'
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clinician_notified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**New API routes:**
```
GET  /assessments/due          → list of assessments due today for this patient
POST /assessments              → submit completed scale
GET  /assessments?scale=phq9   → history of past scores
```

**Trigger logic:** API checks `completed_at` of last submission per scale; returns scale as "due" if overdue.

**UI Flow:**
- Banner on Today screen: *"📋 PHQ-9 — Weekly check-in due (takes ~2 min)"*
- Tap → full-screen assessment flow (one question per screen, progress bar)
- ASRM only shown to patients with bipolar diagnosis in DB
- C-SSRS uses branching: positive on Q1 triggers follow-up questions; high-risk → safety modal
- On completion: score + severity band shown; animated feedback; result sent to clinician as note

**Adaptive Logic:**
- Skip mania screening (ASRM) for patients with unipolar diagnosis codes
- PHQ-9 item 9 (suicidal ideation) triggers safety modal if score ≥ 1
- Assessment results auto-create `clinician_notes` entry with structured summary

---

## Phase 8 — Polish, Accessibility & Release
**Duration:** 5–7 days | **Goal:** App Store and Play Store ready

### Dark Mode
- `useColorScheme()` hook drives token switching
- All design tokens have dark variants in `theme.ts`
- Charts re-render with dark-mode palette on switch

### Accessibility
- All interactive elements have `accessibilityLabel` and `accessibilityHint`
- Minimum 44×44pt touch targets throughout
- `accessibilityRole` on all custom buttons, sliders, toggles
- Color is never the sole indicator (labels always accompany colour coding)
- VoiceOver / TalkBack tested on reference devices
- Dynamic Type support (system font size scaling for body text)

### Performance
- `FlashList` replaces `FlatList` for long journal/entry lists
- Lazy-load Insights charts (only mount when tab active)
- Image/font preloading via `expo-font` + `expo-asset`
- Hermes engine enabled (Expo default on React Native 0.73+)
- Profiler pass: eliminate unnecessary re-renders with `memo` + `useCallback`

### EAS Build & Submit
- **iOS:** TestFlight beta → App Store review (healthcare app category; no exemption needed as it's a tracking app, not a diagnostic one)
- **Android:** Internal test → Closed testing → Production (Play Console)
- `eas build --profile production --platform all`
- `eas submit --platform all`
- Privacy nutrition labels: data collected (health data, usage data), purpose (health monitoring), linked to user identity

### E2E Testing
- **Maestro** (Expo-compatible, YAML-based) for smoke tests:
  - Login → complete Today entry → Submit
  - Journal entry → share with clinician
  - Trigger safety modal → dismiss safely
- Run on EAS Build CI on every PR targeting `main`

---

## Dependencies Between Phases

```
Phase 0 (Scaffold)
    └── Phase 1 (Auth + Onboarding)
            └── Phase 2 (Today Screen) ← MVP milestone
                    └── Phase 3 (Wellness / Triggers / Symptoms) ← MVP milestone
                            ├── Phase 4 (Journal)
                            └── Phase 5 (Insights)
                                    ├── Phase 6 (Notifications + Passive Data)
                                    ├── Phase 7 (Periodic Assessments)
                                    └── Phase 8 (Polish + Release)
```

**Clinical pilot MVP = Phases 0–3 complete.** Patients can do the full daily check-in including safety screening. Phases 4–8 add depth and release readiness.

---

## API Build Order

New API endpoints should be developed alongside the phase that needs them:

| Phase | New Endpoints | Effort |
|---|---|---|
| 1 | `PATCH /patients/me` | 1h |
| 3 | `GET/POST/DELETE /patients/me/profile-items` | 3h |
| 3 | `GET /safety/resources` | 30min |
| 5 | `GET /insights/me` | 4h (SQL correlation query) |
| 6 | Expo push sender in worker | 3h |
| 7 | `GET /assessments/due`, `POST /assessments`, `GET /assessments` | 6h + DB migration |

**Total new API work:** ~17–18 hours, spread across phases.

---

## Summary Timeline

| Phase | Focus | Duration | API Work |
|---|---|---|---|
| 0 | Scaffold, monorepo, navigation shell | 3–4 days | None |
| 1 | Auth, onboarding, biometrics | 5 days | `PATCH /patients/me` |
| 2 | Today screen — full entry flow | 8 days | None (all exists) |
| 3 | Wellness, triggers, symptoms, safety | 7 days | Profile items, safety resources |
| 4 | Journal, prompts, sharing | 5 days | None |
| 5 | Insights, charts, correlations | 7 days | `GET /insights/me` |
| 6 | Push notifications, step count | 5 days | Push sender in worker |
| 7 | PHQ-9, GAD-7, ASRM, C-SSRS assessments | 7 days | Full assessments module |
| 8 | Dark mode, a11y, EAS release | 5–7 days | None |
| **Total** | | **~52–57 days** | **~18h backend** |
