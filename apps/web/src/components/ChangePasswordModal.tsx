// =============================================================================
// MindLog Web — Change Password Modal
// Non-dismissable overlay shown when must_change_password is true.
// =============================================================================

import { useState } from 'react';
import { api, ApiError } from '../services/api.js';
import { authActions, useAuthStore } from '../stores/auth.js';

/* -- Password strength helpers -- */

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^a-zA-Z\d]/.test(pw)) score += 1;

  if (score <= 1) return { score, label: 'Weak', color: 'var(--critical, #E85A6B)' };
  if (score <= 2) return { score, label: 'Fair', color: 'var(--warning, #F59E0B)' };
  if (score <= 3) return { score, label: 'Good', color: 'var(--accent, #C9A227)' };
  return { score, label: 'Strong', color: 'var(--success, #2DD4BF)' };
}

export function ChangePasswordModal() {
  const token = useAuthStore((s) => s.accessToken);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const isValid = currentPassword.length > 0
    && newPassword.length >= 8
    && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError(null);
    setLoading(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      }, token ?? undefined);

      // Update auth store — clear the must_change_password flag
      authActions.clearMustChangePassword();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to change password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop — non-dismissable */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 2000,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, 92vw)',
          zIndex: 2001,
          background: 'var(--bg, #0c0f18)',
          border: '1px solid var(--border-default, #2A2A30)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
        }}
        data-testid="change-password-modal"
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px',
          borderBottom: '1px solid var(--border-default, #2A2A30)',
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'var(--font-display, "DM Serif Display", Georgia, serif)',
            fontSize: 22,
            fontWeight: 400,
            color: 'var(--text-primary, #F0EDE8)',
            letterSpacing: '-0.3px',
          }}>
            Change Your Password
          </h2>
          <p style={{
            margin: '6px 0 0',
            fontSize: 14,
            color: 'var(--text-muted, #8A857D)',
            lineHeight: 1.5,
          }}>
            Your account requires a password change before you can continue.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ padding: '20px 28px 28px' }}
        >
          {/* Current (temp) password */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="cp-current"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary, #C5C0B8)',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Current (Temporary) Password
            </label>
            <input
              id="cp-current"
              type="password"
              className="login-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your temporary password"
              disabled={loading}
              data-testid="cp-current-password"
            />
          </div>

          {/* New password */}
          <div style={{ marginBottom: 8 }}>
            <label
              htmlFor="cp-new"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary, #C5C0B8)',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              New Password
            </label>
            <input
              id="cp-new"
              type="password"
              className="login-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              disabled={loading}
              data-testid="cp-new-password"
            />
          </div>

          {/* Password strength indicator */}
          {newPassword.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex',
                gap: 4,
                marginBottom: 4,
              }}>
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 2,
                      background: level <= strength.score
                        ? strength.color
                        : 'var(--glass-01, rgba(255,255,255,0.04))',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
              <span style={{
                fontSize: 11,
                color: strength.color,
                fontWeight: 600,
              }}>
                {strength.label}
              </span>
            </div>
          )}

          {/* Confirm password */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="cp-confirm"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary, #C5C0B8)',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Confirm New Password
            </label>
            <input
              id="cp-confirm"
              type="password"
              className="login-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              disabled={loading}
              data-testid="cp-confirm-password"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: 'var(--critical, #E85A6B)',
              }}>
                Passwords do not match
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              background: 'var(--critical-bg, rgba(232,90,107,0.12))',
              border: '1px solid var(--critical-border, rgba(232,90,107,0.3))',
              borderRadius: 10,
              marginBottom: 16,
            }} role="alert" data-testid="cp-error">
              <span style={{
                fontSize: 13,
                color: 'var(--critical, #E85A6B)',
                lineHeight: 1.5,
              }}>
                {error}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="login-submit"
            disabled={loading || !isValid}
            data-testid="cp-submit"
          >
            {loading && <span className="login-spinner" />}
            {loading ? 'Changing password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </>
  );
}
