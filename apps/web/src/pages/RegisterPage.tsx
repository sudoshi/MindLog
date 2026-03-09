import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../services/api.js';
import { FernIcon } from '../components/FernIcon.js';
import '../styles/pages/login.css';

/* -- SVG ICONS (inline, matching LoginPage style) -- */

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

function MailIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 4l-10 8L2 4" />
    </svg>
  );
}

/* -- REGISTER PAGE -- */

export function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/auth/register-demo', {
        email,
        firstName,
        lastName,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page" data-testid="register-page">
      {/* -- LEFT: ATMOSPHERIC HERO -- */}
      <div className="login-hero" aria-hidden="true">
        <div className="login-orb login-orb--crimson" />
        <div className="login-orb login-orb--gold" />
        <div className="login-orb login-orb--teal" />

        <div className="login-hero-content">
          <div className="login-hero-fern">
            <FernIcon size={140} glow />
          </div>
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

      {/* -- RIGHT: REGISTRATION FORM -- */}
      <div className="login-form-panel">
        <div className="login-card">
          {success ? (
            /* -- SUCCESS STATE -- */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, margin: '0 auto 24px',
                borderRadius: '50%',
                background: 'rgba(45, 212, 191, 0.12)',
                border: '1px solid rgba(45, 212, 191, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--success, #2DD4BF)',
              }}>
                <MailIcon size={36} />
              </div>
              <h2 className="login-title" style={{ textAlign: 'center' }}>
                Check your inbox
              </h2>
              <p className="login-subtitle" style={{ textAlign: 'center', marginBottom: 24 }}>
                We have sent your temporary password to <strong style={{ color: 'var(--text-primary, #F0EDE8)' }}>{email}</strong>.
                Use it to sign in and you will be prompted to set a new password.
              </p>
              <Link
                to="/login"
                className="login-submit"
                style={{ textDecoration: 'none', display: 'flex' }}
              >
                Go to Sign In
              </Link>
            </div>
          ) : (
            /* -- REGISTRATION FORM -- */
            <>
              <div className="login-header">
                <h1 className="login-mobile-brand">Mind<span>Log</span></h1>
                <h2 className="login-title">Create Account</h2>
                <p className="login-subtitle">
                  Set up your demo clinician account
                </p>
              </div>

              <form
                id="register-form"
                onSubmit={(e) => void handleSubmit(e)}
                autoComplete="on"
              >
                {/* First Name */}
                <div className="login-field">
                  <label className="login-label" htmlFor="register-first-name">
                    First Name
                  </label>
                  <div className="login-input-wrap">
                    <input
                      id="register-first-name"
                      className="login-input"
                      type="text"
                      name="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                      placeholder="Jane"
                      disabled={loading}
                      data-testid="register-first-name"
                    />
                  </div>
                </div>

                {/* Last Name */}
                <div className="login-field">
                  <label className="login-label" htmlFor="register-last-name">
                    Last Name
                  </label>
                  <div className="login-input-wrap">
                    <input
                      id="register-last-name"
                      className="login-input"
                      type="text"
                      name="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                      placeholder="Smith"
                      disabled={loading}
                      data-testid="register-last-name"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="login-field">
                  <label className="login-label" htmlFor="register-email">
                    Email Address
                  </label>
                  <div className="login-input-wrap">
                    <input
                      id="register-email"
                      className="login-input"
                      type="email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@clinic.org"
                      disabled={loading}
                      data-testid="register-email"
                    />
                  </div>
                </div>

                {/* Phone (optional) */}
                <div className="login-field">
                  <label className="login-label" htmlFor="register-phone">
                    Phone <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                  </label>
                  <div className="login-input-wrap">
                    <input
                      id="register-phone"
                      className="login-input"
                      type="tel"
                      name="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder="(555) 555-0100"
                      disabled={loading}
                      data-testid="register-phone"
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="login-error" data-testid="register-error" role="alert">
                    <span className="login-error-icon"><AlertCircleIcon /></span>
                    <span className="login-error-text">{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  className="login-submit"
                  disabled={loading}
                  data-testid="register-submit"
                >
                  {loading && <span className="login-spinner" />}
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              {/* Link back to login */}
              <div style={{
                textAlign: 'center',
                marginTop: 24,
              }}>
                <p style={{
                  fontSize: 14,
                  color: 'var(--text-muted, #8A857D)',
                  margin: 0,
                }}>
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    style={{
                      color: 'var(--accent, #C9A227)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
