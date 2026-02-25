# MindLog Web Application — Broken Links & Non-functional Features Worklist

**Generated:** 2026-02-23
**Status:** Active

---

## Summary

| Category | Count | Priority | Status |
|----------|-------|----------|--------|
| Admin Panel (Mock Data) | 12 buttons | Medium | 7 functional, 5 mock (FHIR) |
| Missing API Endpoints | 11 endpoints | Medium | 7 implemented |
| Access Control Issues | 1 issue | Low | ✅ Fixed |
| Core Routes | 0 issues | N/A | ✅ All working |

**Core application routes (`/dashboard`, `/patients`, `/alerts`, `/trends`, `/reports`) are fully functional.**

**Admin Panel Status (as of 2026-02-23):**
- ✅ Dashboard section — Real data from `/admin/stats`
- ✅ Users section — Real data from `/admin/users` with pagination
- ✅ Roles section — User counts from real data
- ✅ Audit Log section — Real data from `/admin/audit-log` with filtering and CSV export
- ⚠️ FHIR Endpoints section — Mock data (Phase 4 future feature)
- ✅ Security section — Static config display (no API needed)

---

## 1. Admin Panel — Non-functional Buttons (Mock Data)

**File:** `apps/web/src/pages/AdminPage.tsx`

The Admin page currently displays mock/demo data and has non-functional interactive elements. All buttons below do nothing when clicked.

### 1.1 FHIR Endpoints Section

| Line | Element | Expected Behavior | Status |
|------|---------|-------------------|--------|
| 274 | "Add Endpoint" button | Opens modal to create new FHIR endpoint | Mock |
| 318 | "Sync Now" button | Triggers manual sync with EHR | Mock |
| 340 | "Edit Configuration" button | Opens endpoint config editor | Mock |
| 341 | "Test Connection" button | Tests FHIR endpoint connectivity | Mock |
| 342 | "Disconnect" button | Removes FHIR endpoint connection | Mock |

### 1.2 User Management Section

| Line | Element | Expected Behavior | Status |
|------|---------|-------------------|--------|
| ~555 | "Import from LDAP" button | Opens LDAP import dialog | Mock (future) |
| ~556 | "Add Manual User" button | Opens user creation form | Mock (API ready) |
| ~614 | "Edit" button (per row) | Opens user edit modal | Mock (API ready) |

Note: The API endpoints for user create/update are implemented. UI modals need to be built.

### 1.3 Roles & RBAC Section

| Line | Element | Expected Behavior | Status |
|------|---------|-------------------|--------|
| 462 | "Edit" button (per role) | Opens role permission editor | Mock |

### 1.4 Audit Log Section

| Line | Element | Expected Behavior | Status |
|------|---------|-------------------|--------|
| ~499 | "Export CSV" button | Downloads audit log as CSV | ✅ Functional |
| ~502-517 | Filter buttons | Filter audit entries | ✅ Functional (filters real data) |

---

## 2. Missing API Endpoints

### 2.1 FHIR Endpoint Management (Phase 4 - Future)

| Method | Endpoint | Description | Priority | Status |
|--------|----------|-------------|----------|--------|
| `GET` | `/api/v1/admin/fhir-endpoints` | List all configured FHIR endpoints | Medium | Pending |
| `POST` | `/api/v1/admin/fhir-endpoints` | Create new FHIR endpoint | Medium | Pending |
| `PATCH` | `/api/v1/admin/fhir-endpoints/:id` | Update endpoint configuration | Medium | Pending |
| `DELETE` | `/api/v1/admin/fhir-endpoints/:id` | Remove FHIR endpoint | Medium | Pending |
| `POST` | `/api/v1/admin/fhir-endpoints/:id/sync` | Trigger manual EHR sync | Low | Pending |
| `POST` | `/api/v1/admin/fhir-endpoints/:id/test` | Test endpoint connectivity | Low | Pending |

### 2.2 User Management ✅ IMPLEMENTED

| Method | Endpoint | Description | Priority | Status |
|--------|----------|-------------|----------|--------|
| `GET` | `/api/v1/admin/users` | List all org users (admin view) | Medium | ✅ Done |
| `GET` | `/api/v1/admin/users/:id` | Get single user details | Medium | ✅ Done |
| `POST` | `/api/v1/admin/users` | Create user manually | Medium | ✅ Done |
| `PATCH` | `/api/v1/admin/users/:id` | Update user (role, status, MFA) | Medium | ✅ Done |
| `POST` | `/api/v1/admin/ldap/import` | Import users from LDAP | Low | Pending |

