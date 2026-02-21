// =============================================================================
// MindLog Web — MFA verification page (TOTP)
// Shown after successful password login when clinician has MFA enabled.
// Reads the partial token from sessionStorage, calls /auth/mfa/verify,
// then stores the full session and redirects to the dashboard.
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { api, ApiError } from '../services/api.js';
import { authActions } from '../stores/auth.js';
import { MFA_PARTIAL_TOKEN_KEY } from './LoginPage.js';

interface MfaResponseData {
  access_token: string;
  clinician_id: string | null;
  org_id: string;
  role: string;
}

export function MfaPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect to login if no partial token
  useEffect(() => {
    const token = sessionStorage.getItem(MFA_PARTIAL_TOKEN_KEY);
    if (!token) {
      navigate('/login', { replace: true });
    } else {
      inputRef.current?.focus();
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, '');

    if (!/^\d{6}$/.test(trimmed)) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }

    const partialToken = sessionStorage.getItem(MFA_PARTIAL_TOKEN_KEY);
    if (!partialToken) {
      navigate('/login', { replace: true });
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Pass partial token as Bearer; API extracts factor_id internally
      const data = await api.post<MfaResponseData>('/auth/mfa/verify', { code: trimmed }, partialToken);

      sessionStorage.removeItem(MFA_PARTIAL_TOKEN_KEY);

      authActions.login(
        data.access_token,
        data.clinician_id ?? data.org_id,
        data.org_id,
      );

      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Verification failed. Please try again.');
      }
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    sessionStorage.removeItem(MFA_PARTIAL_TOKEN_KEY);
    navigate('/login', { replace: true });
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0c0f18',
        fontFamily: 'Figtree, system-ui, sans-serif',
      }}
    >
      <div style={{ width: 400, padding: 40, background: '#161a27', borderRadius: 12 }}>
        <h1
          style={{
            fontFamily: 'Fraunces, serif',
            color: DESIGN_TOKENS.COLOR_PRIMARY,
            fontSize: 26,
            margin: '0 0 8px',
            textAlign: 'center',
          }}
        >
          Two-factor authentication
        </h1>
        <p style={{ color: '#8b9cb0', margin: '0 0 32px', fontSize: 14, textAlign: 'center' }}>
          Enter the 6-digit code from your authenticator app to complete sign in.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label style={{ display: 'block', color: '#c5ccd6', fontSize: 13, marginBottom: 8 }}>
            Authenticator code
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoComplete="one-time-code"
            disabled={loading}
            style={{
              ...inputStyle,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 12,
              textAlign: 'center',
              borderColor: DESIGN_TOKENS.COLOR_PRIMARY,
              padding: '14px 12px',
            }}
          />

          {error && (
            <p style={{ color: DESIGN_TOKENS.COLOR_DANGER, fontSize: 13, marginTop: 12 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 0',
              marginTop: 20,
              background: loading || code.length !== 6 ? '#1d7a6f' : DESIGN_TOKENS.COLOR_PRIMARY,
              opacity: code.length !== 6 ? 0.5 : 1,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <button
          onClick={handleCancel}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 0',
            marginTop: 12,
            background: 'transparent',
            color: '#8b9cb0',
            border: 'none',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel — sign in with a different account
        </button>

        <div
          style={{
            marginTop: 28,
            padding: 14,
            borderRadius: 8,
            border: '1px solid #4a1010',
            background: '#1a0a0a',
          }}
        >
          <p style={{ color: '#fc8181', fontSize: 12, margin: 0, textAlign: 'center' }}>
            In crisis? Call or text <strong>988</strong> now.
          </p>
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  background: '#0c0f18',
  border: '1px solid #2d3748',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: 14,
  boxSizing: 'border-box',
};
