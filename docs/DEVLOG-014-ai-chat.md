# Dev Log 014 — Interactive AI Chat on Patient Detail AI Insights Panel

**Date:** 2026-02-24
**Scope:** Database migration, API endpoints, LLM client extension, frontend redesign
**Status:** Shipped and verified in demo environment

---

## What Was Built

An interactive AI assistant chat panel was added to the clinician dashboard's AI Insights tab. The tab is now split into two columns:

- **Left panel (420px):** Condensed risk score card, risk factor grid, latest insight summary (expandable), Generate Insight button, HIPAA disclaimer
- **Right panel (flex):** Full chat interface with discussion selector, message history, auto-growing textarea, "Thinking..." indicator, and per-message timestamps

Conversations are persisted to the database as "discussions" linked to both the patient and clinician, creating an auditable clinical dialogue trail.

### Files Changed

| File | Action |
|------|--------|
| `packages/db/migrations/014_ai_discussions.sql` | **Created** — `ai_discussions` + `ai_discussion_messages` tables |
| `apps/api/src/services/llmClient.ts` | Edited — added `ChatMessage` type + `generateChat()` |
| `apps/api/src/workers/ai-insights-worker.ts` | Edited — exported `HIPAA_PREAMBLE`, `ClinicalSnapshot`, `buildClinicalSnapshot`; fixed column names |
| `apps/api/src/routes/insights/index.ts` | Edited — added 3 endpoints; fixed consent column name |
| `apps/web/src/pages/PatientDetailPage.tsx` | Edited — redesigned `AiInsightsTab` with split layout + chat |
| `.env` | Edited — enabled AI with Ollama provider |

### New API Endpoints

All under `/api/v1/insights`, gated by `authenticate` + `aiGate` + care-team membership:

- **`POST /:patientId/ai/chat`** — Synchronous AI chat. Accepts `{ discussion_id, message }`. Creates a new discussion if `discussion_id` is null. Returns both the clinician and assistant messages. LLM receives full conversation history + 30-day clinical snapshot as system context.
- **`GET /:patientId/ai/discussions`** — Lists discussions for a patient, ordered by most recent.
- **`GET /:patientId/ai/discussions/:discussionId`** — Returns full discussion with all messages.

---

## Bugs Discovered and Fixed During Integration

### 1. `consent_records.created_at` does not exist — column is `granted_at`

**Affected:** All consent checks in `insights/index.ts` (4 queries) and `ai-insights-worker.ts` (1 query).

The `consent_records` table uses `granted_at` as its timestamp column, but every consent check in the codebase used `ORDER BY created_at DESC`. This caused a 500 error on all AI insight endpoints that verify patient consent.

**Root cause:** The consent_records migration defined `granted_at`, but the route/worker code was written assuming `created_at` — likely a schema rename that wasn't propagated to the query layer.

**Fix:** `s/created_at/granted_at/` in all five consent queries.

### 2. `validated_assessments` column mismatch in `buildClinicalSnapshot`

**Affected:** `ai-insights-worker.ts` — the `buildClinicalSnapshot` function.

The query used `scale_code`, `total_score`, and `assessed_at`, but the actual columns are `scale`, `score`, and `completed_at`.

**Root cause:** The worker was written against an earlier draft of the assessments migration (005) that used different column names. The migration was updated but the worker query wasn't.

**Fix:** Updated the SQL query and the result mapping to use the correct column names.

### 3. `patients.risk_score` column missing — migrations 010/011 not applied

**Affected:** Both `buildClinicalSnapshot` (queries `patients.risk_score`) and the existing `GET /:patientId/ai` endpoint (queries `risk_score`, `risk_score_factors`, `risk_score_updated_at`).

**Root cause:** Migrations 010 (`patient_ai_insights` table) and 011 (`risk_score` columns + search indexes) had never been applied to the demo database. The demo seed scripts (`npm run db:seed-demo`) only run migrations up to 008.

**Fix:** Manually applied both migrations:
```bash
psql < packages/db/migrations/010_ai_insights.sql
psql < packages/db/migrations/011_search_risk_score.sql
```

**Action item:** `npm run db:migrate` (or the demo setup script) should apply ALL migrations in order, not stop at a hardcoded cutoff. This drift between code and database will keep causing issues.

### 4. No AI consent records seeded

**Affected:** All AI endpoints return 403/409 "consent required" for every patient.

**Root cause:** The demo seed data does not create `ai_insights` consent records. Without them, every AI endpoint rejects the request.

**Fix:** Seeded consent for all patients:
```sql
INSERT INTO consent_records (patient_id, consent_type, granted, consent_version)
SELECT id, 'ai_insights', true, '1.0' FROM patients;
```

