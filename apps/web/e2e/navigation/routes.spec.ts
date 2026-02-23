import { test, expect } from '../fixtures/auth.fixture';
import { AppShellComponent } from '../pages/components/app-shell.page';

/**
 * Navigation test suite
 * Tests all routes, sidebar navigation, and URL handling
 */
test.describe('Navigation', () => {
  let appShell: AppShellComponent;

  test.beforeEach(async ({ page }) => {
    appShell = new AppShellComponent(page);
  });

  test.describe('Sidebar Navigation', () => {
    test('should navigate to dashboard via sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.expectAppShell();
      await appShell.navigateTo('dashboard');

      await expect(page).toHaveURL(/\/dashboard/);
      expect(await appShell.isNavActive('dashboard')).toBeTruthy();
    });

    test('should navigate to patients via sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('patients');

      await expect(page).toHaveURL(/\/patients/);
      expect(await appShell.isNavActive('patients')).toBeTruthy();
    });

    test('should navigate to alerts via sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('alerts');

      await expect(page).toHaveURL(/\/alerts/);
      expect(await appShell.isNavActive('alerts')).toBeTruthy();
    });

    test('should navigate to trends via sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('trends');

      await expect(page).toHaveURL(/\/trends/);
      expect(await appShell.isNavActive('trends')).toBeTruthy();
    });

    test('should navigate to reports via sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('reports');

      await expect(page).toHaveURL(/\/reports/);
      expect(await appShell.isNavActive('reports')).toBeTruthy();
    });
  });

  test.describe('Direct URL Access', () => {
    test('should access dashboard directly', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.locator('.metric-card')).toBeVisible();
    });

    test('should access patients directly', async ({ page }) => {
      await page.goto('/patients');
      await expect(page).toHaveURL(/\/patients/);
      await expect(page.locator('.filter-bar')).toBeVisible();
    });

    test('should access alerts directly', async ({ page }) => {
      await page.goto('/alerts');
      await expect(page).toHaveURL(/\/alerts/);
      await expect(page.locator('.filter-bar')).toBeVisible();
    });

    test('should access trends directly', async ({ page }) => {
      await page.goto('/trends');
      await expect(page).toHaveURL(/\/trends/);
    });

    test('should access reports directly', async ({ page }) => {
      await page.goto('/reports');
      await expect(page).toHaveURL(/\/reports/);
    });

    test('should redirect root to dashboard', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe('URL Parameters', () => {
    test('should preserve search query parameter on patients page', async ({ page }) => {
      await page.goto('/patients?q=smith');
      await expect(page).toHaveURL(/\/patients\?q=smith/);

      // Verify search input has the query
      const searchInput = page.locator('input[placeholder*="Search"]');
      await expect(searchInput).toHaveValue('smith');
    });

    test('should preserve patientId on reports page', async ({ page }) => {
      await page.goto('/reports?patientId=test-123');
      await expect(page).toHaveURL(/\/reports\?patientId=test-123/);
    });
  });

  test.describe('Patient Detail Navigation', () => {
    test('should navigate to patient detail from patients list', async ({ page }) => {
      await page.goto('/patients');

      // Wait for patients to load
      await page.waitForLoadState('networkidle');

      // If there are patients, click the first one
      const firstRow = page.locator('.patient-table tbody tr').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+/);
      }
    });

    test('should navigate back from patient detail to patients list', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');

      const firstRow = page.locator('.patient-table tbody tr').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForURL(/\/patients\/[a-z0-9-]+/);

        // Click back button
        await page.locator('button:has-text("All Patients")').click();
        await expect(page).toHaveURL(/\/patients$/);
      }
    });
  });

  test.describe('Browser Navigation', () => {
    test('should support back navigation', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('patients');
      await expect(page).toHaveURL(/\/patients/);

      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('should support forward navigation', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.navigateTo('patients');
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goForward();
      await expect(page).toHaveURL(/\/patients/);
    });
  });

  test.describe('404 Page', () => {
    test('should show 404 page for unknown routes', async ({ page }) => {
      await page.goto('/unknown-route-that-does-not-exist');
      await expect(page.locator('text=404')).toBeVisible();
    });

    test('should show 404 page for invalid patient ID', async ({ page }) => {
      await page.goto('/patients/invalid-patient-id-12345');
      // Should either show 404 or "not found" message
      const has404 = await page.locator('text=404').isVisible();
      const hasNotFound = await page.locator('text=/not found|access denied/i').isVisible();
      expect(has404 || hasNotFound).toBeTruthy();
    });
  });

  test.describe('Topbar Navigation', () => {
    test('should update topbar title based on route', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.locator('.topbar-title')).toContainText('Population Overview');

      await appShell.navigateTo('patients');
      await expect(page.locator('.topbar-title')).toContainText('All Patients');

      await appShell.navigateTo('alerts');
      await expect(page.locator('.topbar-title')).toContainText('Clinical Alerts');
    });

    test('should search patients from topbar', async ({ page }) => {
      await page.goto('/dashboard');
      await appShell.searchPatient('smith');

      await expect(page).toHaveURL(/\/patients\?q=smith/);
    });
  });

  test.describe('Active State Indicators', () => {
    test('should highlight active nav item for dashboard', async ({ page }) => {
      await page.goto('/dashboard');
      const navItem = page.locator('.nav-item:has-text("Population")');
      await expect(navItem).toHaveClass(/active/);
    });

    test('should highlight active nav item for patients', async ({ page }) => {
      await page.goto('/patients');
      const navItem = page.locator('.nav-item:has-text("All Patients")');
      await expect(navItem).toHaveClass(/active/);
    });

    test('should highlight patients nav when on patient detail', async ({ page }) => {
      await page.goto('/patients');
      const firstRow = page.locator('.patient-table tbody tr').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
        await page.waitForURL(/\/patients\/[a-z0-9-]+/);

        // Patients nav should still be active
        const navItem = page.locator('.nav-item:has-text("All Patients")');
        await expect(navItem).toHaveClass(/active/);
      }
    });
  });
});

test.describe('Admin-Only Routes (Clinician)', () => {
  // These tests run with clinician auth (default storage state)

  test('should show access denied for admin page as clinician', async ({ page }) => {
    await page.goto('/admin');

    // Should see access denied message
    await expect(page.locator('text=Admin Access Required')).toBeVisible();
  });

  test('should not show admin nav item for clinician', async ({ page }) => {
    await page.goto('/dashboard');
    const appShell = new AppShellComponent(page);

    const isVisible = await appShell.isAdminNavVisible();
    expect(isVisible).toBeFalsy();
  });
});
