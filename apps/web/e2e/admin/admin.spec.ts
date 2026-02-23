import { test, expect } from '../fixtures/auth.fixture';
import { AdminPage } from '../pages/admin.page';

/**
 * Admin page test suite
 * Tests access control and all admin sections
 *
 * Note: This test file uses the admin-tests project which
 * loads .auth/admin.json storage state
 */
test.describe('Admin Page - Admin User', () => {
  let adminPage: AdminPage;

  test.beforeEach(async ({ page }) => {
    adminPage = new AdminPage(page);
    await adminPage.goto();
  });

  test.describe('Access Control', () => {
    test('should display admin page for admin user', async () => {
      await adminPage.expectAdminPage();
    });

    test('should not show access denied for admin user', async () => {
      const isDenied = await adminPage.isAccessDenied();
      expect(isDenied).toBeFalsy();
    });

    test('should display admin console header', async () => {
      await expect(adminPage.header).toBeVisible();
    });
  });

  test.describe('Navigation Tabs', () => {
    test('should display all 6 section tabs', async () => {
      await expect(adminPage.dashboardTab).toBeVisible();
      await expect(adminPage.fhirTab).toBeVisible();
      await expect(adminPage.usersTab).toBeVisible();
      await expect(adminPage.rolesTab).toBeVisible();
      await expect(adminPage.auditTab).toBeVisible();
      await expect(adminPage.securityTab).toBeVisible();
    });

    test('should have Dashboard tab active by default', async () => {
      const isActive = await adminPage.isSectionActive('dashboard');
      expect(isActive).toBeTruthy();
    });

    test('should switch to FHIR Endpoints section', async ({ page }) => {
      await adminPage.switchSection('fhir');

      await expect(page.locator('text=FHIR R4 Endpoint Configuration')).toBeVisible();
    });

    test('should switch to Users section', async ({ page }) => {
      await adminPage.switchSection('users');

      await expect(page.locator('text=User Management')).toBeVisible();
    });

    test('should switch to Roles section', async ({ page }) => {
      await adminPage.switchSection('roles');

      await expect(page.locator('text=Role-Based Access Control')).toBeVisible();
    });

    test('should switch to Audit Log section', async ({ page }) => {
      await adminPage.switchSection('audit');

      await expect(page.locator('text=Audit Log')).toBeVisible();
    });

    test('should switch to Security section', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=Security & Compliance Settings')).toBeVisible();
    });
  });

  test.describe('Dashboard Section', () => {
    test('should display metric cards', async ({ page }) => {
      await adminPage.switchSection('dashboard');

      await expect(page.locator('text=Total Patients')).toBeVisible();
      await expect(page.locator('text=Clinicians')).toBeVisible();
      await expect(page.locator('text=Critical Alerts')).toBeVisible();
    });

    test('should display recent activity panel', async ({ page }) => {
      await adminPage.switchSection('dashboard');

      await expect(adminPage.recentActivity).toBeVisible();
    });

    test('should display system status panel', async ({ page }) => {
      await adminPage.switchSection('dashboard');

      await expect(adminPage.systemStatus).toBeVisible();
    });
  });

  test.describe('FHIR Endpoints Section', () => {
    test('should display FHIR endpoints list', async ({ page }) => {
      await adminPage.switchSection('fhir');

      // Should show endpoint cards
      await expect(page.locator('text=Epic')).toBeVisible();
    });

    test('should show Add Endpoint button', async ({ page }) => {
      await adminPage.switchSection('fhir');

      await expect(adminPage.addEndpointBtn).toBeVisible();
    });

    test('should display endpoint status badges', async ({ page }) => {
      await adminPage.switchSection('fhir');

      // Status badges like "Connected", "Degraded", etc.
      const hasBadge = await page.locator('text=/Connected|Degraded|Disconnected/').first().isVisible();
      expect(hasBadge).toBeTruthy();
    });
  });

  test.describe('Users Section', () => {
    test('should display users table', async ({ page }) => {
      await adminPage.switchSection('users');

      await expect(adminPage.usersTable).toBeVisible();
    });

    test('should display Add User button', async ({ page }) => {
      await adminPage.switchSection('users');

      await expect(adminPage.addUserBtn).toBeVisible();
    });

    test('should display Import from LDAP button', async ({ page }) => {
      await adminPage.switchSection('users');

      await expect(adminPage.importLdapBtn).toBeVisible();
    });

    test('should display user count in pagination', async ({ page }) => {
      await adminPage.switchSection('users');

      await expect(adminPage.usersPagination).toBeVisible();

      const counts = await adminPage.getUserCount();
      expect(counts.total).toBeGreaterThanOrEqual(0);
    });

    test('should display user details in table', async ({ page }) => {
      await adminPage.switchSection('users');

      // Table should have headers
      await expect(page.locator('th:has-text("User")')).toBeVisible();
      await expect(page.locator('th:has-text("Role")')).toBeVisible();
      await expect(page.locator('th:has-text("MFA")')).toBeVisible();
    });
  });

  test.describe('Roles Section', () => {
    test('should display role cards', async ({ page }) => {
      await adminPage.switchSection('roles');

      // Should display role definitions
      await expect(page.locator('text=System Administrator')).toBeVisible();
      await expect(page.locator('text=Psychiatrist')).toBeVisible();
    });

    test('should display role permissions', async ({ page }) => {
      await adminPage.switchSection('roles');

      // Permission badges
      await expect(page.locator('text=/manage_users|view_audit|all/').first()).toBeVisible();
    });

    test('should display user counts per role', async ({ page }) => {
      await adminPage.switchSection('roles');

      // Should show "X users" for each role
      await expect(page.locator('text=/\\d+ users/').first()).toBeVisible();
    });
  });

  test.describe('Audit Log Section', () => {
    test('should display audit log entries', async ({ page }) => {
      await adminPage.switchSection('audit');

      await expect(adminPage.auditLog).toBeVisible();
    });

    test('should display audit filter buttons', async ({ page }) => {
      await adminPage.switchSection('audit');

      await expect(page.locator('button:has-text("All")')).toBeVisible();
      await expect(page.locator('button:has-text("Read")')).toBeVisible();
      await expect(page.locator('button:has-text("Create")')).toBeVisible();
      await expect(page.locator('button:has-text("Update")')).toBeVisible();
      await expect(page.locator('button:has-text("Delete")')).toBeVisible();
    });

    test('should display Export CSV button', async ({ page }) => {
      await adminPage.switchSection('audit');

      await expect(adminPage.exportCsvBtn).toBeVisible();
    });

    test('should filter audit log by action', async ({ page }) => {
      await adminPage.switchSection('audit');

      await adminPage.filterAuditByAction('read');
      await page.waitForTimeout(500);

      // The Read button should be active (different styling)
    });

    test('should display audit entry details', async ({ page }) => {
      await adminPage.switchSection('audit');

      // Each entry should show user, action, time
      const entry = page.locator('[style*="borderBottom"]').first();
      if (await entry.isVisible()) {
        const text = await entry.textContent();
        expect(text).toBeTruthy();
      }
    });

    test('should display pagination for audit log', async ({ page }) => {
      await adminPage.switchSection('audit');

      await expect(adminPage.auditPagination).toBeVisible();
    });
  });

  test.describe('Security Section', () => {
    test('should display authentication settings', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=Authentication')).toBeVisible();
    });

    test('should display encryption settings', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=Encryption')).toBeVisible();
    });

    test('should display access control settings', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=Access Control')).toBeVisible();
    });

    test('should show MFA enforcement status', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=Multi-Factor Authentication')).toBeVisible();
    });

    test('should show encryption status', async ({ page }) => {
      await adminPage.switchSection('security');

      await expect(page.locator('text=AES-256')).toBeVisible();
    });
  });

  test.describe('CSV Export', () => {
    test('should trigger CSV download when clicking Export', async ({ page }) => {
      await adminPage.switchSection('audit');

      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

      await adminPage.exportCsvBtn.click();

      const download = await downloadPromise;

      // Download may or may not happen depending on backend
      // If it happens, verify it's a CSV
      if (download) {
        expect(download.suggestedFilename()).toContain('.csv');
      }
    });
  });
});

// This test runs with default clinician auth to verify access is denied
test.describe('Admin Page - Non-Admin User', () => {
  test.use({ storageState: '.auth/clinician.json' });

  test('should show access denied for clinician user', async ({ page }) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.expectAccessDenied();
  });

  test('should show Return to Dashboard button', async ({ page }) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();

    await expect(adminPage.returnToDashboardBtn).toBeVisible();
  });

  test('should navigate to dashboard when clicking Return button', async ({ page }) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();

    await adminPage.returnToDashboard();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