**Action item:** Add this to `009_demo_enrichment.sql` or a new seed script so future database rebuilds don't hit this.

### 5. Care team scope mismatch — clinician sees patients they can't interact with

**Affected:** The "Generate Insight" button and chat panel return "You are not on this patient's care team" for patients that appear in the clinician's patient list.

**Root cause:** The patient list endpoint (`GET /patients`) returns all patients in the organisation. But AI endpoints require active `care_team_members` membership. Dr. Kim was only on 21 of 146 patients' care teams, so clicking AI Insights on the other 125 patients showed the care team error.

**Fix (demo):** Added Dr. Kim as `secondary` to all remaining patients:
```sql
INSERT INTO care_team_members (patient_id, clinician_id, role)
SELECT p.id, '<dr_kim_id>', 'secondary'
FROM patients p WHERE p.id NOT IN (SELECT patient_id FROM care_team_members WHERE clinician_id = '<dr_kim_id>');
```

**Action item (product):** The UI should either:
- Only show AI Insights tab when the clinician is on the patient's care team, or
- Show a clear "Join care team to access AI insights" message instead of a raw error, or
- The patient list should indicate care team membership with a visual badge

### 6. Ollama had no models installed

**Affected:** All LLM inference (chat + insight generation).

**Root cause:** Ollama was running but no models were pulled. The `.env` was configured with `OLLAMA_MODEL=alibayram/medgemma:27b` but that model (27GB) was never downloaded.

**Fix:** Pulled `llama3.2:1b` (1.3GB, fast for dev) and `medllama2` (3.8GB). Changed `.env` to use `llama3.2:1b` for quick iteration. MedGemma 27B remains the production target.

### 7. API server doesn't reload on `.env` changes

**Affected:** All environment variable changes.

**Root cause:** The API runs with `node --env-file=../../.env --watch`, but `--env-file` is parsed at process startup. The `--watch` flag (via tsx) only reloads when source `.ts` files change, not when `.env` changes.

**Workaround:** Touch any source file (`touch src/server.ts`) or restart the process manually after `.env` edits.

---

## GPU Acceleration — AMD Radeon RX 7900 XTX via Vulkan

### Problem

MedGemma 27B (Q4_K_M, ~17GB) was running entirely on CPU. Ollama's startup log showed:

```
offloaded 0/63 layers to GPU
total vram: 0 B
entering low vram mode
```

A simple 5-token response ("Hello there!") took **52 seconds**. A full clinical chat response would have taken 5–10+ minutes, causing the API request to hang and time out with no response reaching the frontend.

### Diagnosis

The host machine has an AMD Radeon RX 7900 XTX (Navi 31 / gfx1100) with 24GB VRAM, but:

1. **ROCm was not installed.** The `amdgpu` kernel driver was loaded (`/dev/kfd` and `/dev/dri/renderD128` existed) but the ROCm userspace libraries (`libamdhip64`, `libhipblas`) were absent. Without these, Ollama's HIP/ROCm backend found no GPU.
2. **Ollama ships a Vulkan runner.** At `/usr/local/lib/ollama/vulkan/libggml-vulkan.so` — an alternative GPU backend that uses the Mesa RADV Vulkan driver, which was already installed and working (`vulkaninfo` confirmed the 7900 XTX as GPU0).
3. **Vulkan was disabled by default.** `OLLAMA_VULKAN=false` in Ollama's config.

### Fix

Created a systemd override to enable Vulkan:

```bash
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment=OLLAMA_VULKAN=1
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

After restart, Ollama detected the GPU:

```
inference compute: id=00000000-0300-0000-0000-000000000000
  library=Vulkan  name=Vulkan0
  description="AMD Radeon RX 7900 XTX (RADV NAVI31)"
  total="24.0 GiB"  available="21.3 GiB"
