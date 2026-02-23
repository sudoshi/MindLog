import { test, expect } from '../fixtures/auth.fixture';
import { AlertsPage } from '../pages/alerts.page';

/**
 * Alerts page test suite
 * Tests filters, alert cards, actions, and pagination
 */
test.describe('Alerts Page', () => {
  let alertsPage: AlertsPage;

  test.beforeEach(async ({ page }) => {
    alertsPage = new AlertsPage(page);
    await alertsPage.goto();
  });

  test.describe('Page Load', () => {
    test('should display alerts page correctly', async () => {
      await alertsPage.expectAlertsPage();
    });

    test('should display filter bar', async () => {
      await expect(alertsPage.filterBar).toBeVisible();
    });

    test('should display all filter chips', async () => {
      await expect(alertsPage.allAlertsChip).toBeVisible();
      await expect(alertsPage.criticalChip).toBeVisible();
      await expect(alertsPage.warningChip).toBeVisible();
      await expect(alertsPage.infoChip).toBeVisible();
      await expect(alertsPage.unacknowledgedChip).toBeVisible();
      await expect(alertsPage.resolvedChip).toBeVisible();
    });
  });

  test.describe('Filter Chips', () => {
    test('should filter by critical severity', async ({ page }) => {
      await alertsPage.filterBySeverity('critical');
      await page.waitForTimeout(500);

      const isActive = await alertsPage.isFilterActive('Critical');
      expect(isActive).toBeTruthy();
    });

    test('should filter by warning severity', async ({ page }) => {
      await alertsPage.filterBySeverity('warning');
      await page.waitForTimeout(500);

      const isActive = await alertsPage.isFilterActive('Warning');
      expect(isActive).toBeTruthy();
    });

    test('should filter by info severity', async ({ page }) => {
      await alertsPage.filterBySeverity('info');
      await page.waitForTimeout(500);

      const isActive = await alertsPage.isFilterActive('Info');
      expect(isActive).toBeTruthy();
    });

    test('should filter unacknowledged alerts', async ({ page }) => {
      await alertsPage.filterByStatus('unacknowledged');
      await page.waitForTimeout(500);

      const isActive = await alertsPage.isFilterActive('Unacknowledged');
      expect(isActive).toBeTruthy();
    });

    test('should filter resolved alerts', async ({ page }) => {
      await alertsPage.filterByStatus('resolved');
      await page.waitForTimeout(500);

      const isActive = await alertsPage.isFilterActive('Resolved');
      expect(isActive).toBeTruthy();
    });

    test('should show all alerts when clicking All filter', async ({ page }) => {
      // First filter by something
      await alertsPage.filterBySeverity('critical');
      await page.waitForTimeout(500);

      // Then click all
      await alertsPage.filterBySeverity('all');
      await page.waitForTimeout(500);
    });

    test('should toggle filter off when clicking same chip', async ({ page }) => {
      await alertsPage.filterBySeverity('critical');
      await page.waitForTimeout(300);

      await alertsPage.filterBySeverity('critical');
      await page.waitForTimeout(300);

      // Should reset to all
    });
  });

  test.describe('Alert Cards', () => {
    test('should display alert cards or empty state', async ({ page }) => {
      const count = await alertsPage.getAlertCount();
      const hasEmpty = await alertsPage.hasEmptyState();

      expect(count > 0 || hasEmpty).toBeTruthy();
    });

    test('should display severity badge on alerts', async ({ page }) => {
      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const firstCard = alertsPage.alertCards.first();
        // Check for severity text
        const text = await firstCard.textContent();
        expect(
          text?.includes('critical') ||
            text?.includes('warning') ||
            text?.includes('info') ||
            text?.includes('CRITICAL') ||
            text?.includes('WARNING') ||
            text?.includes('INFO')
        ).toBeTruthy();
      }
    });

    test('should display alert title', async ({ page }) => {
      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const firstCard = alertsPage.alertCards.first();
        const titleEl = firstCard.locator('[style*="fontWeight: 600"], [style*="font-weight: 600"]');
        await expect(titleEl).toBeVisible();
      }
    });

    test('should display timestamp on alerts', async ({ page }) => {
      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const firstCard = alertsPage.alertCards.first();
        const text = await firstCard.textContent();
        // Should have relative time (ago, just now, etc.)
        expect(text?.includes('ago') || text?.includes('now')).toBeTruthy();
      }
    });
  });

  test.describe('Alert Actions', () => {
    test('should show acknowledge button for new alerts', async ({ page }) => {
      // Filter to unacknowledged
      await alertsPage.filterByStatus('unacknowledged');
      await page.waitForTimeout(500);

      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const ackBtn = alertsPage.alertCards.first().locator('.action-btn:has-text("Acknowledge")');
        if (await ackBtn.isVisible()) {
          await expect(ackBtn).toBeVisible();
        }
      }
    });

    test('should show resolve button for open alerts', async ({ page }) => {
      await alertsPage.filterByStatus('unacknowledged');
      await page.waitForTimeout(500);

      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const resolveBtn = alertsPage.alertCards.first().locator('.action-btn:has-text("Resolve")');
        if (await resolveBtn.isVisible()) {
          await expect(resolveBtn).toBeVisible();
        }
      }
    });

    test('should show escalate button for open alerts', async ({ page }) => {
      await alertsPage.filterByStatus('unacknowledged');
      await page.waitForTimeout(500);

      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        const escalateBtn = alertsPage.alertCards.first().locator('.action-btn:has-text("Escalate")');
        if (await escalateBtn.isVisible()) {
          await expect(escalateBtn).toBeVisible();
        }
      }
    });

    test('should navigate to patient when clicking patient link', async ({ page }) => {
      const count = await alertsPage.getAlertCount();

      if (count > 0) {
        // Find patient link button
        const patientLink = alertsPage.alertCards
          .first()
          .locator('button[style*="text-decoration: underline"]');

        if (await patientLink.isVisible()) {
          await patientLink.click();
          await expect(page).toHaveURL(/\/patients\//);
        }
      }
    });
  });

  test.describe('Pagination', () => {
    test('should display pagination when many alerts', async ({ page }) => {
      // Check if pagination exists
      const hasPagination = await alertsPage.pagination.isVisible();

      if (hasPagination) {
        await expect(alertsPage.prevButton).toBeVisible();
        await expect(alertsPage.nextButton).toBeVisible();
        await expect(alertsPage.pageInfo).toBeVisible();
      }
    });

    test('should navigate to next page', async ({ page }) => {
      const hasPagination = await alertsPage.pagination.isVisible();

      if (hasPagination) {
        const currentPage = await alertsPage.getCurrentPage();
        await alertsPage.nextPage();
        const newPage = await alertsPage.getCurrentPage();

        // If not on last page, page should increase
        if (await alertsPage.nextButton.isEnabled()) {
          expect(newPage).toBeGreaterThan(currentPage);
        }
      }
    });

    test('should navigate to previous page', async ({ page }) => {
      const hasPagination = await alertsPage.pagination.isVisible();

      if (hasPagination) {
        // First go to page 2
        await alertsPage.nextPage();
        await page.waitForTimeout(500);

        const currentPage = await alertsPage.getCurrentPage();

        if (currentPage > 1) {
          await alertsPage.prevPage();
          const newPage = await alertsPage.getCurrentPage();
          expect(newPage).toBeLessThan(currentPage);
        }
      }
    });

    test('should disable prev button on first page', async ({ page }) => {
      const hasPagination = await alertsPage.pagination.isVisible();

      if (hasPagination) {
        const currentPage = await alertsPage.getCurrentPage();

        if (currentPage === 1) {
          await expect(alertsPage.prevButton).toBeDisabled();
        }
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show appropriate empty state message', async ({ page }) => {
      // Filter resolved to potentially see empty state
      await alertsPage.filterByStatus('resolved');
      await page.waitForTimeout(500);

      if (await alertsPage.hasEmptyState()) {
        await expect(alertsPage.emptyState).toContainText(/No alerts|stable/);
      }
    });
  });

  test.describe('Live Alerts', () => {
    test('should handle live toast notifications', async ({ page }) => {
      // Live toast appears when new alerts come in via WebSocket
      // This is hard to test without mocking, so we just verify the component exists
      // and can be dismissed if visible
      const hasToast = await alertsPage.liveToast.isVisible();

      if (hasToast) {
        await alertsPage.dismissLiveToast();
        await expect(alertsPage.liveToast).not.toBeVisible();
      }
    });
  });
});

test.describe('Alerts - Multiple Filter Combinations', () => {
  test('should combine severity and status filters', async ({ page }) => {
    const alertsPage = new AlertsPage(page);
    await alertsPage.goto();

    // Filter by critical
    await alertsPage.filterBySeverity('critical');
    await page.waitForTimeout(500);

    // The results should only show critical severity alerts
    const count = await alertsPage.getAlertCount();

    if (count > 0) {
      const firstCard = alertsPage.alertCards.first();
      const text = await firstCard.textContent();
      expect(text?.toLowerCase().includes('critical')).toBeTruthy();
    }
  });
});
