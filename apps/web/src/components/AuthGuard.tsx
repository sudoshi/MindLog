import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';

/** Redirects to /login if the clinician is not authenticated. */
export function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
