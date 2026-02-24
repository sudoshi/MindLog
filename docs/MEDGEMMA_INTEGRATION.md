# MedGemma + Ollama Integration

> Local AI inference for MindLog's clinical decision support features.

---

## 1. Motivation

MindLog's AI-powered features — weekly clinical narratives, anomaly detection, journal sentiment analysis — were built exclusively on Anthropic Claude. This created two barriers:

1. **BAA requirement.** Per HIPAA 45 CFR 164.314, a signed Business Associate Agreement with Anthropic is required before any PHI-adjacent data can be sent to their API, even de-identified. The `ANTHROPIC_BAA_SIGNED=true` environment flag must be set, and for demo/development environments this is never true.
2. **Cost.** Every inference call costs ~$3/1M input tokens + ~$15/1M output tokens on Claude Sonnet. For iterative development and live demos, this adds up.

The solution: add **Ollama** as a second LLM provider, running **MedGemma 27B** locally. Data never leaves the machine, so no BAA is required. Cost is zero. The same prompts, consent gates, and HIPAA preambles are used — only the transport layer changes.

---

## 2. Architecture

```
                    ┌─────────────────────────────────┐
                    │        config.aiProvider         │
                    │   'anthropic'  │    'ollama'     │
                    └───────┬────────┴────────┬────────┘
                            │                 │
                            ▼                 ▼
                   ┌────────────────┐ ┌───────────────┐
                   │  Anthropic SDK │ │  OpenAI SDK    │
                   │  (cloud)       │ │  → Ollama /v1  │
                   └───────┬────────┘ └───────┬───────┘
                           │                  │
                           ▼                  ▼
                    ┌─────────────────────────────────┐
                    │     LlmResult (unified shape)   │
                    │  { text, inputTokens,           │
                    │    outputTokens, modelId,       │
                    │    provider }                    │
                    └─────────────────────────────────┘
```

A single abstraction layer (`llmClient.ts`) dispatches to the configured provider. All downstream consumers — the AI insights worker, the rules engine journal sentiment evaluator — call `generateCompletion()` and receive a uniform `LlmResult` regardless of backend.

### Why MedGemma?

