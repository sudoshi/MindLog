# MindLog Developer Notes

Quick reference for common gotchas and conventions learned during development.

---

## Database Schema Conventions

### Timestamp Column Names

**Different tables use different timestamp column names:**

| Table | Timestamp Column | Notes |
|-------|------------------|-------|
| `audit_log` | `occurred_at` | HIPAA audit trail |
| `clinical_alerts` | `created_at` | Standard convention |
| `patients` | `created_at` | Standard convention |
| `clinicians` | `created_at` | Standard convention |
| `daily_entries` | `created_at` | Standard convention |
| `journal_entries` | `created_at` | Standard convention |

**Lesson learned:** Always verify column names against the migration files in `packages/db/migrations/` before writing SQL queries. The `audit_log` table specifically uses `occurred_at` instead of `created_at`.

### Audit Log Action Types

Valid `action` values for `audit_log` (from CHECK constraint in `001_initial.sql`):
- `read`, `create`, `update`, `delete`
- `export`, `share`, `acknowledge`
- `login`, `logout`
- `consent_granted`, `consent_revoked`

Note: There is no `error` action type. To track failed operations, use the `success` boolean column (`success = FALSE`).

---

## API Response Conventions

### Frontend API Service

The `apps/web/src/services/api.ts` service automatically extracts `.data` from API responses. When using generic types:

```typescript
// Correct - just the data type
const response = await api.get<{ items: User[] }>('/admin/users', token);

// Incorrect - don't wrap in success/data
const response = await api.get<{ success: boolean; data: { items: User[] } }>('/admin/users', token);
```

---

## Common Debugging Steps

1. **500 Internal Server Error on API endpoints:**
   - Check column names match actual database schema
   - Verify table names are correct (e.g., `audit_log` not `audit_logs`)
   - Test endpoint with curl to see actual error response

2. **401/403 on admin endpoints:**
   - Verify token is being passed with `Authorization: Bearer {token}`
   - Check JWT payload has correct `role` field
   - Ensure `requireRole(['admin'])` middleware is applied

---

## Risk Scoring System (v1.1a)

### Graduated vs Binary Rules

The risk scoring engine was rewritten from 7 binary rules (fire/no-fire) to 10 graduated rules. Key implementation details:

- **Over-allocation design**: Theoretical max raw score = 132, capped at 100. This is intentional — see `riskScoring.ts`.
- **Dual-write pattern**: `persistRiskScore()` writes to both `patients` table (current snapshot) AND `patient_risk_history` table (longitudinal). Always update both.
- **Domain grouping**: Each `RiskFactor` has a `domain` field (`'safety' | 'mood' | 'engagement' | 'physical' | 'medication'`). The web UI uses this to render collapsible domain sections.
- **Recency decay**: C-SSRS scoring applies time-based decay (48h=1.0x, 7d=0.8x, 14d=0.6x, >14d=0.4x). This means the same ideation level contributes less as time passes.

### AI Deep Analysis

- **Enriched snapshot**: `buildEnrichedClinicalSnapshot()` runs ~12 SQL queries in parallel via `Promise.all()`. If adding new queries, add them to the existing parallel batch.
- **Structured JSON output**: Deep analysis returns structured JSON (not free text). Store in `structured_findings` JSONB column. The `narrative` column still stores the narrative portion for backward compatibility.
- **`clinical_trajectory`**: An enum-like column (`improving`/`stable`/`declining`/`acute`), NOT free text. The UI renders trajectory badges based on this value.

### Nightly Scheduler Gate Logic

**Bug class to watch for**: When the system has two authentication paths (BAA-signed cloud OR local Ollama), gate checks must use `||` (disjunction), not `&&`:

```typescript
// CORRECT: Either Ollama OR BAA-signed
if (config.aiInsightsEnabled && (config.aiProvider === 'ollama' || config.anthropicBaaSigned))

// WRONG: Requires both (silently disables Ollama path)
if (config.aiInsightsEnabled && config.anthropicBaaSigned)
```

This pattern applies in `nightly-scheduler.ts` (Steps 5, 5B) and `ai-insights-worker.ts`.

### TypeScript `exactOptionalPropertyTypes`

When building objects with optional properties from `Promise.all` results:

```typescript
// WRONG: Ternary produces `undefined` which violates exactOptionalPropertyTypes
{ phq9_trajectory: data.length > 0 ? data : undefined }

// CORRECT: Conditional spread
...(data.length > 0 ? { phq9_trajectory: data } : {})

// CORRECT for Promise.all results that are always present:
sleep_pattern: sleepResult!,  // non-null assertion when guaranteed
```

---

*Last updated: 2026-02-24*
