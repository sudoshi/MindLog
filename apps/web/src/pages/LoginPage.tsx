import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../services/api.js';
import { authActions } from '../stores/auth.js';
import '../styles/pages/login.css';

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

/* ── SVG ICONS (inline to avoid external deps) ── */

function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45
        0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5
        18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function AlertCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── LOGIN PAGE ── */

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Prompt browser to save credentials using Credential Management API
  const saveCredentials = async (em: string, pw: string) => {
    if ('credentials' in navigator && 'PasswordCredential' in window) {
      try {
        const cred = new (window as unknown as {
          PasswordCredential: new (opts: { id: string; password: string }) => Credential;
        }).PasswordCredential({ id: em, password: pw });
        await navigator.credentials.store(cred);
      } catch {
        // Credential API not supported or user declined
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
        sessionStorage.setItem(MFA_PARTIAL_TOKEN_KEY, data.partial_token);
        navigate('/mfa');
        return;
      }

      if (data.access_token && data.clinician_id && data.org_id) {
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

        // Full page navigation triggers browser's "Save password?" prompt
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
    <main className="login-page" data-testid="login-page">
      {/* ── LEFT: ATMOSPHERIC HERO ── */}
      <div className="login-hero" aria-hidden="true">
        {/* Drifting luminous orbs */}
        <div className="login-orb login-orb--crimson" />
        <div className="login-orb login-orb--gold" />
        <div className="login-orb login-orb--teal" />

        {/* Hero content — brand + trust signals */}
        <div className="login-hero-content">
          <h1 className="login-hero-brand">
            Mind<span>Log</span>
          </h1>
          <p className="login-hero-tagline">
            Clinical intelligence for behavioral health teams.
            Monitor patient wellness, surface risk signals, and
            make informed care decisions — all in one view.
          </p>
          <div className="login-trust-row">
            <div className="login-trust-item">
              <span className="login-trust-icon"><ShieldIcon /></span>
              HIPAA Compliant
            </div>
            <div className="login-trust-item">
              <span className="login-trust-icon"><LockIcon /></span>
              SOC 2 Type II
            </div>
            <div className="login-trust-item">
              <span className="login-trust-icon"><CheckIcon /></span>
              FDA Class II
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: LOGIN FORM ── */}
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-header">
            {/* Brand shown only on mobile (hero is hidden) */}
            <h1 className="login-mobile-brand">Mind<span>Log</span></h1>
            <h2 className="login-title">Welcome back</h2>
            <p className="login-subtitle">
              Sign in to the clinician dashboard
            </p>
          </div>

          <form
            id="login-form"
            method="post"
            action="/dashboard"
            onSubmit={(e) => void handleSubmit(e)}
            autoComplete="on"
          >
            {/* Email */}
            <div className="login-field">
              <label className="login-label" htmlFor="login-email">
                Email address
              </label>
              <div className="login-input-wrap">
                <input
                  id="login-email"
                  className="login-input"
                  type="text"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="you@clinic.org"
                  disabled={loading}
                  data-testid="login-email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  className={`login-input login-input--has-toggle`}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={loading}
                  data-testid="login-password"
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="login-remember-row">
              <input
                type="checkbox"
                className="login-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                data-testid="login-remember"
              />
              <span className="login-checkbox-label">
                Remember me on this device
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="login-error" data-testid="login-error" role="alert">
                <span className="login-error-icon"><AlertCircleIcon /></span>
                <span className="login-error-text">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="login-submit"
              disabled={loading}
              data-testid="login-submit"
            >
              {loading && <span className="login-spinner" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="login-footer">
            <div className="login-footer-divider" />
            <div className="login-hipaa-badge">
              <span className="login-hipaa-dot" />
              HIPAA &middot; MFA Required
            </div>
            <p className="login-footer-text" style={{ marginTop: 12 }}>
              Clinician accounts require multi-factor authentication
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
