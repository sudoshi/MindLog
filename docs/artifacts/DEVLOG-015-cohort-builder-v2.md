# Dev Log 015 — Cohort Builder v2 with Structured Filter DSL

**Date:** 2026-02-24
**Scope:** Database migration, materialized view, query engine, 8 API endpoints, 3 frontend components, shared schema extensions
**Status:** Shipped and verified in demo environment (146 patients, all risk tiers)

---

## What Was Built

A full rewrite of the Cohort Builder from flat key-value filters (v1) to a recursive AND/OR filter DSL (v2) with live count preview, paginated patient results, analytics charts, point-in-time snapshots, and de-identified cohort export.

### Before (v1)

The original cohort builder stored flat `{ risk_levels: ['high'], active_only: true }` filter objects and counted patients with inline SQL. No sorting, no aggregation, no analytics, no export. Admin-only access.

### After (v2)

- **Recursive filter groups** — unlimited AND/OR nesting (max depth 2), supporting 18 fields across 5 categories (demographics, assessments, daily metrics, clinical, engagement)
- **Live preview** — debounced 500ms count as filters change
- **Full query execution** — paginated patient list (50/page), sortable on 6 columns, with aggregate stats computed in parallel
- **Analytics** — risk distribution bar chart, gender donut chart, score averages grid (Recharts)
- **Cohort snapshots** — point-in-time captures for longitudinal trending (30-snapshot history)
- **Export integration** — format picker (CSV/NDJSON/FHIR), filter passthrough to export queue
- **Saved cohorts** — CRUD with color picker, v1→v2 backward compatibility on load
- **Materialized view** — `mv_patient_cohort_stats` pre-computes 30-day aggregates per patient for sub-second queries
- **Clinician access** — no longer admin-only; all clinicians can build and query cohorts

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/db/migrations/015_cohort_v2.sql` | Schema: `cohort_snapshots` table, `mv_patient_cohort_stats` materialized view, `filter_version`/`is_pinned`/`color` columns on `cohort_definitions` |
| `apps/api/src/services/cohortQueryEngine.ts` | SQL query engine: converts filter DSL → parameterized postgres.js fragments |
| `apps/web/src/components/CohortFilterBuilder.tsx` | Recursive filter group UI with categorized field catalog and ICD-10 autocomplete |
| `apps/web/src/components/CohortResultsPanel.tsx` | Results panel: patient table, analytics charts, export tab |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/schemas/index.ts` | Added `FilterOpSchema`, `CohortFilterRuleSchema`, `CohortFilterGroupSchema`, `CohortQuerySchema`, `CohortCountSchema`, `CreateCohortSchemaV2`, `UpdateCohortSchemaV2` |
| `apps/api/src/routes/research/index.ts` | Added 8 new endpoints (query, count, CRUD, stats, snapshot, MV refresh); added `filter_version`/`is_pinned`/`color` to cohort list SELECT |
| `apps/web/src/pages/CohortPage.tsx` | Full rewrite as v2 state container: filter state, results state, saved cohort management, toast notifications |
| `apps/web/src/services/api.ts` | Added `api.put()` method |
| `apps/web/src/components/AppShell.tsx` | Removed admin-only gate on Cohort Builder nav item (now clinician + admin) |

---

## Database Schema (Migration 015)

### `cohort_definitions` — New Columns

```sql
ALTER TABLE cohort_definitions
  ADD COLUMN filter_version INT NOT NULL DEFAULT 1,   -- 1 = v1 flat, 2 = v2 DSL
  ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE, -- dashboard bookmark
  ADD COLUMN color TEXT DEFAULT '#6edcd0';              -- chart line color
```

### `cohort_snapshots` — New Table

Point-in-time aggregates for saved cohorts, enabling trend analysis over time.