```

### Performance Results

| Metric | CPU (before) | GPU/Vulkan (after) | Improvement |
|--------|-------------|-------------------|-------------|
| 5-token response | 52.1s | 0.13s | **400x** |
| Token throughput | ~0.1 tok/s | **31.7 tok/s** | **317x** |
| 200-token clinical response | est. 30+ min | **6.7s** | practical vs. unusable |
| Layers offloaded | 0/63 | 63/63 | full GPU |
| VRAM used | 0 GB | ~17 GB of 24 GB | fits comfortably |

### Model Progression

| Phase | Model | Size | Purpose |
|-------|-------|------|---------|
| Initial testing | `llama3.2:1b` | 1.3 GB | Fast CPU iteration (~2s), terse output |
| Testing | `medllama2` | 3.8 GB | Medical vocabulary, moderate CPU speed |
| Production | `alibayram/medgemma:27b` | 16 GB | Clinical-quality, GPU-accelerated |

The smaller test models were removed once GPU acceleration made MedGemma 27B viable.

### Key Insight: ROCm vs. Vulkan for AMD GPUs

ROCm is AMD's CUDA equivalent — a full compute stack with HIP, hipBLAS, etc. It officially supports Ubuntu 22.04/24.04 but not 25.10 (this machine's OS). Installing it would have required building from source or risking package incompatibilities.

Vulkan is a graphics/compute API already present on all modern Linux desktops via Mesa. Ollama's Vulkan runner (`libggml-vulkan.so`) leverages it for GPU inference with zero additional driver installation. For AMD GPUs on non-LTS Ubuntu, Vulkan is the path of least resistance.

---

## Ollama Integration Notes

- **Provider selection:** `AI_PROVIDER=ollama` in `.env` routes all LLM calls through Ollama's OpenAI-compatible `/v1` endpoint. No data leaves the machine — no BAA required.
- **`generateChat()` vs `generateCompletion()`:** Chat uses a system prompt + message array. For Ollama, the system prompt is prepended as a `{ role: 'system' }` message. For Anthropic, it uses the native `system` parameter.
- **Model choice:** `alibayram/medgemma:27b` — Google's MedGemma fine-tuned for medical/clinical text, quantized to Q4_K_M (16GB). Runs at ~32 tok/s on the 7900 XTX via Vulkan.
- **Token tracking:** Ollama reports `prompt_tokens` and `completion_tokens` via the OpenAI-compatible response. These are stored per-message and aggregated on the discussion.
- **`.env` reload caveat:** `node --env-file` loads at process startup only. The `--watch` flag only reloads on source `.ts` file changes, not `.env` changes. Must kill and restart the API process after `.env` edits.

---

## Clinical Data Pipeline — How MedGemma Accesses Patient Data

MedGemma does not have direct database access. Instead, each chat turn constructs a **clinical snapshot** from the patient's data and injects it as the LLM system prompt. This is a retrieval-augmented generation (RAG) pattern using structured SQL queries rather than vector embeddings.

### The `buildClinicalSnapshot()` Function

Defined in `apps/api/src/workers/ai-insights-worker.ts` and exported for reuse by the chat endpoint. Executes 7 parameterized SQL queries scoped to a single patient and a configurable time window (default 30 days):

| # | Tables Queried | Data Extracted |
|---|----------------|----------------|
| 1 | `daily_entries` + `sleep_logs` | Avg/min/max mood (0–10), avg coping (0–10), check-in count, avg sleep minutes |
| 2 | `trigger_logs` + `trigger_catalogue` + `daily_entries` | Top 5 triggers by frequency (e.g., "work stress", "relationship conflict") |
| 3 | `symptom_logs` + `symptom_catalogue` + `daily_entries` | Top 5 symptoms by frequency (e.g., "anxiety", "fatigue", "insomnia") |
| 4 | `wellness_logs` + `wellness_strategies` + `daily_entries` | Top 3 wellness strategies used (e.g., "exercise", "journaling") |
| 5 | `validated_assessments` | Last 6 standardized assessment scores (PHQ-9, GAD-7, ASRM, C-SSRS) with dates |
| 6 | `medication_adherence_logs` + `patient_medications` | Adherence percentage (doses taken / doses expected, active meds only) |
| 7 | `patients` | Composite risk score (0–100, computed by the rule-based risk engine) |

Returns a typed `ClinicalSnapshot` interface:

```typescript
interface ClinicalSnapshot {
  period_days:        number;
  avg_mood:           number | null;
  min_mood:           number | null;
  max_mood:           number | null;
  avg_coping:         number | null;
  check_in_days:      number;
  avg_sleep_hours:    number | null;
  top_triggers:       string[];
  top_symptoms:       string[];
  top_strategies:     string[];
  recent_assessments: Array<{ scale: string; score: number; date: string }>;
  med_adherence_pct:  number | null;
  risk_score:         number | null;
}
```

### System Prompt Construction

The snapshot is formatted into a structured text block and prepended with the HIPAA preamble:

```
You are a clinical decision support system integrated into an electronic
mental health record platform.

CRITICAL COMPLIANCE REQUIREMENTS:
- You are a decision SUPPORT tool. Never produce definitive diagnoses.
- Always recommend clinical judgment and direct assessment.
- The data provided is de-identified. Do not attempt to identify the patient.
- If you detect indicators of imminent risk to life, flag them prominently.
- Do not suggest specific medication changes.

