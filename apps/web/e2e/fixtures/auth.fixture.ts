import { test as base, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage paths (unused now but kept for reference)
const clinicianAuthFile = path.join(__dirname, '../../.auth/clinician.json');
const adminAuthFile = path.join(__dirname, '../../.auth/admin.json');

// Storage keys used by MindLog
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'ml_access_token',
  REFRESH_TOKEN: 'ml_refresh_token',
  TOKEN_EXPIRES_AT: 'ml_token_expires_at',
  CLINICIAN_ID: 'ml_clinician_id',
  ORG_ID: 'ml_org_id',
  ROLE: 'ml_role',
} as const;

export type UserRole = 'clinician' | 'admin';

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<{
  /**
   * Login as a specific role during a test
   * Useful for tests that need to switch users or test role-specific behavior
   */
  loginAs: (role: UserRole) => Promise<void>;
  /**
   * Clear all auth state and log out
   */
  logout: () => Promise<void>;
  /**
   * Check if currently authenticated
   */
  isAuthenticated: () => Promise<boolean>;
  /**
   * Get current user role from storage
   */
  getCurrentRole: () => Promise<string | null>;
}>({
  loginAs: async ({ page }, use) => {
    const loginAs = async (role: UserRole) => {
      // In dev mode, admin/admin is a superuser bypass
      // Using same credentials for both roles since dev bypass creates an admin user
      const credentials = { email: 'admin', password: 'admin' };

      // Navigate to login
      await page.goto('/login');
      await expect(page.locator('form#login-form')).toBeVisible();

      // Fill and submit
      await page.locator('input[name="email"]').fill(credentials.email);
      await page.locator('input[name="password"]').fill(credentials.password);
      await page.locator('button[type="submit"]').click();

      // Wait for redirect
      await page.waitForURL(/\/(dashboard|mfa)/, { timeout: 30000 });

      // Handle MFA if needed
      if (page.url().includes('/mfa')) {
        const mfaInput = page.locator('input[name="code"]');
        if (await mfaInput.isVisible()) {
          await mfaInput.fill('123456');
          await page.locator('button[type="submit"]').click();
          await page.waitForURL('/dashboard', { timeout: 30000 });
        }
      }

      await expect(page).toHaveURL(/\/dashboard/);
    };

    await use(loginAs);
  },

  logout: async ({ page }, use) => {
    const logout = async () => {
      // Click the logout button in the sidebar
      const logoutBtn = page.locator('.sidebar-footer-btn');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
      }

      // Clear local storage
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Wait for redirect to login
      await page.waitForURL('/login', { timeout: 10000 }).catch(() => {
        // If not automatically redirected, navigate manually
        return page.goto('/login');
      });
    };

    await use(logout);
  },

  isAuthenticated: async ({ page }, use) => {
    const isAuthenticated = async () => {
      const token = await page.evaluate(() => {
        return localStorage.getItem('ml_access_token');
      });
      return token !== null && token !== '';
    };

    await use(isAuthenticated);
  },

  getCurrentRole: async ({ page }, use) => {
    const getCurrentRole = async () => {
      return page.evaluate(() => {
        return localStorage.getItem('ml_role');
      });
    };

    await use(getCurrentRole);
  },
});

export { expect };

/**
 * Helper to wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options?: { timeout?: number }
) {
  return page.waitForResponse(
    (response) => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout: options?.timeout ?? 30000 }
  );
}

/**
 * Helper to wait for navigation with loading state
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to dismiss any visible toasts
 */
export async function dismissToasts(page: Page) {
  const toasts = page.locator('[role="alert"], .toast, [data-testid="toast"]');
  const count = await toasts.count();
  for (let i = 0; i < count; i++) {
    const closeBtn = toasts.nth(i).locator('button');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  }
}
