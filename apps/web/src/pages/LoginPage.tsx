import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGN_TOKENS } from '@mindlog/shared';
import { api, ApiError } from '../services/api.js';
import { authActions } from '../stores/auth.js';

// Partial token is stored in sessionStorage between login and MFA steps
export const MFA_PARTIAL_TOKEN_KEY = 'ml_mfa_partial_token';

interface LoginResponseData {
  access_token?: string;
  refresh_token?: string;
  clinician_id?: string;
  org_id?: string;
  role?: string;
  mfa_required?: true;
  partial_token?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await api.post<LoginResponseData>('/auth/login', { email, password });

      if (data.mfa_required && data.partial_token) {
        // Store partial token for the MFA page
        sessionStorage.setItem(MFA_PARTIAL_TOKEN_KEY, data.partial_token);
        navigate('/mfa');
        return;
      }

      if (data.access_token && data.clinician_id && data.org_id) {
        authActions.login(data.access_token, data.clinician_id, data.org_id);
        navigate('/dashboard');
      } else {
        setError('Unexpected response from server. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
            fontSize: 28,
            margin: '0 0 8px',
          }}
        >
          MindLog
        </h1>
        <p style={{ color: '#8b9cb0', margin: '0 0 32px', fontSize: 14 }}>
          Clinician Dashboard
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label style={{ display: 'block', color: '#c5ccd6', fontSize: 13, marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            autoComplete="email"
            disabled={loading}
          />

          <label style={{ display: 'block', color: '#c5ccd6', fontSize: 13, marginBottom: 4, marginTop: 16 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
            autoComplete="current-password"
            disabled={loading}
          />

          {error && (
            <p style={{ color: DESIGN_TOKENS.COLOR_DANGER, fontSize: 13, marginTop: 12 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 0',
              marginTop: 24,
              background: loading ? '#1d7a6f' : DESIGN_TOKENS.COLOR_PRIMARY,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ color: '#4a5568', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
          MFA required for clinician accounts (HIPAA)
        </p>
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