```sql
CREATE TABLE cohort_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           UUID NOT NULL REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  patient_count       INT NOT NULL,
  avg_mood            NUMERIC(4,2),
  avg_phq9            NUMERIC(4,2),
  avg_gad7            NUMERIC(4,2),
  risk_distribution   JSONB,
  med_adherence_pct   NUMERIC(5,2),
  avg_tracking_streak NUMERIC(6,2),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexed on `(cohort_id, computed_at DESC)` for fast recent-snapshot lookups. RLS enabled with service-role-all policy.

### `mv_patient_cohort_stats` — Materialized View

Pre-computed 30-day aggregates per patient. This is the **sole data source** for the cohort query engine — all filter and aggregate queries run against this view, not the raw tables.

```
patient_id, organisation_id, status, risk_level, gender, age,
first_name, last_name, tracking_streak, is_active,
app_installed, onboarding_complete,
avg_mood_30d, avg_coping_30d, avg_stress_30d, avg_anxiety_30d, checkins_30d,
latest_phq9, latest_gad7, latest_asrm,
active_med_count, diagnosis_codes (TEXT[])
```

Each column is computed via correlated subqueries against `daily_entries`, `validated_assessments`, `patient_medications`, and `patient_diagnoses`. The view is refreshable concurrently (requires the unique index on `patient_id`).

**Refresh strategy:** Manual via `POST /research/mv/refresh` (admin-only). Production should schedule nightly refreshes via cron or pg_cron.

---

## API Endpoints

All under `/api/v1/research/`, gated by `clinicianOnly` (clinician + admin roles) unless noted.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/cohorts/query` | Execute v2 filter DSL → paginated patients + aggregates |
| `POST` | `/cohorts/count` | Live count preview (no patient data returned) |
| `POST` | `/cohorts/v2` | Create a v2 cohort definition |
| `PUT` | `/cohorts/:id` | Update cohort (name, filters, color, is_pinned) |
| `DELETE` | `/cohorts/:id` | Delete a saved cohort (cascades to snapshots) |
| `GET` | `/cohorts/:id/stats` | Current aggregates + 30 historical snapshots + trend deltas |
| `POST` | `/cohorts/:id/snapshot` | Capture point-in-time snapshot |
| `POST` | `/mv/refresh` | Refresh materialized view (admin-only) |

### Response Shapes

**`POST /cohorts/query`** returns:
```json
{
  "success": true,
  "data": {
    "patients": [{ "patient_id": "...", "first_name": "...", ... }],
    "aggregates": {
      "total_count": 42,
      "avg_mood": 5.2,
      "avg_phq9": 12.3,
      "risk_distribution": { "low": 20, "moderate": 12, "high": 8, "critical": 2 },
      "gender_distribution": { "male": 18, "female": 20, "non_binary": 3, "other": 1 }
    },
    "pagination": { "total": 42, "limit": 50, "offset": 0, "has_next": false }
  }
}
```

**`POST /cohorts/count`** returns:
```json
{ "success": true, "data": { "count": 42 } }
```

---

## Cohort Query Engine

`apps/api/src/services/cohortQueryEngine.ts` — the core of the v2 architecture.

### Design Principles

1. **Whitelist-only field access.** Every filter field must exist in `FIELD_MAP` (18 entries). Unknown fields throw immediately — no user input ever reaches raw SQL.
2. **Parameterized values.** All filter values are passed through postgres.js template literals (`${value}`), never interpolated as strings.
3. **`sql.unsafe()` only for whitelisted column names.** Column references like `mcs.risk_level` come from the hardcoded `FIELD_MAP`, not from user input.
4. **Depth-limited recursion.** `buildGroup()` enforces `depth <= 2` to prevent denial-of-service via deeply nested filter trees.
5. **Parallel query execution.** `queryCohort()` runs 3 queries in parallel via `Promise.all`: patient list, aggregates, and total count.

### Filter DSL → SQL Translation

