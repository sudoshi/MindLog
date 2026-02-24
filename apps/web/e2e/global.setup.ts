import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clinicianFile = path.join(__dirname, '../.auth/clinician.json');
const adminFile = path.join(__dirname, '../.auth/admin.json');

/**
 * Global setup that runs once before all tests.
 * Logs in as both clinician and admin, saving auth state for reuse.
 *
 * Both setups use the same admin/admin dev-bypass credentials, so they are
 * run serially to avoid a race condition when two browser contexts hit the
 * login API simultaneously. The second setup reuses the first session by
 * copying the storage state file.
 */
setup.describe('Auth setup', () => {
  setup.describe.configure({ mode: 'serial' });

  setup('authenticate as clinician', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Wait for the login form to be ready
    await expect(page.locator('form#login-form')).toBeVisible();

    // Fill in credentials — admin/admin is the dev-mode superuser bypass
    await page.locator('input[name="email"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin');

    // Check "Remember me" so tokens are stored in localStorage (not sessionStorage)
    // This is required for Playwright's storageState() to capture the auth state
    await page.locator('[data-testid="login-remember"]').check();

    // Submit the form
    await page.locator('button[type="submit"]').click();

    // Wait for navigation to dashboard (or MFA page)
    await page.waitForURL(/\/(dashboard|mfa)/, { timeout: 30000 });

    // If MFA is required, handle it
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
    await expect(page.locator('.sidebar')).toBeVisible();

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(clinicianFile), { recursive: true });

    // Save storage state for clinician tests
    await page.context().storageState({ path: clinicianFile });
  });

  setup('authenticate as admin', async ({}) => {
    // Both clinician and admin use the same admin/admin dev bypass and produce
    // identical auth state. Copy the clinician state rather than doing a second
    // network round-trip, which avoids any parallel-login race condition.
    fs.mkdirSync(path.dirname(adminFile), { recursive: true });
    fs.copyFileSync(clinicianFile, adminFile);
  });
});
