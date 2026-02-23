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

*Last updated: 2026-02-23*
