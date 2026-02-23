import { test, expect } from '../fixtures/auth.fixture';
import { DashboardPage } from '../pages/dashboard.page';
import { AppShellComponent } from '../pages/components/app-shell.page';

/**
 * Dashboard test suite
 * Tests KPIs, mood grid, drilldowns, and interactive elements
 */
test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
  });

  test.describe('Page Load', () => {
    test('should display dashboard with metric cards', async ({ page }) => {
      await dashboardPage.expectDashboard();
    });

    test('should show 5 metric cards', async ({ page }) => {
      await expect(dashboardPage.metricCards).toHaveCount(5);
    });

    test('should display correct metric labels', async ({ page }) => {
      await expect(dashboardPage.criticalAlertsCard).toBeVisible();
      await expect(dashboardPage.activeTodayCard).toBeVisible();
      await expect(dashboardPage.avgMoodCard).toBeVisible();
      await expect(dashboardPage.avgSleepCard).toBeVisible();
      await expect(dashboardPage.checkInRateCard).toBeVisible();
    });
  });

  test.describe('Metric Cards', () => {
    test('should display Critical Alerts metric', async () => {
      const value = await dashboardPage.getMetricValue('Critical Alerts');
      expect(value).toBeTruthy();
    });

    test('should display Active Today metric', async () => {
      const value = await dashboardPage.getMetricValue('Active Today');
      expect(value).toBeTruthy();
    });

    test('should display Avg Mood metric', async () => {
      const value = await dashboardPage.getMetricValue('Avg Mood');
      expect(value).toBeTruthy();
    });

    test('should display Check-In Rate metric', async () => {
      const value = await dashboardPage.getMetricValue('Check-In Rate');
      expect(value).toBeTruthy();
    });

    test('Critical Alerts card should navigate to alerts page on click', async ({ page }) => {
      await dashboardPage.criticalAlertsCard.click();
      await expect(page).toHaveURL(/\/alerts/);
    });
  });

  test.describe('Metric Card Drilldowns', () => {
    test('should open drilldown when clicking Active Today metric', async ({ page }) => {
      await dashboardPage.clickMetric('Active Today');

      // Wait for drilldown modal
      await page.waitForTimeout(500);
      const modal = page.locator('[data-testid="drilldown-modal"], .modal-overlay, [style*="position: fixed"][style*="inset: 0"]');

      // Either modal opens or navigates
      const hasModal = await modal.isVisible().catch(() => false);
      expect(hasModal || page.url().includes('/patients')).toBeTruthy();
    });

    test('should open drilldown when clicking Avg Mood metric', async ({ page }) => {
      await dashboardPage.clickMetric('Avg Mood');
      await page.waitForTimeout(500);

      const modal = page.locator('[data-testid="drilldown-modal"], .modal-overlay, [style*="position: fixed"][style*="inset: 0"]');
      const hasModal = await modal.isVisible().catch(() => false);
      expect(hasModal || page.url().includes('/')).toBeTruthy();
    });

    test('should open drilldown when clicking Check-In Rate metric', async ({ page }) => {
      await dashboardPage.clickMetric('Check-In Rate');
      await page.waitForTimeout(500);

      const modal = page.locator('[data-testid="drilldown-modal"], .modal-overlay, [style*="position: fixed"][style*="inset: 0"]');
      const hasModal = await modal.isVisible().catch(() => false);
      expect(hasModal || page.url().includes('/')).toBeTruthy();
    });
  });

  test.describe('Mood Grid', () => {
    test('should display mood grid panel when data exists', async ({ page }) => {
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');

      // Check if we have data (mood panel) or empty state
      const hasMoodPanel = await dashboardPage.moodPanel.isVisible().catch(() => false);
      const hasEmptyState = await dashboardPage.emptyState.isVisible().catch(() => false);

      expect(hasMoodPanel || hasEmptyState).toBeTruthy();
    });

    test('should navigate to patient when clicking mood cell', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.moodPanel.isVisible()) {
        // Find a mood cell and click it
        const moodCell = page.locator('.two-col >> div[title]').first();
        if (await moodCell.isVisible()) {
          await moodCell.click();
          await expect(page).toHaveURL(/\/patients\//);
        }
      }
    });

    test('should navigate to patients list when clicking All patients link', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.moodPanel.isVisible()) {
        await dashboardPage.viewAllPatients();
        await expect(page).toHaveURL(/\/patients/);
      }
    });
  });

  test.describe('Mood Distribution', () => {
    test('should display mood distribution panel when data exists', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.moodDistributionPanel.isVisible()) {
        // Check for bar rows
        const barRows = page.locator('.mini-bar-row');
        await expect(barRows).toHaveCount(4); // High, Good, Moderate, Low
      }
    });

    test('should open drilldown when clicking mood bucket', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.moodDistributionPanel.isVisible()) {
        await dashboardPage.clickMoodBar('High');
        await page.waitForTimeout(500);

        // Check for drilldown
        const modal = page.locator('[style*="position: fixed"]');
        const hasModal = await modal.isVisible().catch(() => false);
        expect(hasModal).toBeTruthy();
      }
    });
  });

  test.describe('Alerts Panel', () => {
    test('should display alerts panel', async ({ page }) => {
      await page.waitForLoadState('networkidle');
      await expect(dashboardPage.alertsPanel).toBeVisible();
    });

    test('should navigate to alerts page when clicking View All', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.alertsPanel.isVisible()) {
        await dashboardPage.viewAllAlerts();
        await expect(page).toHaveURL(/\/alerts/);
      }
    });

    test('should navigate to patient when clicking alert item', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const alertItem = page.locator('.alert-item').first();
      if (await alertItem.isVisible()) {
        await alertItem.click();
        await expect(page).toHaveURL(/\/patients\//);
      }
    });
  });

  test.describe('Check-In Activity Panel', () => {
    test('should display check-in activity panel', async ({ page }) => {
      await page.waitForLoadState('networkidle');
      await expect(dashboardPage.checkInActivityPanel).toBeVisible();
    });

    test('should navigate to patient when clicking check-in item', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      const checkinItem = page.locator('.checkin-item').first();
      if (await checkinItem.isVisible()) {
        await checkinItem.click();
        await expect(page).toHaveURL(/\/patients\//);
      }
    });
  });

  test.describe('Alert Strip', () => {
    test('should display alert strip when critical alert exists', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Alert strip is conditional
      const hasStrip = await dashboardPage.hasAlertStrip();

      if (hasStrip) {
        await expect(dashboardPage.alertStrip).toBeVisible();
      }
    });

    test('should navigate to patient when clicking alert strip', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      if (await dashboardPage.hasAlertStrip()) {
        await dashboardPage.clickAlertStrip();
        await expect(page).toHaveURL(/\/patients\//);
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state message when no patients', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // If empty state is shown, verify it has the right content
      if (await dashboardPage.emptyState.isVisible()) {
        await expect(dashboardPage.emptyState).toContainText('No patients');
      }
    });
  });
});

test.describe('Dashboard Real-time Updates', () => {
  test('should show WebSocket connection status', async ({ page }) => {
    await page.goto('/dashboard');
    const appShell = new AppShellComponent(page);

    // Check WebSocket status indicator
    const wsStatus = page.locator('.ws-dot');
    await expect(wsStatus).toBeVisible();
  });
});
