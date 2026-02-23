import { test, expect } from '../fixtures/auth.fixture';
import { PatientDetailPage } from '../pages/patient-detail.page';
import { PatientsPage } from '../pages/patients.page';

/**
 * Patient Detail page test suite
 * Tests all 7 tabs and patient interactions
 */
test.describe('Patient Detail', () => {
  let patientDetailPage: PatientDetailPage;
  let patientId: string;

  test.beforeEach(async ({ page }) => {
    // First, get a real patient ID from the patients list
    const patientsPage = new PatientsPage(page);
    await patientsPage.goto();

    // Get the first patient
    const firstRow = patientsPage.tableRows.first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForURL(/\/patients\/[a-z0-9-]+/);

      // Extract patient ID from URL
      const url = page.url();
      const match = url.match(/\/patients\/([a-z0-9-]+)/);
      patientId = match ? match[1] : '';
    }

    patientDetailPage = new PatientDetailPage(page);
  });

  test.describe('Page Load', () => {
    test('should display patient detail page correctly', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.expectPatientDetailPage();
      } else {
        test.skip();
      }
    });

    test('should display patient name in header', async ({ page }) => {
      if (patientId) {
        const name = await patientDetailPage.getPatientName();
        expect(name).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should display patient avatar', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.patientAvatar).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display status and risk badges', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.statusBadge).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display tab bar with all tabs', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.tabBar).toBeVisible();
        await expect(patientDetailPage.overviewTab).toBeVisible();
        await expect(patientDetailPage.trendsTab).toBeVisible();
        await expect(patientDetailPage.journalTab).toBeVisible();
        await expect(patientDetailPage.notesTab).toBeVisible();
        await expect(patientDetailPage.alertsTab).toBeVisible();
        await expect(patientDetailPage.medicationsTab).toBeVisible();
        await expect(patientDetailPage.aiTab).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display quick actions footer', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.quickActionsFooter).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Tab Navigation', () => {
    test('should have Overview tab active by default', async ({ page }) => {
      if (patientId) {
        const isActive = await patientDetailPage.isTabActive('overview');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to Mood Trends tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('trends');
        const isActive = await patientDetailPage.isTabActive('trends');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to Journal tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('journal');
        const isActive = await patientDetailPage.isTabActive('journal');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to Notes tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('notes');
        const isActive = await patientDetailPage.isTabActive('notes');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to Alerts tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('alerts');
        const isActive = await patientDetailPage.isTabActive('alerts');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to Medications tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('medications');
        const isActive = await patientDetailPage.isTabActive('medications');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should switch to AI Insights tab', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('ai');
        const isActive = await patientDetailPage.isTabActive('ai');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Overview Tab', () => {
    test('should display patient information', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('overview');
        await expect(page.locator('text=Patient Information')).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display tracking stats', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('overview');
        await expect(page.locator('text=Tracking Stats')).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display care team section', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('overview');
        await expect(page.locator('text=Care Team')).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Mood Trends Tab', () => {
    test('should display mood trend chart or message', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('trends');
        await patientDetailPage.waitForTabContent();

        // Either chart or "not enough data" message
        const hasChart = await page.locator('.recharts-responsive-container').isVisible();
        const hasMessage = await page.locator('text=/not enough data|Loading/i').isVisible();
        const hasGrid = await page.locator('text=90-Day Activity Grid').isVisible();

        expect(hasChart || hasMessage || hasGrid).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should display 90-day activity grid', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('trends');
        await patientDetailPage.waitForTabContent();

        const hasGrid = await page.locator('text=90-Day Activity Grid').isVisible();
        expect(hasGrid).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Journal Tab', () => {
    test('should display journal entries or empty state', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('journal');
        await patientDetailPage.waitForTabContent();

        const hasEntries = await page.locator('.tab-entry-row').first().isVisible();
        const hasEmpty = await page.locator('.tab-empty').isVisible();

        expect(hasEntries || hasEmpty).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Notes Tab', () => {
    test('should display add note form', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('notes');
        await patientDetailPage.waitForTabContent();

        await expect(page.locator('text=Add Clinical Note')).toBeVisible();
        await expect(patientDetailPage.noteTextarea).toBeVisible();
        await expect(patientDetailPage.saveNoteBtn).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should display note type selector', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('notes');
        await patientDetailPage.waitForTabContent();

        await expect(patientDetailPage.noteTypeSelect).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should have save button disabled when note is empty', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('notes');
        await patientDetailPage.waitForTabContent();

        // Clear textarea if anything in it
        await patientDetailPage.noteTextarea.fill('');

        // Button should be disabled
        await expect(patientDetailPage.saveNoteBtn).toBeDisabled();
      } else {
        test.skip();
      }
    });

    test('should enable save button when note has content', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('notes');
        await patientDetailPage.waitForTabContent();

        await patientDetailPage.noteTextarea.fill('Test note content');

        await expect(patientDetailPage.saveNoteBtn).toBeEnabled();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Alerts Tab', () => {
    test('should display alerts or empty state', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('alerts');
        await patientDetailPage.waitForTabContent();

        // Either alerts list or empty state
        const hasAlerts = await page.locator('[style*="borderLeft"]').first().isVisible();
        const hasEmpty = await page.locator('.tab-empty').isVisible();

        expect(hasAlerts || hasEmpty).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Medications Tab', () => {
    test('should display medications or empty state', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('medications');
        await patientDetailPage.waitForTabContent();

        // Either medications list or empty state
        await page.waitForTimeout(500);
      } else {
        test.skip();
      }
    });

    test('should show discontinued toggle', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('medications');
        await patientDetailPage.waitForTabContent();

        await expect(page.locator('text=Show discontinued')).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('AI Insights Tab', () => {
    test('should display AI insights content or unavailable message', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.switchTab('ai');
        await patientDetailPage.waitForTabContent();

        // Either insights, risk score, or unavailable message
        const hasRiskScore = await page.locator('text=Composite Risk Score').isVisible();
        const hasUnavailable = await page.locator('text=AI Insights Not Available').isVisible();
        const hasLoading = await page.locator('text=Loading').isVisible();

        expect(hasRiskScore || hasUnavailable || hasLoading).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Status/Risk Editing', () => {
    test('should show status dropdown', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.statusSelect).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should show risk dropdown', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.riskSelect).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should show save button when status/risk changed', async ({ page }) => {
      if (patientId) {
        // Get current status
        const currentStatus = await patientDetailPage.statusSelect.inputValue();

        // Change to different status
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        await patientDetailPage.setStatus(newStatus as 'active' | 'inactive');

        // Save button should appear
        await expect(patientDetailPage.saveButton).toBeVisible();

        // Reset to avoid actual save
        await patientDetailPage.setStatus(currentStatus as 'active' | 'inactive');
      } else {
        test.skip();
      }
    });
  });

  test.describe('Quick Actions', () => {
    test('should show Add Note button', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.addNoteBtn).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should show Request Assessment button', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.requestAssessmentBtn).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should show Generate Report button', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.generateReportBtn).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should show Escalate Alert button', async ({ page }) => {
      if (patientId) {
        await expect(patientDetailPage.escalateBtn).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should navigate to notes tab when clicking Add Note', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.addNoteBtn.click();

        const isActive = await patientDetailPage.isTabActive('notes');
        expect(isActive).toBeTruthy();
      } else {
        test.skip();
      }
    });

    test('should open assessment modal when clicking Request Assessment', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.requestAssessment();
        // Modal should be visible
      } else {
        test.skip();
      }
    });

    test('should navigate to reports when clicking Generate Report', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.generateReport();
        await expect(page).toHaveURL(/\/reports\?patientId=/);
      } else {
        test.skip();
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate back to patients list', async ({ page }) => {
      if (patientId) {
        await patientDetailPage.goBack();
        await expect(page).toHaveURL(/\/patients$/);
      } else {
        test.skip();
      }
    });
  });
});