```
Input (TypeScript):
{
  logic: 'AND',
  rules: [
    { field: 'risk_level', op: 'in', value: ['high', 'critical'] },
    { logic: 'OR', rules: [
      { field: 'latest_phq9', op: 'gte', value: 15 },
      { field: 'latest_gad7', op: 'gte', value: 15 }
    ]}
  ]
}

Output (SQL WHERE clause):
(mcs.risk_level = ANY($1) AND (mcs.latest_phq9 >= $2 OR mcs.latest_gad7 >= $3))
```

### Special Operators

- **`in`** — Multi-value enum: `field = ANY(values::TEXT[])` (e.g., risk_level in [high, critical])
- **`contains`** — Array containment for `diagnosis_codes`: `field @> ARRAY[value]::TEXT[]` (e.g., find patients with ICD-10 F32.1)

### Snapshot Capture

`captureCohortSnapshot()` runs the same aggregate query as `queryCohort()` but without pagination, then inserts a row into `cohort_snapshots` and updates the cohort's `last_count` / `last_run_at`.

---

## Frontend Components

### CohortFilterBuilder (`CohortFilterBuilder.tsx`)

**Field catalog** — 18 fields organized into 5 categories:

| Category | Fields |
|----------|--------|
| Demographics | Age, Gender, Status, Risk Level |
| Assessments | PHQ-9, GAD-7, ASRM (latest scores) |
| Daily Metrics | Avg Mood/Coping/Stress/Anxiety (30d), Check-ins |
| Clinical | ICD-10 Diagnosis, Active Medications |
| Engagement | Tracking Streak, App Installed, Onboarding Done |

**Dynamic operator selection** — operators change based on field type:

| Field Type | Available Operators |
|-----------|-------------------|
| Enum | equals, not equals, is any of (multi-checkbox) |
| Number | =, !=, >, >=, <, <= |
| Boolean | is (yes/no) |
| Text (diagnosis_codes) | contains (with ICD-10 autocomplete) |

**ICD-10 autocomplete** — `useIcd10Search()` hook debounces 300ms, queries `GET /research/omop-concepts?search=...&vocabulary=ICD10CM`, renders a dropdown with code + preferred label.

**Recursive group editing** — `FilterGroupEditor` renders at depth 0 (green left border) and depth 1 (blue left border). Each group has an AND/OR toggle, add rule/subgroup buttons, and a remove group button.

### CohortResultsPanel (`CohortResultsPanel.tsx`)

Three-tab panel:

1. **Patient List** — Sortable table (name, risk, PHQ-9, GAD-7, mood 30d, streak, status). Click row → navigate to patient detail. Risk badges with color coding. Pagination (Prev/Next) with "Page X of Y" metadata.

2. **Analytics** — Recharts visualizations:
   - Horizontal bar chart: risk distribution (low/moderate/high/critical)
   - Donut chart: gender distribution
   - Score averages grid: PHQ-9 (/27), GAD-7 (/21), Mood (/10), Streak, Medications

3. **Export** — Format selector (CSV, NDJSON, FHIR Bundle), export trigger, status polling (2s interval), download link on completion. Filters are passed through from the parent page.

**Summary bar** — Always visible above tabs when results exist. Shows 5 key metrics: patient count, avg PHQ-9 (red when >= 15), avg GAD-7, avg mood, avg streak.

### CohortPage (`CohortPage.tsx`)

State container with two-column layout:

- **Left (380px):** Filter builder → save/update panel (name input + color picker) → saved cohorts list (click to load, snapshot button, delete button)
- **Right (flex):** Results panel

**State management:**
- Filter state: `filterGroup`, `liveCount`, `countLoading`
- Results state: `patients`, `aggregates`, `pagination`, `sorting`, `queryLoading`
- Saved cohorts: `savedCohorts`, `editingCohortId`, `cohortName`, `cohortColor`
- Toast notifications with 3.5s auto-dismiss

**v1 backward compatibility:** When loading a v1 cohort (flat filters), the `loadCohort()` function converts it to a v2 AND group: each key-value pair becomes `{ field: key, op: 'eq', value }`.

