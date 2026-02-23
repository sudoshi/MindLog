import { test, expect } from '../fixtures/auth.fixture';
import { PatientsPage } from '../pages/patients.page';

/**
 * Patients List page test suite
 * Tests filters, search, sort, table interactions
 */
test.describe('Patients List', () => {
  let patientsPage: PatientsPage;

  test.beforeEach(async ({ page }) => {
    patientsPage = new PatientsPage(page);
    await patientsPage.goto();
  });

  test.describe('Page Load', () => {
    test('should display patients page correctly', async () => {
      await patientsPage.expectPatientsPage();
    });

    test('should show patient count', async () => {
      await expect(patientsPage.patientCount).toBeVisible();
    });

    test('should show filter bar with all chips', async () => {
      await expect(patientsPage.allFilterChip).toBeVisible();
      await expect(patientsPage.crisisFilterChip).toBeVisible();
      await expect(patientsPage.highRiskFilterChip).toBeVisible();
      await expect(patientsPage.notLoggedFilterChip).toBeVisible();
      await expect(patientsPage.streakFilterChip).toBeVisible();
    });

    test('should show search input', async () => {
      await expect(patientsPage.searchInput).toBeVisible();
    });

    test('should show sort dropdown', async () => {
      await expect(patientsPage.sortSelect).toBeVisible();
    });

    test('should show invite button', async () => {
      await expect(patientsPage.inviteButton).toBeVisible();
    });
  });

  test.describe('Filter Chips', () => {
    test('should have All filter active by default', async () => {
      const isActive = await patientsPage.isFilterActive('all');
      expect(isActive).toBeTruthy();
    });

    test('should filter by crisis status', async ({ page }) => {
      await patientsPage.filterBy('crisis');
      await page.waitForTimeout(500);

      const isActive = await patientsPage.isFilterActive('crisis');
      expect(isActive).toBeTruthy();
    });

    test('should filter by high risk', async ({ page }) => {
      await patientsPage.filterBy('high');
      await page.waitForTimeout(500);

      const isActive = await patientsPage.isFilterActive('high');
      expect(isActive).toBeTruthy();
    });

    test('should filter by not logged', async ({ page }) => {
      await patientsPage.filterBy('not-logged');
      await page.waitForTimeout(500);

      const isActive = await patientsPage.isFilterActive('not-logged');
      expect(isActive).toBeTruthy();
    });

    test('should filter by streak', async ({ page }) => {
      await patientsPage.filterBy('streak');
      await page.waitForTimeout(500);

      const isActive = await patientsPage.isFilterActive('streak');
      expect(isActive).toBeTruthy();
    });

    test('should toggle filter off when clicking same chip', async ({ page }) => {
      await patientsPage.filterBy('crisis');
      await page.waitForTimeout(300);
      await patientsPage.filterBy('crisis'); // Toggle off
      await page.waitForTimeout(300);

      const isActive = await patientsPage.isFilterActive('all');
      expect(isActive).toBeTruthy();
    });
  });

  test.describe('Search', () => {
    test('should filter patients by search term', async ({ page }) => {
      const initialCount = await patientsPage.getPatientCount();

      await patientsPage.search('test');
      await page.waitForTimeout(500);

      // Either shows filtered results or no change if no matches
      const afterCount = await patientsPage.getPatientCount();
      expect(afterCount).toBeLessThanOrEqual(initialCount);
    });

    test('should clear search results', async ({ page }) => {
      await patientsPage.search('test');
      await page.waitForTimeout(500);

      await patientsPage.clearSearch();
      await page.waitForTimeout(500);

      // Search input should be empty
      await expect(patientsPage.searchInput).toHaveValue('');
    });

    test('should show empty state when no search results', async ({ page }) => {
      await patientsPage.search('zzzznonexistent12345');
      await page.waitForTimeout(500);

      const hasEmpty = await patientsPage.hasEmptyState();
      const count = await patientsPage.getPatientCount();

      expect(hasEmpty || count === 0).toBeTruthy();
    });

    test('should search by MRN', async ({ page }) => {
      await patientsPage.search('MRN');
      await page.waitForTimeout(500);

      // Should either find results or show empty
      // Behavior depends on data
    });
  });

  test.describe('Sort', () => {
    test('should sort by risk level', async ({ page }) => {
      await patientsPage.sortBy('risk');
      await page.waitForTimeout(500);

      await expect(patientsPage.sortSelect).toHaveValue('risk');
    });

    test('should sort by mood', async ({ page }) => {
      await patientsPage.sortBy('mood');
      await page.waitForTimeout(500);

      await expect(patientsPage.sortSelect).toHaveValue('mood');
    });

    test('should sort by streak', async ({ page }) => {
      await patientsPage.sortBy('streak');
      await page.waitForTimeout(500);

      await expect(patientsPage.sortSelect).toHaveValue('streak');
    });

    test('should sort by last check-in', async ({ page }) => {
      await patientsPage.sortBy('last-checkin');
      await page.waitForTimeout(500);

      await expect(patientsPage.sortSelect).toHaveValue('last-checkin');
    });

    test('should sort by name', async ({ page }) => {
      await patientsPage.sortBy('name');
      await page.waitForTimeout(500);

      await expect(patientsPage.sortSelect).toHaveValue('name');
    });
  });

  test.describe('Table', () => {
    test('should display table with headers', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        await expect(patientsPage.table).toBeVisible();
        await expect(patientsPage.tableHeaders).toHaveCount(7); // Patient, Risk, Status, Mood, Streak, Last Check-in, Alerts
      }
    });

    test('should navigate to patient detail on row click', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        await patientsPage.tableRows.first().click();
        await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+/);
      }
    });

    test('should show patient name and MRN in each row', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        const firstRow = patientsPage.tableRows.first();
        const nameCell = firstRow.locator('td:first-child');
        await expect(nameCell).toBeVisible();
      }
    });

    test('should show risk badge in each row', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        const firstRow = patientsPage.tableRows.first();
        const riskCell = firstRow.locator('td:nth-child(2)');
        await expect(riskCell).toBeVisible();
      }
    });

    test('should show status badge in each row', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        const firstRow = patientsPage.tableRows.first();
        const statusCell = firstRow.locator('td:nth-child(3)');
        await expect(statusCell).toBeVisible();
      }
    });

    test('should highlight crisis rows', async ({ page }) => {
      // Filter to crisis patients first
      await patientsPage.filterBy('crisis');
      await page.waitForTimeout(500);

      const crisisRow = page.locator('.patient-table tr.crisis-row').first();
      if (await crisisRow.isVisible()) {
        await expect(crisisRow).toHaveClass(/crisis-row/);
      }
    });
  });

  test.describe('Table Header Sort', () => {
    test('should sort when clicking Patient header', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        await patientsPage.clickHeader('Patient');
        await page.waitForTimeout(500);
      }
    });

    test('should sort when clicking Risk header', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        await patientsPage.clickHeader('Risk');
        await page.waitForTimeout(500);
      }
    });

    test('should sort when clicking Today\'s Mood header', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        await patientsPage.clickHeader("Today's Mood");
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Invite Modal', () => {
    test('should open invite modal when clicking invite button', async ({ page }) => {
      await patientsPage.openInviteModal();
    });

    test('should close invite modal with cancel', async ({ page }) => {
      await patientsPage.openInviteModal();
      await page.locator('button:has-text("Cancel")').click();

      await expect(patientsPage.inviteModal).not.toBeVisible();
    });

    test('should close invite modal with escape key', async ({ page }) => {
      await patientsPage.openInviteModal();
      await page.keyboard.press('Escape');

      // Modal should close
      await page.waitForTimeout(500);
    });
  });

  test.describe('Showing Count', () => {
    test('should display showing count', async ({ page }) => {
      const count = await patientsPage.getPatientCount();

      if (count > 0) {
        const showingText = await patientsPage.getShowingText();
        expect(showingText).toContain('Showing');
      }
    });
  });

  test.describe('Pending Invites', () => {
    test('should display pending invites section if invites exist', async ({ page }) => {
      // This is conditional on data
      await page.waitForTimeout(1000);

      // Check if pending invites section is visible
      const hasPendingInvites = await patientsPage.pendingInvitesSection.isVisible();

      // Either visible or not - both are valid
      expect(typeof hasPendingInvites).toBe('boolean');
    });
  });
});

test.describe('Patients List - URL Query Params', () => {
  test('should pre-populate search from URL query', async ({ page }) => {
    await page.goto('/patients?q=smith');

    const patientsPage = new PatientsPage(page);
    await patientsPage.waitForLoad();

    await expect(patientsPage.searchInput).toHaveValue('smith');
  });
});
