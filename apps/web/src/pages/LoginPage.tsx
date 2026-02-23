import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Prompt browser to save credentials using Credential Management API
  const saveCredentials = async (email: string, password: string) => {
    if ('credentials' in navigator && 'PasswordCredential' in window) {
      try {
        const cred = new (window as unknown as { PasswordCredential: new (opts: { id: string; password: string }) => Credential }).PasswordCredential({
          id: email,
          password: password,
        });
        await navigator.credentials.store(cred);
      } catch {
        // Credential API not supported or user declined — ignore
      }
    }
  };

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
        // Prompt browser to save credentials
        await saveCredentials(email, password);

        authActions.login(
          data.access_token,
          data.clinician_id,
          data.org_id,
          data.refresh_token,
          900,
          rememberMe,
          data.role ?? 'clinician',
        );

        // Use full page navigation to trigger browser's "Save password?" prompt
        // SPA navigation (navigate()) doesn't trigger this in most browsers
        window.location.href = '/dashboard';
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
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{
        width: 400,
        padding: '40px 36px',
        background: 'var(--glass-02)',
        backdropFilter: 'blur(32px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(32px) saturate(1.5)',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border2)',
        boxShadow: 'var(--shadow-lg), inset 0 1px 0 var(--glass-hi)',
      }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--safe)',
            fontSize: 30,
            fontWeight: 400,
            margin: '0 0 6px',
            letterSpacing: '-0.5px',
          }}
        >
          MindLog
        </h1>
        <p style={{ color: 'var(--ink-mid)', margin: '0 0 32px', fontSize: 13 }}>
          Clinician Dashboard
        </p>

        <form
          id="login-form"
          method="post"
          action="/dashboard"
          onSubmit={(e) => void handleSubmit(e)}
          autoComplete="on"
        >
          <label style={labelStyle}>
            Email
          </label>
          <input
            type="text"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            autoComplete="username"
            disabled={loading}
          />

          <label style={{ ...labelStyle, marginTop: 18 }}>
            Password
          </label>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
            autoComplete="current-password"
            disabled={loading}
          />

          {/* Remember Me */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{
                width: 15,
                height: 15,
                accentColor: 'var(--safe)',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              Remember me on this device
            </span>
          </label>

          {error && (
            <p style={{ color: 'var(--critical)', fontSize: 13, marginTop: 12 }}>
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
              background: loading ? 'rgba(16,185,129,0.6)' : 'var(--safe)',
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--ink-mid)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--ink)',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
};
