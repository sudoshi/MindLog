// =============================================================================
// MindLog Web — Auth store
// In-memory auth state with optional localStorage/sessionStorage persistence.
// Remember Me = true  → localStorage  (survives tab/browser close)
// Remember Me = false → sessionStorage (survives refresh, cleared on tab close)
// =============================================================================

import { useState, useEffect } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null; // unix seconds
  clinicianId: string | null;
  orgId: string | null;
  role: string | null; // 'clinician' | 'admin' | 'patient'
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEYS = {
  accessToken:    'ml_access_token',
  refreshToken:   'ml_refresh_token',
  tokenExpiresAt: 'ml_token_expires_at',
  clinicianId:    'ml_clinician_id',
  orgId:          'ml_org_id',
  role:           'ml_role',
} as const;

// ---------------------------------------------------------------------------
// Minimal zustand-like store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: AuthState = {
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: null,
  clinicianId: null,
  orgId: null,
  role: null,
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
    return () => { listeners.delete(listener); };
  }, []);

  return selector(getState());
}

// ---------------------------------------------------------------------------
// Storage helpers — write/read/clear both storages
// ---------------------------------------------------------------------------

function writeToStorage(
  storage: Storage,
  token: string,
  refreshToken: string | undefined,
  expiresAt: number,
  clinicianId: string,
  orgId: string,
  role: string,
): void {
  storage.setItem(KEYS.accessToken, token);
  storage.setItem(KEYS.tokenExpiresAt, String(expiresAt));
  storage.setItem(KEYS.clinicianId, clinicianId);
  storage.setItem(KEYS.orgId, orgId);
  storage.setItem(KEYS.role, role);
  if (refreshToken) storage.setItem(KEYS.refreshToken, refreshToken);
}

function clearStorage(storage: Storage): void {
  Object.values(KEYS).forEach((k) => storage.removeItem(k));
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export const authActions = {
  /**
   * Called after a successful login response.
   * @param remember true  → persist to localStorage (survives browser restart)
   *                 false → persist to sessionStorage (cleared on tab close)
   */
  login(
    token: string,
    clinicianId: string,
    orgId: string,
    refreshToken?: string,
    expiresIn = 900, // seconds, default 15 min
    remember = false,
    role = 'clinician',
  ): void {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    // Clear whichever storage we're NOT using so stale entries don't confuse
    // initFromStorage() after the user switches remember preference.
    const primary   = remember ? localStorage   : sessionStorage;
    const secondary = remember ? sessionStorage  : localStorage;
    clearStorage(secondary);
    writeToStorage(primary, token, refreshToken, expiresAt, clinicianId, orgId, role);

    setState({
      isAuthenticated: true,
      accessToken: token,
      refreshToken: refreshToken ?? null,
      tokenExpiresAt: expiresAt,
      clinicianId,
      orgId,
      role,
    });
  },

  /**
   * Called by the proactive refresh timer in AppShell.
   * Refreshes both in-memory state and whichever storage currently holds the
   * session (determined by where the access token key is present).
   */
  setTokens(accessToken: string, refreshToken: string, expiresIn = 900): void {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    // Rewrite to the same storage layer that originally stored the session
    const storage = localStorage.getItem(KEYS.accessToken) !== null
      ? localStorage
      : sessionStorage;
    storage.setItem(KEYS.accessToken,    accessToken);
    storage.setItem(KEYS.refreshToken,   refreshToken);
    storage.setItem(KEYS.tokenExpiresAt, String(expiresAt));

    setState({ accessToken, refreshToken, tokenExpiresAt: expiresAt });
  },

  logout(): void {
    clearStorage(localStorage);
    clearStorage(sessionStorage);
    setState({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      clinicianId: null,
      orgId: null,
      role: null,
    });
  },

  /**
   * Called once at app startup (before first render) to restore a persisted
   * session. Checks localStorage first (Remember Me), then sessionStorage.
   * Expired tokens are discarded rather than restored.
   */
  initFromStorage(): void {
    const storage =
      localStorage.getItem(KEYS.accessToken) !== null ? localStorage :
      sessionStorage.getItem(KEYS.accessToken) !== null ? sessionStorage :
      null;

    if (!storage) return;

    const token       = storage.getItem(KEYS.accessToken);
    const refresh     = storage.getItem(KEYS.refreshToken);
    const expiresAt   = Number(storage.getItem(KEYS.tokenExpiresAt) ?? 0);
    const clinicianId = storage.getItem(KEYS.clinicianId);
    const orgId       = storage.getItem(KEYS.orgId);
    const role        = storage.getItem(KEYS.role) ?? 'clinician';

    // Discard if any required field is missing or the access token is expired.
    // The proactive refresh in AppShell will renew it shortly after mount if
    // it's within the 2-min refresh window — but if it's already past expiry
    // we'd get 401s immediately, so better to force a fresh login.
    if (!token || !clinicianId || !orgId || expiresAt < Math.floor(Date.now() / 1000)) {
      clearStorage(storage);
      return;
    }

    setState({
      isAuthenticated: true,
      accessToken: token,
      refreshToken: refresh,
      tokenExpiresAt: expiresAt,
      clinicianId,
      orgId,
      role,
    });
  },
};

// Read-only accessor for use outside React (e.g. api.ts)
export { getState as getAuthState };