PATIENT CLINICAL CONTEXT (de-identified, 30-day window):
- Check-ins: 22/30 days
- Mood: avg 5.2/10, range 3–8
- Coping: avg 4.8/10
- Sleep: avg 6.3 hours/night
- Medication adherence: 78%
- Composite risk score: 42/100
- Top triggers: work stress, relationship conflict, poor sleep
- Top symptoms: anxiety, fatigue, insomnia
- Helpful strategies: exercise, journaling, meditation
- Recent assessments:
  - PHQ-9: 14 (2026-02-20)
  - GAD-7: 11 (2026-02-20)

You are assisting a clinician reviewing this patient's data.
Answer questions about the patient's clinical trajectory, suggest areas
of focus, and help interpret trends. Be concise and clinical. Always
recommend direct clinical assessment when making observations.
```

### Per-Turn Chat Flow

```
 Clinician types question in browser
         │
         ▼
 POST /insights/:patientId/ai/chat
         │
         ├─ 1. Verify care-team membership (SQL)
         ├─ 2. Verify patient AI consent (SQL)
         ├─ 3. Create or load discussion thread (SQL)
         ├─ 4. Load full prior message history (SQL)
         ├─ 5. buildClinicalSnapshot(patientId, 30)  ← 7 SQL queries
         ├─ 6. Format system prompt (HIPAA + snapshot)
         ├─ 7. Persist clinician message to DB
         ├─ 8. generateChat(systemPrompt, history)
         │      └─ Ollama /v1/chat/completions
         │          └─ MedGemma 27B (GPU, ~32 tok/s)
         ├─ 9. Persist assistant response + token counts
         ├─ 10. Update discussion counters
         ├─ 11. Record usage in ai_usage_log
         └─ 12. Return both messages to frontend
```

### HIPAA De-identification

No personally identifiable information (PII) enters the LLM prompt:

- **No names, emails, or MRN** — the patient is referred to as "the patient"
- **No dates of birth or addresses** — only relative time windows ("30-day window")
- **Aggregated metrics only** — averages, percentages, and score ranges rather than raw entries
- **Assessment scores are clinical instruments** — PHQ-9, GAD-7 scores are clinical data, not identifiers
- **All inference is local** — Ollama runs on the same machine; no data leaves the network

### Dual-Use Architecture

The same `buildClinicalSnapshot()` function serves both:

1. **Background BullMQ jobs** — the "Generate Insight" button triggers `weekly_summary`, `trend_narrative`, or `anomaly_detection` jobs that use the snapshot to build one-shot prompts via `generateCompletion()`
2. **Synchronous chat** — each chat turn rebuilds the snapshot fresh, ensuring the LLM always has current data even if the conversation spans hours or days

---

## Architecture Decisions

1. **Synchronous chat, not queued.** Unlike the existing "Generate Insight" flow (BullMQ background job), the chat endpoint is synchronous — the clinician waits for the response inline. This is simpler and provides a better UX for conversational interaction. Trade-off: a slow LLM response blocks the request (mitigated by GPU acceleration achieving ~32 tok/s and the 1024 max_tokens limit).

2. **Full history per turn.** Each chat request sends the entire conversation history to the LLM. This is simple and correct for short discussions. For very long threads, a summarization or sliding-window strategy would be needed, but that's premature for v1.

3. **Clinical snapshot as system prompt.** The 30-day patient clinical snapshot (mood, sleep, triggers, assessments, adherence, risk) is injected as system context every turn. This ensures the LLM always has current patient data, even if the conversation spans multiple sessions. The snapshot is rebuilt from live database queries each turn — not cached — so the LLM sees the latest data.

4. **Reused worker exports.** `buildClinicalSnapshot` and `HIPAA_PREAMBLE` were extracted from the worker by adding `export`. No code duplication. If the snapshot logic needs to evolve, it changes in one place.

5. **Vulkan over ROCm for AMD GPU inference.** On Ubuntu 25.10 with an AMD Radeon 7900 XTX, the Vulkan backend (already bundled with Ollama) provided GPU acceleration without requiring a ROCm installation. This avoids OS compatibility issues while achieving full VRAM utilization (17GB model in 24GB VRAM) and ~32 tok/s throughput.

6. **Local-only inference for HIPAA compliance.** By using Ollama with a locally-hosted MedGemma model, all patient data stays on-premise. No external API calls, no cloud data transmission, no Business Associate Agreement (BAA) required. The `aiGate` middleware skips the BAA check when `AI_PROVIDER=ollama`.
