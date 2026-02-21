// =============================================================================
// MindLog Web — Auth store
// Simple in-memory auth state. Tokens stored in httpOnly cookies via API.
// Phase 1: wire up to real Supabase Auth session management.
// =============================================================================

import { useState, useEffect } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  clinicianId: string | null;
  orgId: string | null;
}

// Minimal zustand-like store without zustand dependency for Phase 0 skeleton.
// Replace with zustand or TanStack Store in Phase 1.
type Listener = () => void;

let state: AuthState = {
  isAuthenticated: false,
  accessToken: null,
  clinicianId: null,
  orgId: null,
};

const listeners = new Set<Listener>();

function setState(partial: Partial<AuthState>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

function getState(): AuthState {
  return state;
}

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  return selector(getState());
}

export const authActions = {
  login(token: string, clinicianId: string, orgId: string): void {
    setState({ isAuthenticated: true, accessToken: token, clinicianId, orgId });
  },
  logout(): void {
    setState({ isAuthenticated: false, accessToken: null, clinicianId: null, orgId: null });
  },
};