### 2.3 Audit & Compliance ✅ IMPLEMENTED

| Method | Endpoint | Description | Priority | Status |
|--------|----------|-------------|----------|--------|
| `GET` | `/api/v1/admin/stats` | Admin dashboard statistics | Medium | ✅ Done |
| `GET` | `/api/v1/admin/audit-log` | Query audit entries (paginated) | Medium | ✅ Done |
| `GET` | `/api/v1/admin/audit-log/export` | Export audit log as CSV | Low | ✅ Done |

---

## 3. Access Control Issues

### 3.1 Admin Route Visibility ✅ FIXED

**Issue:** ~~The `/admin` route is accessible to all authenticated users, but shows mock data instead of an "Access Denied" message for non-admin users.~~

**Status:** RESOLVED

**Fix Applied:** Added role check in `AdminPage.tsx` that renders an `AccessDenied` component for non-admin users. The component displays a friendly message and a button to return to the dashboard.

**File:** `apps/web/src/pages/AdminPage.tsx` (lines 16-60, 682-684)

---

## 4. Verified Working Features

All core routes and API endpoints are implemented and functional:

### Routes (React Router)
- [x] `/login` — Login page
- [x] `/mfa` — MFA verification
- [x] `/dashboard` — Population overview
- [x] `/patients` — Patient list with search
- [x] `/patients/:patientId` — Patient detail (6 tabs)
- [x] `/alerts` — Alert management
- [x] `/trends` — Population trends
- [x] `/reports` — Report generation
- [x] `/admin` — Admin panel (UI works, data is mock)
- [x] `*` — 404 page

### API Endpoints
- [x] `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`
- [x] `/clinicians/me`, `/clinicians/snapshot`, `/clinicians/caseload`
- [x] `/clinicians/notes/:patientId` (GET, POST)
- [x] `/patients/:id` (GET, PATCH)
- [x] `/patients/:id/care-team`, `/patients/:id/mood-heatmap`
- [x] `/alerts` (GET with filters)
- [x] `/alerts/patients/:patientId`
- [x] `/alerts/:id/acknowledge`, `/alerts/:id/resolve`
- [x] `/journal/shared/:patientId`
- [x] `/medications` (GET, POST, PATCH)
- [x] `/reports` (GET, POST)
- [x] `/invites` (GET, POST, resend, cancel)

---

## 5. Implementation Priorities

### Phase 1 — Quick Wins (Low Effort) ✅ COMPLETED
- [x] Add admin role check to `/admin` route (access denied for non-admins)
- [x] Connect existing `/clinicians` endpoint to Admin > Users section

### Phase 2 — Admin Foundation ✅ COMPLETED
- [x] Create `apps/api/src/routes/admin/index.ts` route module
- [x] Implement `GET /admin/users` (extend existing clinicians list)
- [x] Implement `GET /admin/audit-log` (query audit_logs table)
- [x] Implement `GET /admin/stats` (dashboard statistics)
- [x] Implement `GET /admin/audit-log/export` (CSV export)
- [x] Wire up Admin UI to real endpoints (Dashboard, Users, Audit Log, Roles sections)

### Phase 3 — User Management ✅ COMPLETED (API only)
- [x] Implement `POST /admin/users` (create clinician)
- [x] Implement `PATCH /admin/users/:id` (update clinician)
- [ ] Add user creation modal to Admin UI (future enhancement)
- [ ] Add user edit modal to Admin UI (future enhancement)

### Phase 4 — FHIR Integration (Future)
- [ ] Design FHIR endpoint configuration schema
- [ ] Create `fhir_endpoints` database table
- [ ] Implement FHIR management endpoints
- [ ] Build SMART on FHIR OAuth flow

---

## 6. Notes

### Database Tables That May Need Creation

For full Admin functionality:

```sql
-- FHIR endpoint configuration (future)
CREATE TABLE fhir_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('epic', 'cerner', 'oracle')),
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'smart_v2',
  client_id TEXT,
  -- encrypted credentials stored separately
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_sync_at TIMESTAMPTZ,
  patients_linked INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Existing Tables That Support Admin Features

- `clinicians` — User management (partially implemented via `/clinicians`)
- `audit_logs` — Audit trail (table exists, no admin query endpoint)
- `organisations` — Multi-tenant config

---

## 7. Acceptance Criteria

For each item to be marked complete:

1. **Button functionality** — Clicking triggers expected action
2. **API integration** — Real data from database, not mock
3. **Error handling** — User-friendly error messages
4. **Audit logging** — All admin actions logged
5. **Access control** — Admin-only endpoints return 403 for non-admins
