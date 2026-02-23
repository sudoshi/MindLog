// =============================================================================
// MindLog Web — Invite Patient Modal
// POST /invites — sends invite email to a prospective patient.
// =============================================================================

import { useState } from 'react';
import { api, ApiError } from '../services/api.js';

interface Props {
  token: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

const S = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(5,8,16,0.72)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  box: {
    background: 'rgba(14,18,36,0.98)',
    border: '1px solid rgba(255,255,255,0.13)',
    borderRadius: 16,
    boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
    width: '100%',
    maxWidth: 460,
    padding: 28,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--ink)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-soft)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '4px 8px',
    borderRadius: 6,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ink-mid)',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  group: { marginBottom: 18 },
  counter: { textAlign: 'right' as const, fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 },
  error: {
    background: 'var(--critical-bg)',
    border: '1px solid var(--critical-border)',
    color: 'var(--critical)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    marginBottom: 16,
  },
  footer: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
} as const;

export function InvitePatientModal({ token, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const MAX_MSG = 500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post(
        '/invites',
        { email: email.trim(), ...(message.trim() ? { personal_message: message.trim() } : {}) },
        token,
      );
      onSuccess(email.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.backdrop} onClick={onClose} data-testid="invite-modal-backdrop">
      <div style={S.box} onClick={(e) => e.stopPropagation()} data-testid="invite-modal">
        <div style={S.header}>
          <span style={S.title}>Invite Patient</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={S.group}>
            <label style={S.label}>Patient Email *</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="patient@example.com"
              required
              autoFocus
              data-testid="invite-email"
            />
          </div>

          <div style={S.group}>
            <label style={S.label}>
              Personal Message{' '}
              <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>
                — optional
              </span>
            </label>
            <textarea
              className="form-input"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MSG))}
              placeholder="e.g. I look forward to seeing you at our appointment on Thursday…"
              rows={4}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13, width: '100%' }}
              data-testid="invite-message"
            />
            <div style={S.counter}>{message.length} / {MAX_MSG}</div>
          </div>

          {error && <div style={S.error}>{error}</div>}

          <div style={S.footer}>
            <button
              type="button"
              className="detail-actions-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="detail-actions-btn primary"
              disabled={loading}
              data-testid="invite-submit"
            >
              {loading ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