[MedGemma](https://huggingface.co/google/medgemma-27b-text-it) is Google's medical-domain fine-tuned variant of Gemma 2. The 27B parameter instruction-tuned text model is purpose-built for clinical text understanding. It runs comfortably on a single machine with 32GB+ RAM via Ollama, and its medical vocabulary aligns well with MindLog's clinical prompts (PHQ-9 interpretation, mood trend analysis, crisis indicator detection).

The Ollama community packages it as `alibayram/medgemma:27b` with Q4_K_M quantization, bringing VRAM requirements down to ~18GB for GPU inference or ~20GB RAM for CPU-only.

---

## 3. What Changed

### 3.1 New File: `apps/api/src/services/llmClient.ts`

Provider-agnostic LLM client exporting two functions:

| Function | Purpose |
|----------|---------|
| `generateCompletion(prompt, options)` | Dispatches to Anthropic or Ollama based on `config.aiProvider`. Options: `maxTokens`, `temperature`, `jsonMode`. |
| `computeCostCents(result)` | Returns 0 for Ollama (local), calculates Anthropic token pricing otherwise. |

**Anthropic path:** Dynamic `import('@anthropic-ai/sdk')`, uses `config.anthropicApiKey` + `config.anthropicModel`.

**Ollama path:** Dynamic `import('openai')` pointed at `config.ollamaBaseUrl/v1`. Ollama exposes an OpenAI-compatible `/v1/chat/completions` endpoint, so the existing `openai` npm package (already installed for the Whisper voice transcription feature) works without any new dependencies. When `jsonMode: true` is passed, the request includes `response_format: { type: 'json_object' }`, which Ollama enforces via constrained decoding.

### 3.2 Modified: `apps/api/src/config.ts`

Three new environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AI_PROVIDER` | `'anthropic' \| 'ollama'` | `'anthropic'` | Which LLM backend to use |
| `OLLAMA_BASE_URL` | string | `'http://localhost:11434'` | Ollama server address |
| `OLLAMA_MODEL` | string | `'alibayram/medgemma:27b'` | Ollama model tag |

All three are optional with sensible defaults. Existing deployments that don't set `AI_PROVIDER` continue to use Anthropic with no behavior change.

### 3.3 Modified: `apps/api/src/middleware/aiGate.ts`

The `aiGate` Fastify preHandler middleware gates all `/insights` and `/assessments` AI endpoints. Previously it required **both** `AI_INSIGHTS_ENABLED=true` and `ANTHROPIC_BAA_SIGNED=true`.

Now the BAA check is conditional:

```typescript
// Ollama runs locally — no PHI leaves the machine, so no BAA is required
if (config.aiProvider !== 'ollama' && !config.anthropicBaaSigned) {
  return reply.status(503).send({ ... });
}
```

The `AI_INSIGHTS_ENABLED` master switch is still always required — this prevents accidental activation.

### 3.4 Modified: `apps/api/src/workers/ai-insights-worker.ts`

**Three changes:**

1. **`runInference()`** — Replaced direct Anthropic SDK instantiation with `generateCompletion()` from llmClient. Added `jsonMode: true`. The function now returns `modelId` (dynamic, from the provider) and `costCents` (0 for Ollama) alongside the existing fields.

2. **`recordUsage()`** — Now accepts `costCents` as a parameter instead of computing it inline with hardcoded Anthropic pricing. This correctly records $0.00 for Ollama runs in the `ai_usage_log` table.

3. **`processAiInsightJob()`** — Gate check split into two conditions (AI enabled + BAA check skipped for Ollama). The `model_id` column in the `patient_ai_insights` INSERT is now dynamic (`${modelId}` instead of hardcoded `'claude-sonnet-4-6'`).

### 3.5 Modified: `apps/api/src/workers/rules-engine.ts`

**RULE-008 (Journal Sentiment)** — the only rule that calls an LLM:

- Gate check updated: `if (config.aiProvider !== 'ollama' && !config.anthropicBaaSigned) return null;`
- Direct Anthropic SDK call replaced with `generateCompletion()` + `jsonMode: true`
- Alert detail `model` field now reflects the actual model used

### 3.6 Modified: `apps/api/src/worker.ts`

Enhanced startup log line:

```
[worker] AI insights: ENABLED (ollama/alibayram/medgemma:27b)
```

or when using Anthropic:

```
[worker] AI insights: ENABLED (anthropic/claude-sonnet-4-5-20250929)
```

### 3.7 Modified: `.env.example` and `.env.demo`

**`.env.example`** — Added `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` with documentation noting the BAA distinction.

**`.env.demo`** — Pre-configured for Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=alibayram/medgemma:27b
AI_INSIGHTS_ENABLED=false    # flip to true after pulling the model
```

---

## 4. Files Summary

| File | Action | Lines Changed |
|------|--------|---------------|
| `apps/api/src/services/llmClient.ts` | **Created** | 114 lines |
| `apps/api/src/config.ts` | Edited | +6 lines (3 config entries) |
| `apps/api/src/middleware/aiGate.ts` | Edited | +1 line (conditional) |
| `apps/api/src/workers/ai-insights-worker.ts` | Edited | ~30 lines across 4 sections |
| `apps/api/src/workers/rules-engine.ts` | Edited | ~40 lines in RULE-008 |
| `apps/api/src/worker.ts` | Edited | +3 lines (startup log) |
| `.env.example` | Edited | +7 lines |
| `.env.demo` | Edited | +4 lines |

**No new npm dependencies.** The `openai` package was already installed for the voice transcription feature (Phase 2). The `@anthropic-ai/sdk` remains a dynamic import — it is only loaded when `aiProvider === 'anthropic'`.

---

## 5. Compliance & Safety Posture

| Concern | Anthropic Provider | Ollama Provider |
|---------|-------------------|-----------------|
| Data leaves machine? | Yes (cloud API) | No (localhost) |
| BAA required? | Yes (`ANTHROPIC_BAA_SIGNED=true`) | No |
| Patient AI consent required? | Yes (consent_records table) | Yes (same check) |
| HIPAA preamble in prompt? | Yes | Yes |
| De-identification? | Yes (no names/email/MRN) | Yes (same prompts) |
| `AI_INSIGHTS_ENABLED` required? | Yes | Yes |
| Cost tracking? | Token-based pricing | $0.00 (local) |
| Model ID in audit log? | `claude-sonnet-4-5-20250929` | `alibayram/medgemma:27b` |

The consent gate, HIPAA preamble, de-identification pipeline, and audit logging are **identical** regardless of provider. The only difference is the BAA check, which is correctly skipped for Ollama because no data crosses a network boundary.

---

## 6. AI Features Unlocked

With Ollama + MedGemma running, these features become fully functional in the demo environment:

### 6.1 Weekly Clinical Summary (`generate_weekly_summary`)
- Generates a 2-4 paragraph clinical narrative from the patient's 7-day data window
- Includes key findings (3-6 bullet points), risk indicators, recommended focus areas
- Visible on the web dashboard's AI Insights tab per patient

### 6.2 Anomaly Detection (`detect_anomaly`)
- Identifies unusual patterns: mood drops, sleep disruption, missed check-ins
- Returns urgency level: `routine`, `elevated`, or `urgent`
- `urgent` reserved for imminent safety concerns

### 6.3 Trend Narrative (`generate_trend_narrative`)
- Shorter trend analysis over a configurable period
- Used by the mobile app's Insights tab

### 6.4 Journal Sentiment Analysis (RULE-008)
- Analyzes the 3 most recent journal entries for sentiment
- Classifies as `positive`, `neutral`, `negative`, or `concerning`
- Detects explicit crisis indicators (active suicidal ideation)
- Generates clinical alerts (`warning` for concerning, `critical` for crisis indicators)

### 6.5 Risk Stratification (`risk_stratification`)
- **Not affected** — this is purely rule-based (7-factor composite score) and never calls an LLM
- Continues to work regardless of provider setting

---

## 7. Demo Setup

### Prerequisites

- [Ollama](https://ollama.ai) installed on the demo host
- ~20GB free disk space for the model weights
- 32GB+ RAM recommended (CPU inference) or 20GB+ VRAM (GPU inference)

### Steps

```bash
# 1. Install Ollama (if not already)
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Pull MedGemma 27B (one-time, ~18GB download)
ollama pull alibayram/medgemma:27b

# 3. Verify it's running
ollama list
# Should show: alibayram/medgemma:27b

# 4. Configure .env (copy from .env.demo if starting fresh)
#    Ensure these are set:
#      AI_PROVIDER=ollama
#      OLLAMA_BASE_URL=http://localhost:11434
#      OLLAMA_MODEL=alibayram/medgemma:27b
#      AI_INSIGHTS_ENABLED=true

# 5. Start the full demo stack
npm run demo:infra           # PostgreSQL, Redis, MailHog
npm run demo:setup           # Migrations + demo seed data
npm run demo:api &           # API server (port 3000)
npm run dev:worker &         # BullMQ workers (in apps/api)
npm run demo:web             # Web dashboard (port 5173)

# 6. Trigger an AI insight
#    - Log into the web dashboard as dr.kim@mindlogdemo.com / Demo@Clinic1!
#    - Navigate to any patient detail page
#    - Click "Generate Insight" in the AI Insights tab
#    - Wait ~30-90 seconds for MedGemma to generate the narrative
```

### Smaller Model Alternative

If the demo host has limited resources, you can swap to a smaller model:

```env
OLLAMA_MODEL=alibayram/medgemma:4b
```

The 4B variant requires only ~3GB RAM but produces lower quality clinical narratives. Any Ollama-compatible model that supports the OpenAI chat completions API and JSON mode will work.

---

## 8. Verification Checklist

| Check | Command / Action | Expected |
|-------|-----------------|----------|
| TypeScript compiles | `npm run typecheck` (in `apps/api`) | 0 errors |
| Ollama reachable | `curl http://localhost:11434/v1/models` | JSON with model list |
| Worker starts | `npm run dev:worker` in apps/api | Log: `AI insights: ENABLED (ollama/alibayram/medgemma:27b)` |
| Insight generated | Trigger via dashboard | `patient_ai_insights` row with `model_id = 'alibayram/medgemma:27b'` |
| Cost is zero | Check `ai_usage_log` | `cost_cents = 0` |
| Journal sentiment | Submit a journal entry via mobile/API | RULE-008 evaluates (check worker logs) |
| Backward compat | Unset `AI_PROVIDER` (defaults to anthropic) | BAA_REQUIRED 503 on AI endpoints |
| Backward compat | Set `AI_PROVIDER=anthropic` + `ANTHROPIC_BAA_SIGNED=true` | Uses Anthropic SDK |

---

## 9. Switching Between Providers

The provider can be changed at any time by updating `.env` and restarting the API + worker:

**For production (Anthropic):**
```env
AI_PROVIDER=anthropic
AI_INSIGHTS_ENABLED=true
ANTHROPIC_BAA_SIGNED=true
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

**For demo/development (Ollama):**
```env
AI_PROVIDER=ollama
AI_INSIGHTS_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=alibayram/medgemma:27b
# ANTHROPIC_BAA_SIGNED not needed
```

Both providers write to the same database tables (`patient_ai_insights`, `ai_usage_log`, `clinical_alerts`) with the actual `model_id` recorded for audit purposes.

---

## 10. Known Limitations

1. **Response quality.** MedGemma 27B is capable but not at Claude Sonnet's level for nuanced clinical narratives. Expect shorter, less polished outputs. The structured JSON format helps constrain responses.

2. **Inference speed.** On CPU-only hardware, a single weekly summary generation takes 30-90 seconds (vs. 3-5 seconds with Anthropic's API). GPU inference (CUDA/ROCm) brings this down to 5-15 seconds.

3. **JSON mode reliability.** Ollama's constrained decoding for `response_format: { type: 'json_object' }` is generally reliable but occasionally produces trailing whitespace or minor formatting issues. The `JSON.parse()` calls in the workers handle this gracefully.

4. **No streaming.** The current implementation waits for the full response. For the worker use case this is fine (background jobs), but if real-time streaming is later needed for an interactive UI, the llmClient would need a `generateStream()` variant.

5. **Single-machine only.** Ollama runs on the same host as the API. For multi-server deployments, you'd either run Ollama on a dedicated GPU server and point `OLLAMA_BASE_URL` at it, or use the Anthropic provider.