---

## Bugs Found and Fixed During Integration

### 1. Missing columns in cohort list endpoint

**Affected:** `GET /research/` — the saved cohorts list.

The SQL SELECT was missing `filter_version`, `color`, and `is_pinned` columns. Without these, the frontend couldn't:
- Distinguish v2 cohorts from v1 (the "v2" badge and snapshot button rely on `filter_version === 2`)
- Render the cohort color dot in the saved cohorts list
- Determine pinned status

**Fix:** Added `cd.filter_version, cd.is_pinned, cd.color` to the SELECT in `apps/api/src/routes/research/index.ts`.

### 2. Response shape mismatch for saved cohorts

**Affected:** `CohortPage.tsx` — initial fetch and post-save refresh.

The API returns `{ success: true, data: { items: [...], total, page, limit, has_next } }`. The `api.get()` client auto-unwraps `data`, yielding `{ items: SavedCohort[], ... }`. But the frontend was typed as `api.get<SavedCohort[]>(...)` and piped directly to `setSavedCohorts()`, meaning the state got set to the paginated wrapper object instead of the array.

**Symptom:** `savedCohorts.map(...)` would fail silently (iterating over object keys) or render nothing.

**Fix:** Changed to `api.get<{ items: SavedCohort[] }>('/research/', token).then((res) => setSavedCohorts(res.items))` in both the `useEffect` and `handleSaveCohort()`.

### 3. Export tab sending empty filters

**Affected:** `CohortResultsPanel.tsx` → `ExportTab` component.

The export handler was sending `{ filters: {} }` (hardcoded empty object) instead of the actual cohort filter group. The `filterGroup` prop was never threaded from `CohortPage` through `CohortResultsPanel` into `ExportTab`.

**Fix:** Added `filterGroup: CohortFilterGroup` to `CohortResultsPanelProps`, passed it through to `ExportTab`, and replaced the hardcoded `{}` with the actual filter group.

---

## Architecture Decisions

### 1. Materialized view over real-time joins

The cohort query engine runs all queries against `mv_patient_cohort_stats`, not the raw `patients` / `daily_entries` / `validated_assessments` tables. This trades data freshness (stale until next refresh) for query speed (single flat table, no joins, pre-computed aggregates). For a research cohort builder where filters are iterative and exploratory, sub-second response times matter more than second-level freshness.

### 2. Recursive Zod schema for filter groups

`CohortFilterGroupSchema` uses `z.lazy()` for self-referential validation. This lets the same schema validate both shallow `{ logic: 'AND', rules: [rule1, rule2] }` and nested `{ logic: 'AND', rules: [rule1, { logic: 'OR', rules: [rule2, rule3] }] }` structures. The depth limit (2 levels) is enforced at the query engine level, not the schema level, to provide a better error message.

### 3. `sql.unsafe()` only for whitelisted identifiers

Column references in WHERE clauses can't be parameterized (they're identifiers, not values). Using `sql.unsafe()` is necessary but dangerous — so it's only applied to values from `FIELD_MAP` and `SORT_MAP`, which are hardcoded string constants. User input never flows to `sql.unsafe()`.

### 4. Parallel aggregate queries

`queryCohort()` runs 3 queries concurrently: patient list (with LIMIT/OFFSET/ORDER BY), aggregates (AVG/COUNT over the full filtered set), and total count (for pagination metadata). This is faster than a single query with window functions and keeps the SQL readable.

### 5. Snapshot-based trends over live recomputation

Cohort trends are computed by comparing historical `cohort_snapshots` rows, not by re-running the query for past dates (which would be impossible — the materialized view only has current data). Clinicians manually capture snapshots or could automate them via a scheduled job. This is simpler and cheaper than maintaining historical materialized views.

### 6. Clinician access (not admin-only)

