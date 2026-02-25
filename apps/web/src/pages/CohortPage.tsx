// =============================================================================
// MindLog Web — Cohort Builder v2 page
// Route: /cohort  (clinician + admin roles)
//
// Two-column layout: left filter builder + saved cohorts,
// right results panel with patient list, analytics, and export.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CohortFilterGroup } from '@mindlog/shared';
import { api, ApiError } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { CohortFilterBuilder } from '../components/CohortFilterBuilder.js';
import {
  CohortResultsPanel,
  type CohortPatientRow,
  type CohortAggregates,
} from '../components/CohortResultsPanel.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedCohort {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  filter_version?: number;
  color?: string;
  is_pinned?: boolean;
  last_count: number | null;
  last_run_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BORDER = 'var(--border)';
const TEXT = 'var(--ink)';
const SUB = 'var(--ink-mid)';
const PRIMARY = 'var(--safe)';
const CARD = 'var(--glass-01)';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_FILTER: CohortFilterGroup = { logic: 'AND', rules: [] };

export function CohortPage() {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.role);

  // Admin-only guard — defense-in-depth against direct URL access
  if (role !== 'admin') {
    return (
      <div className="view-pad">
        <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            Access Restricted
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
            The Cohort Builder is available to administrators only.
            Contact your system administrator for access.
          </div>
        </div>
      </div>
    );
  }

  // Filter state
  const [filterGroup, setFilterGroup] = useState<CohortFilterGroup>(EMPTY_FILTER);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Results state
  const [patients, setPatients] = useState<CohortPatientRow[]>([]);
  const [aggregates, setAggregates] = useState<CohortAggregates | null>(null);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0, has_next: false });
  const [sorting, setSorting] = useState({ field: 'name', dir: 'asc' });
  const [queryLoading, setQueryLoading] = useState(false);

  // Saved cohorts
  const [savedCohorts, setSavedCohorts] = useState<SavedCohort[]>([]);
  const [cohortName, setCohortName] = useState('');
  const [cohortColor, setCohortColor] = useState('#6edcd0');
  const [savingCohort, setSavingCohort] = useState(false);
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // Fetch saved cohorts on mount
  useEffect(() => {
    if (!token) return;
    void api.get<{ items: SavedCohort[] }>('/research/', token).then((res) => setSavedCohorts(res.items)).catch(() => {});
  }, [token]);

  // Live count — debounced 500ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (filterGroup.rules.length === 0) {
      setLiveCount(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (!token) return;
      setCountLoading(true);
      try {
        const res = await api.post<{ count: number }>(
          '/research/cohorts/count',
          { filters: filterGroup },
          token,
        );
        setLiveCount(res.count);
      } catch {
        setLiveCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 500);
  }, [filterGroup, token]);

  // Execute full query
  const executeQuery = useCallback(async (
    overrideOffset?: number,
    overrideSortBy?: string,
    overrideSortDir?: string,
  ) => {
    if (!token || filterGroup.rules.length === 0) return;
    setQueryLoading(true);
    try {
      const result = await api.post<{
        patients: CohortPatientRow[];
        aggregates: CohortAggregates;
        pagination: { total: number; limit: number; offset: number; has_next: boolean };
      }>('/research/cohorts/query', {
        filters: filterGroup,
        limit: 50,
        offset: overrideOffset ?? pagination.offset,
        sort_by: overrideSortBy ?? sorting.field,
        sort_dir: overrideSortDir ?? sorting.dir,
      }, token);
      setPatients(result.patients);
      setAggregates(result.aggregates);
      setPagination(result.pagination);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  }, [token, filterGroup, pagination.offset, sorting]);

  function handleSearch() {
    setPagination((p) => ({ ...p, offset: 0 }));
    void executeQuery(0);
  }

  function handleSort(field: string) {
    const newDir = sorting.field === field && sorting.dir === 'asc' ? 'desc' : 'asc';
    setSorting({ field, dir: newDir });
    void executeQuery(0, field, newDir);
  }

  function handlePageChange(newOffset: number) {
    setPagination((p) => ({ ...p, offset: newOffset }));
    void executeQuery(newOffset);
  }

  // Save cohort (create or update)
  async function handleSaveCohort() {
    if (!token || !cohortName.trim() || filterGroup.rules.length === 0) return;
    setSavingCohort(true);
    try {
      if (editingCohortId) {
        await api.put(`/research/cohorts/${editingCohortId}`, {
          name: cohortName.trim(),
          filters: filterGroup,
          color: cohortColor,
        }, token);
        showToast('Cohort updated');
      } else {
        await api.post('/research/cohorts/v2', {
          name: cohortName.trim(),
          filters: filterGroup,
          color: cohortColor,
        }, token);
        showToast('Cohort saved');
      }
      const res = await api.get<{ items: SavedCohort[] }>('/research/', token);
      setSavedCohorts(res.items);
      setCohortName('');
      setEditingCohortId(null);
    } catch {
      showToast('Failed to save cohort');
    } finally {
      setSavingCohort(false);
    }
  }

  // Load a saved cohort
  function loadCohort(cohort: SavedCohort) {
    if (cohort.filter_version === 2 && cohort.filters && 'logic' in cohort.filters) {
      setFilterGroup(cohort.filters as unknown as CohortFilterGroup);
    } else {
      // v1 cohorts: convert flat filters to a v2 AND group
      const rules = Object.entries(cohort.filters)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([field, value]) => ({
          field,
          op: 'eq' as const,
          value: typeof value === 'boolean' ? value : String(value),
        }));
      setFilterGroup({ logic: 'AND', rules });
    }
    setCohortName(cohort.name);
    setCohortColor(cohort.color ?? '#6edcd0');
    setEditingCohortId(cohort.id);
  }

  // Delete a saved cohort
  async function handleDeleteCohort(id: string) {
    if (!token) return;
    try {
      await api.delete(`/research/cohorts/${id}`, token);
      setSavedCohorts((prev) => prev.filter((c) => c.id !== id));
      if (editingCohortId === id) {
        setEditingCohortId(null);
        setCohortName('');
      }
      showToast('Cohort deleted');
    } catch {
      showToast('Failed to delete cohort');
    }
  }

  // Take snapshot
  async function handleSnapshot(id: string) {
    if (!token) return;
    try {
      await api.post(`/research/cohorts/${id}/snapshot`, {}, token);
      showToast('Snapshot captured');
    } catch {
      showToast('Snapshot failed');
    }
  }

  return (
    <div className="view-pad">
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, alignItems: 'start' }}>

        {/* ── LEFT: Filter builder + save + saved cohorts ── */}
        <div>
          <CohortFilterBuilder
            filterGroup={filterGroup}
            onFilterChange={setFilterGroup}
            liveCount={liveCount}
            countLoading={countLoading}
            onSearch={handleSearch}
          />

          {/* Save / update cohort */}
          {filterGroup.rules.length > 0 && (
            <div className="panel anim anim-d1" style={{ marginBottom: 14 }}>
              <div className="panel-header">
                <div className="panel-title">
                  {editingCohortId ? 'Update Cohort' : 'Save Cohort'}
                </div>
              </div>
              <div style={{ padding: '8px 16px 14px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Cohort name..."
                    value={cohortName}
                    onChange={(e) => setCohortName(e.target.value)}
                    style={{
                      flex: 1, background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
                      borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none',
                    }}
                  />
                  <input
                    type="color"
                    value={cohortColor}
                    onChange={(e) => setCohortColor(e.target.value)}
                    title="Cohort color"
                    style={{
                      width: 34, height: 34, border: `1px solid ${BORDER}`,
                      borderRadius: 6, cursor: 'pointer', padding: 2,
                      background: CARD,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void handleSaveCohort()}
                    disabled={savingCohort || !cohortName.trim()}
                    style={{
                      flex: 1, background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}55`, color: PRIMARY,
                      borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                      cursor: savingCohort || !cohortName.trim() ? 'not-allowed' : 'pointer',
                      opacity: !cohortName.trim() ? 0.5 : 1,
                    }}
                  >
                    {savingCohort ? 'Saving...' : editingCohortId ? 'Update' : 'Save'}
                  </button>
                  {editingCohortId && (
                    <button
                      onClick={() => { setEditingCohortId(null); setCohortName(''); setFilterGroup(EMPTY_FILTER); }}
                      style={{
                        background: 'transparent', border: `1px solid ${BORDER}`, color: SUB,
                        borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Saved cohorts list */}
          {savedCohorts.length > 0 && (
            <div className="panel anim anim-d2">
              <div className="panel-header">
                <div className="panel-title">Saved Cohorts</div>
                <div className="panel-sub">{savedCohorts.length} saved</div>
              </div>
              {savedCohorts.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  {/* Color dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: c.color ?? '#6edcd0', flexShrink: 0,
                  }} />
                  {/* Name + meta */}
                  <div
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => loadCohort(c)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                      {c.name}
                      {c.filter_version === 2 && (
                        <span style={{ fontSize: 9, color: PRIMARY, marginLeft: 6, fontWeight: 400 }}>v2</span>
                      )}
                    </div>
                    {c.last_count != null && (
                      <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
                        {c.last_count} patients
                        {c.last_run_at ? ` \u00B7 ${new Date(c.last_run_at).toLocaleDateString()}` : ''}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {c.filter_version === 2 && (
                      <button
                        onClick={() => void handleSnapshot(c.id)}
                        title="Take snapshot"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: 14, padding: '2px 4px', color: SUB,
                        }}
                      >
                        {'\uD83D\uDCF8'}
                      </button>
                    )}
                    <button
                      onClick={() => void handleDeleteCohort(c.id)}
                      title="Delete cohort"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 14, padding: '2px 4px', color: 'var(--ink-soft)',
                      }}
                    >
                      {'\uD83D\uDDD1'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Results panel ── */}
        <CohortResultsPanel
          patients={patients}
          aggregates={aggregates}
          pagination={pagination}
          sorting={sorting}
          onSort={handleSort}
          onPageChange={handlePageChange}
          loading={queryLoading}
          hasFilters={filterGroup.rules.length > 0}
          filterGroup={filterGroup}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--glass-02)', border: `1px solid ${BORDER}`,
          color: TEXT, padding: '10px 18px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 1100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
