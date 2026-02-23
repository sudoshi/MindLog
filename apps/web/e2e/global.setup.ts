import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_KEYS = [
  'ml_access_token',
  'ml_refresh_token',
  'ml_token_expires_at',
  'ml_clinician_id',
  'ml_org_id',
  'ml_role',
];

const clinicianFile = path.join(__dirname, '../.auth/clinician.json');
const adminFile = path.join(__dirname, '../.auth/admin.json');

/**
 * Global setup that runs once before all tests.
 * Logs in as both clinician and admin, saving auth state for reuse.
 */
setup('authenticate as clinician', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Wait for the login form to be ready
  await expect(page.locator('form#login-form')).toBeVisible();

  // Fill in clinician credentials - using admin bypass since demo data may not exist
  // In dev mode, admin/admin is a superuser bypass that works without Supabase
  await page.locator('input[name="email"]').fill('admin');
  await page.locator('input[name="password"]').fill('admin');

  // Check "Remember me" so tokens are stored in localStorage (not sessionStorage)
  // This is required for Playwright's storageState() to capture the auth state
  await page.locator('[data-testid="login-remember"]').check();

  // Submit the form
  await page.locator('button[type="submit"]').click();

  // Wait for navigation to dashboard (or MFA page)
  await page.waitForURL(/\/(dashboard|mfa)/, { timeout: 30000 });

  // If MFA is required, handle it (for demo, MFA may be skipped)
  if (page.url().includes('/mfa')) {
    // In demo mode, MFA might accept a test code or be bypassed
    // This would need adjustment based on actual MFA implementation
    const mfaInput = page.locator('input[name="code"]');
    if (await mfaInput.isVisible()) {
      await mfaInput.fill('123456'); // Demo MFA code
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('/dashboard', { timeout: 30000 });
    }
  }

  // Verify we're logged in
  await expect(page).toHaveURL(/\/dashboard/);

  // Verify the sidebar is visible (indicates successful auth)
  await expect(page.locator('.sidebar')).toBeVisible();

  // Save storage state
  await page.context().storageState({ path: clinicianFile });
});

setup('authenticate as admin', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Wait for the login form to be ready
  await expect(page.locator('form#login-form')).toBeVisible();

  // Fill in admin credentials
  await page.locator('input[name="email"]').fill('admin');
  await page.locator('input[name="password"]').fill('admin');

  // Check "Remember me" so tokens are stored in localStorage (not sessionStorage)
  // This is required for Playwright's storageState() to capture the auth state
  await page.locator('[data-testid="login-remember"]').check();

  // Submit the form
  await page.locator('button[type="submit"]').click();

  // Wait for navigation
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

  // Verify we're logged in
  await expect(page).toHaveURL(/\/dashboard/);

  // Save storage state
  await page.context().storageState({ path: adminFile });
});