The v1 cohort builder was admin-only. v2 opens it to all clinicians (`clinicianOnly` middleware), since cohort analysis is a standard clinical workflow. Research exports remain admin-only. The materialized view is org-scoped (`WHERE organisation_id = $orgId`), so clinicians can only see patients in their own organisation.

### 7. v1 backward compatibility

Loading a v1 cohort (flat `{ risk_levels: ['high'], active_only: true }`) converts it to a v2 filter group (`{ logic: 'AND', rules: [{ field: 'risk_level', op: 'eq', value: 'high' }] }`). This lets clinicians edit old cohorts in the new UI. Saving always upgrades to `filter_version = 2`.

---

## Data Flow

```
User adjusts filters in CohortFilterBuilder
         │
         ├─ onChange → CohortPage.setFilterGroup()
         │
         ├─ useEffect (debounce 500ms)
         │    └─ POST /research/cohorts/count { filters }
         │         └─ countCohort(orgId, filters)
         │              └─ buildGroup(filters) → WHERE clause
         │              └─ SELECT COUNT(*) FROM mv_patient_cohort_stats
         │         └─ setLiveCount(count)
         │
         └─ User clicks "Search"
              └─ POST /research/cohorts/query { filters, limit, offset, sort }
                   └─ queryCohort(orgId, filters, ...)
                        └─ buildGroup(filters) → WHERE clause
                        └─ Promise.all([
                             SELECT patients ... LIMIT/OFFSET/ORDER BY,
                             SELECT AVG/COUNT aggregates,
                             SELECT COUNT(*) total
                           ])
                   └─ setPatients(patients)
                   └─ setAggregates(aggregates)
                   └─ setPagination(pagination)
                        │
                        ├─ PatientTable renders sorted rows
                        ├─ SummaryBar shows key metrics
                        ├─ AnalyticsTab renders Recharts
                        └─ ExportTab sends filters to export queue
```

### Save / Load Cohort Flow

```
Save:  cohortName + filterGroup + cohortColor
         └─ POST /research/cohorts/v2
              └─ INSERT INTO cohort_definitions (filter_version=2, ...)
              └─ GET /research/ → refresh savedCohorts list

Load:  click saved cohort in sidebar
         └─ loadCohort(cohort)
              ├─ filter_version === 2 → setFilterGroup(cohort.filters)
              └─ filter_version === 1 → convert flat → AND group → setFilterGroup
              └─ setCohortName, setCohortColor, setEditingCohortId

Snapshot: click 📸 on v2 cohort
         └─ POST /research/cohorts/:id/snapshot
              └─ captureCohortSnapshot(id, orgId, filters)
                   └─ Compute aggregates → INSERT INTO cohort_snapshots
                   └─ UPDATE cohort_definitions SET last_count, last_run_at
```

---

## Demo Environment Verification

```
Migration 015:          Applied ✓
Materialized view:      146 patients across 4 risk tiers
  low: 83, moderate: 35, high: 21, critical: 7
MV refresh:             Completed successfully (CONCURRENTLY)
cohort_definitions:     filter_version, is_pinned, color columns present
Web build (tsc+vite):   0 errors ✓
API typecheck (tsc):    0 errors ✓
```

---

## Remaining Work

1. **MV refresh scheduling** — `POST /research/mv/refresh` exists but must be triggered manually. Add a pg_cron job or BullMQ repeatable job to refresh nightly.
2. **Cohort comparison charts** — The `/cohorts/:id/stats` endpoint returns 30 historical snapshots with trend deltas, but no frontend visualization exists yet. A line chart comparing PHQ-9/mood/count over time for 2-3 pinned cohorts would complete the trending story.
3. **Export endpoint alignment** — The ExportTab currently posts to `POST /research/` (the generic research export endpoint which expects v1 filter shapes and requires admin role). A dedicated cohort export endpoint or adaptor that translates the v2 filter group to the existing export pipeline would make this seamless for clinicians.
