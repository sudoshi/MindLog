// =============================================================================
// MindLog Web — GlobalSearch (command palette)
// Triggered by / or CMD+K. Shows grouped results: patients + notes.
// Arrow key navigation + Enter to navigate.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientResult {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
  status: string;
  risk_level: string | null;
  similarity: number;
}

interface NoteResult {
  id: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
  note_type: string;
  body_excerpt: string;
  created_at: string;
}

interface SearchResults {
  patients: PatientResult[];
  notes: NoteResult[];
}

// Unified result item for keyboard nav
interface FlatResult {
  type: 'patient' | 'note';
  id: string;
  patientId: string;
  label: string;
  sublabel: string;
  badge?: string;
  badgeColor?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--warning)', moderate: '#c9972a', low: 'var(--safe)',
};
const STATUS_COLORS: Record<string, string> = {
  crisis: 'var(--critical)', active: 'var(--safe)', inactive: 'var(--ink-soft)',
};

function flattenResults(results: SearchResults): FlatResult[] {
  const flat: FlatResult[] = [];
  for (const p of results.patients) {
    flat.push({
      type: 'patient',
      id: p.id,
      patientId: p.id,
      label: `${p.last_name}, ${p.first_name}`,
      sublabel: p.mrn,
      badge: p.status,
      badgeColor: STATUS_COLORS[p.status] ?? 'var(--ink-soft)',
    });
  }
  for (const n of results.notes) {
    flat.push({
      type: 'note',
      id: n.id,
      patientId: n.patient_id,
      label: n.body_excerpt.slice(0, 80) + (n.body_excerpt.length > 80 ? '…' : ''),
      sublabel: `${n.patient_last_name}, ${n.patient_first_name} · ${n.note_type}`,
      badge: n.note_type,
      badgeColor: 'var(--ink-soft)',
    });
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ patients: [], notes: [] });
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ patients: [], notes: [] });
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !token) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults({ patients: [], notes: [] });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<SearchResults>(
          `/search?q=${encodeURIComponent(query.trim())}&types=patients,notes`,
          token,
        );
        setResults(res);
        setActiveIdx(0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [query, open, token]);

  const flat = flattenResults(results);

  const navigate_ = useCallback((item: FlatResult) => {
    navigate(`/patients/${item.patientId}`);
    onClose();
  }, [navigate, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flat[activeIdx]) {
      navigate_(flat[activeIdx]!);
    }
  }, [flat, activeIdx, navigate_, onClose]);

  if (!open) return null;

  const totalResults = flat.length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', zIndex: 1200,
        }}
      />

      {/* Palette */}
      <div style={{
        position: 'fixed', top: '15vh', left: '50%', transform: 'translateX(-50%)',
        width: 'min(640px, 90vw)', zIndex: 1201,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }} data-testid="global-search">
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, color: 'var(--ink-soft)' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search patients, notes…"
            data-testid="global-search-input"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--ink)', fontSize: 15, caretColor: 'var(--safe)',
            }}
          />
          {loading && (
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Searching…</span>
          )}
          <kbd style={{ fontSize: 10, color: 'var(--ink-soft)', background: 'var(--glass-02)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 400, overflowY: 'auto' }} data-testid="global-search-results">
          {query.trim().length < 2 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
              Type at least 2 characters to search
            </div>
          ) : totalResults === 0 && !loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
              No results found for "{query}"
            </div>
          ) : (
            <>
              {/* Patients section */}
              {results.patients.length > 0 && (
                <>
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Patients
                  </div>
                  {results.patients.map((p, i) => {
                    const flatIdx = i;
                    const isActive = activeIdx === flatIdx;
                    return (
                      <div
                        key={p.id}
                        onClick={() => navigate_({ type: 'patient', id: p.id, patientId: p.id, label: '', sublabel: '' })}
                        style={{
                          padding: '10px 16px', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: 10,
                          background: isActive ? 'var(--glass-02)' : 'transparent',
                        }}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        data-testid={`global-search-result-patient-${p.id}`}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--glass-02)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: 'var(--safe)',
                        }}>
                          {p.first_name.charAt(0)}{p.last_name.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                            {p.last_name}, {p.first_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>MRN: {p.mrn}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: `${STATUS_COLORS[p.status] ?? 'var(--ink-soft)'}22`, color: STATUS_COLORS[p.status] ?? 'var(--ink-soft)' }}>
                            {p.status}
                          </span>
                          {p.risk_level && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: `${RISK_COLORS[p.risk_level] ?? 'var(--ink-soft)'}22`, color: RISK_COLORS[p.risk_level] ?? 'var(--ink-soft)' }}>
                              {p.risk_level}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Notes section */}
              {results.notes.length > 0 && (
                <>
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: results.patients.length > 0 ? '1px solid var(--border)' : undefined }}>
                    Clinical Notes
                  </div>
                  {results.notes.map((n, i) => {
                    const flatIdx = results.patients.length + i;
                    const isActive = activeIdx === flatIdx;
                    return (
                      <div
                        key={n.id}
                        onClick={() => navigate(`/patients/${n.patient_id}`) && onClose()}
                        style={{
                          padding: '10px 16px', cursor: 'pointer',
                          background: isActive ? 'var(--glass-02)' : 'transparent',
                        }}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        data-testid={`global-search-result-note-${n.id}`}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-mid)', marginBottom: 2 }}>
                          {n.patient_last_name}, {n.patient_first_name} · <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{n.note_type}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.body_excerpt}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--ink-soft)' }}>
          <span>↑↓ Navigate</span>
          <span>↵ Open patient</span>
          <span>ESC Close</span>
          {totalResults > 0 && <span style={{ marginLeft: 'auto' }}>{totalResults} result{totalResults !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </>
  );
}
