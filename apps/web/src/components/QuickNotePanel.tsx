// =============================================================================
// MindLog Web — QuickNotePanel
// Slide-in panel from the right edge for rapid clinical note creation.
// Pre-filled with the last-viewed patient (from UI store).
// Triggered by 'N' keyboard shortcut or quick-actions button.
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';

const NOTE_TYPES = [
  { value: 'observation',         label: 'Observation' },
  { value: 'intervention',        label: 'Intervention' },
  { value: 'appointment_summary', label: 'Appointment Summary' },
  { value: 'risk_assessment',     label: 'Risk Assessment' },
  { value: 'handover',            label: 'Handover Note' },
  { value: 'custom',              label: 'Custom' },
];

interface QuickNotePanelProps {
  open: boolean;
  onClose: () => void;
}

export function QuickNotePanel({ open, onClose }: QuickNotePanelProps) {
  const token = useAuthStore((s) => s.accessToken);
  const patientId = useUiStore((s) => s.patientId);
  const patientName = useUiStore((s) => s.patientName);

  const [noteType, setNoteType] = useState('observation');
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setBody('');
      setNoteType('observation');
      setIsPrivate(false);
      setSaved(false);
      setError('');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSave() {
    if (!token || !patientId || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/clinicians/notes/${patientId}`, {
        body: body.trim(),
        note_type: noteType,
        is_private: isPrivate,
      }, token);
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleSave();
  }

  const canSave = !!patientId && body.trim().length > 0 && !saving;

  return (
    <>
      {/* Backdrop (semi-transparent, not full-block) */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 900,
          }}
        />
      )}

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 380,
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          zIndex: 901,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onKeyDown={handleKeyDown}
        data-testid="quick-note-panel"
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Quick Note</div>
            {patientName ? (
              <div style={{ fontSize: 11, color: 'var(--safe)', marginTop: 2 }}>{patientName}</div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>Navigate to a patient first</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Note type */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 6 }}>Note Type</div>
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              data-testid="quick-note-type"
              style={{
                width: '100%', background: 'var(--glass-01)', border: '1px solid var(--border)',
                color: 'var(--ink)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none',
              }}
            >
              {NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Text area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 6 }}>
              Note Content <span style={{ color: 'var(--ink-ghost)', fontWeight: 400 }}>Cmd+Enter to save</span>
            </div>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start typing your clinical note…"
              data-testid="quick-note-text"
              style={{
                flex: 1, minHeight: 220, resize: 'vertical',
                background: 'var(--glass-01)', border: '1px solid var(--border)',
                color: 'var(--ink)', borderRadius: 8, padding: '10px 12px',
                fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'inherit',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--ink-ghost)', marginTop: 4 }}>
              {body.length} chars
            </div>
          </div>

          {/* Private toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-mid)' }}>Private note (only visible to me)</span>
          </label>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: 'var(--critical)', background: 'var(--critical-bg, rgba(214,40,40,0.1))', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          {/* Success flash */}
          {saved && (
            <div style={{ fontSize: 12, color: 'var(--safe)', background: 'rgba(42,157,143,0.1)', padding: '8px 12px', borderRadius: 6, textAlign: 'center' }}>
              ✓ Note saved
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--ink-mid)', borderRadius: 6, padding: '9px', fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave}
            data-testid="quick-note-save"
            style={{
              flex: 2, background: canSave ? 'var(--safe)' : 'var(--glass-02)',
              border: 'none', color: canSave ? '#0a0e1a' : 'var(--ink-soft)',
              borderRadius: 6, padding: '9px', fontSize: 13, fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </>
  );
}
