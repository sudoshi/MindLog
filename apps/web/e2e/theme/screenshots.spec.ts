/**
 * Theme Screenshot Comparison Tests
 *
 * Captures screenshots of all major pages for visual comparison between
 * legacy theme (dark-v1) and new theme (dark-v2).
 *
 * Usage:
 *   # Capture baseline (legacy theme)
 *   VITE_USE_NEW_THEME=false npm run test:e2e -- e2e/theme/screenshots.spec.ts --update-snapshots
 *
 *   # Capture new theme and compare
 *   VITE_USE_NEW_THEME=true npm run test:e2e -- e2e/theme/screenshots.spec.ts
 *
 * Screenshots are saved to: e2e/theme/__screenshots__/
 */
import { test, expect } from '@playwright/test';

// Determine theme name from env for screenshot naming
const themeName = process.env.VITE_USE_NEW_THEME === 'true' ? 'dark-v2' : 'dark-v1';

test.describe(`Theme Screenshots (${themeName})`, () => {
  // Use authenticated state
  test.use({ storageState: '.auth/clinician.json' });

  test.beforeEach(async ({ page }) => {
    // Wait for fonts and images to load
    await page.waitForLoadState('networkidle');
  });

  test('Login Page', async ({ page }) => {
    // Clear auth for login page screenshot
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`login-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Dashboard Page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`dashboard-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Patients List Page', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`patients-list-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Patient Detail Page', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Click first patient row if exists
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForLoadState('networkidle');
    }

    await expect(page).toHaveScreenshot(`patient-detail-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Alerts Page', async ({ page }) => {
    await page.goto('/alerts');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`alerts-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Trends Page', async ({ page }) => {
    await page.goto('/trends');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`trends-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('Admin Page (if accessible)', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`admin-${themeName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  // Component-focused screenshots
  test.describe('Components', () => {
    test('Sidebar Navigation', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const sidebar = page.locator('.sidebar').first();
      await expect(sidebar).toHaveScreenshot(`sidebar-${themeName}.png`, {
        animations: 'disabled',
      });
    });

    test('Topbar', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const topbar = page.locator('.topbar').first();
      await expect(topbar).toHaveScreenshot(`topbar-${themeName}.png`, {
        animations: 'disabled',
      });
    });

    test('Filter Chips', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');

      const filterBar = page.locator('.filter-bar').first();
      if (await filterBar.count() > 0) {
        await expect(filterBar).toHaveScreenshot(`filter-chips-${themeName}.png`, {
          animations: 'disabled',
        });
      } else {
        // Skip if no filter bar
        test.skip();
      }
    });

    test('Metric Cards', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Screenshot the metric row area
      const metricRow = page.locator('.metric-row, .view-pad').first();
      await expect(metricRow).toHaveScreenshot(`metric-area-${themeName}.png`, {
        animations: 'disabled',
      });
    });
  });

  // Interactive states
  test.describe('Interactive States', () => {
    test('Button Hover States', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const button = page.locator('button:visible').first();
      if (await button.count() > 0) {
        await button.hover();
        await expect(button).toHaveScreenshot(`button-hover-${themeName}.png`, {
          animations: 'disabled',
        });
      } else {
        test.skip();
      }
    });

    test('Input Focus State', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');

      const input = page.locator('input').first();
      if (await input.count() > 0) {
        await input.focus();
        await expect(input).toHaveScreenshot(`input-focus-${themeName}.png`, {
          animations: 'disabled',
        });
      } else {
        test.skip();
      }
    });

    test('Nav Item Active State', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');

      const activeNav = page.locator('.nav-item.active').first();
      if (await activeNav.count() > 0) {
        await expect(activeNav).toHaveScreenshot(`nav-active-${themeName}.png`, {
          animations: 'disabled',
        });
      } else {
        test.skip();
      }
    });
  });
});
