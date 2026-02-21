import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ padding: 32, background: '#0c0f18', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Figtree, system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ fontSize: 48, margin: '0 0 16px' }}>404</h2>
      <p style={{ color: '#8b9cb0' }}>Page not found</p>
      <Link to="/dashboard" style={{ color: '#2a9d8f', marginTop: 16 }}>
        Return to dashboard
      </Link>
    </div>
  );
}
