// =============================================================================
// MindLog Mobile — SecureStore auth token service
// Phase 2: persists access token + refresh token + user info securely.
// =============================================================================

import * as SecureStore from 'expo-secure-store';
import { API_PREFIX } from '@mindlog/shared';

// Support EXPO_PUBLIC_API_BASE for local demo (e.g. http://192.168.x.x:3000)
// Falls back to API_PREFIX alone (empty base = relative URL for production)
const API_BASE = process.env['EXPO_PUBLIC_API_BASE'] ?? '';
const API_URL = API_BASE ? `${API_BASE}${API_PREFIX}` : API_PREFIX;

const KEYS = {
  ACCESS_TOKEN: 'ml_access_token',
  REFRESH_TOKEN: 'ml_refresh_token',
  USER_ID: 'ml_user_id',
  USER_EMAIL: 'ml_user_email',
  USER_ROLE: 'ml_user_role',
  ORG_ID: 'ml_org_id',
  MFA_PARTIAL_TOKEN: 'ml_mfa_partial_token',
  INTAKE_COMPLETE: 'ml_intake_complete',
} as const;

export interface StoredUser {
  id: string;
  email: string;
  role: string;
  org_id: string;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
}

export async function getMfaPartialToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.MFA_PARTIAL_TOKEN);
}

export async function setMfaPartialToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.MFA_PARTIAL_TOKEN, token);
}

export async function clearMfaPartialToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.MFA_PARTIAL_TOKEN);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const [id, email, role, org_id] = await Promise.all([
    SecureStore.getItemAsync(KEYS.USER_ID),
    SecureStore.getItemAsync(KEYS.USER_EMAIL),
    SecureStore.getItemAsync(KEYS.USER_ROLE),
    SecureStore.getItemAsync(KEYS.ORG_ID),
  ]);
  if (!id || !email || !role || !org_id) return null;
  return { id, email, role, org_id };
}

export async function getIntakeComplete(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(KEYS.INTAKE_COMPLETE);
  return val === 'true';
}

export async function setIntakeComplete(complete: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.INTAKE_COMPLETE, complete ? 'true' : 'false');
}

export async function storeSession(params: {
  access_token: string;
  refresh_token?: string;
  user: StoredUser;
  intake_complete?: boolean;
}): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, params.access_token),
    params.refresh_token
      ? SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, params.refresh_token)
      : Promise.resolve(),
    SecureStore.setItemAsync(KEYS.USER_ID, params.user.id),
    SecureStore.setItemAsync(KEYS.USER_EMAIL, params.user.email),
    SecureStore.setItemAsync(KEYS.USER_ROLE, params.user.role),
    SecureStore.setItemAsync(KEYS.ORG_ID, params.user.org_id),
    params.intake_complete !== undefined
      ? SecureStore.setItemAsync(KEYS.INTAKE_COMPLETE, params.intake_complete ? 'true' : 'false')
      : Promise.resolve(),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)),
  );
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null;

/**
 * Silently refreshes the access token using the stored refresh token.
 * Deduplicates concurrent refresh calls.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      await clearSession();
      return null;
    }

    const json = (await res.json()) as {
      success: boolean;
      data?: { access_token: string; refresh_token?: string };
    };

    if (!json.success || !json.data?.access_token) {
      await clearSession();
      return null;
    }

    await setAccessToken(json.data.access_token);
    if (json.data.refresh_token) {
      await setRefreshToken(json.data.refresh_token);
    }

    return json.data.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Authenticated fetch wrapper
// Automatically attaches Authorization header and retries once on 401.
// ---------------------------------------------------------------------------

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  // Token expired — attempt silent refresh then retry once
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return res; // caller must handle auth failure
    headers.set('Authorization', `Bearer ${newToken}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  }

  return res;
}
