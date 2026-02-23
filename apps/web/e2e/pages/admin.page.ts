import { Page, Locator, expect } from '@playwright/test';

type AdminSection = 'dashboard' | 'fhir' | 'users' | 'roles' | 'audit' | 'security';

/**
 * Page Object Model for the Admin page
 */
export class AdminPage {
  readonly page: Page;

  // Access denied
  readonly accessDenied: Locator;
  readonly returnToDashboardBtn: Locator;

  // Header
  readonly header: Locator;
  readonly title: Locator;

  // Navigation tabs
  readonly navTabs: Locator;
  readonly dashboardTab: Locator;
  readonly fhirTab: Locator;
  readonly usersTab: Locator;
  readonly rolesTab: Locator;
  readonly auditTab: Locator;
  readonly securityTab: Locator;

  // Dashboard section
  readonly metricCards: Locator;
  readonly recentActivity: Locator;
  readonly systemStatus: Locator;

  // Users section
  readonly usersTable: Locator;
  readonly addUserBtn: Locator;
  readonly importLdapBtn: Locator;
  readonly usersPagination: Locator;

  // Audit section
  readonly auditLog: Locator;
  readonly auditFilters: Locator;
  readonly exportCsvBtn: Locator;
  readonly auditPagination: Locator;

  // FHIR section
  readonly fhirEndpoints: Locator;
  readonly addEndpointBtn: Locator;

  // Roles section
  readonly roleCards: Locator;

  // Security section
  readonly securityPanels: Locator;

  // Loading
  readonly loadingIndicator: Locator;

  // Error
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Access denied
    this.accessDenied = page.locator('text=Admin Access Required');
    this.returnToDashboardBtn = page.locator('button:has-text("Return to Dashboard")');

    // Header
    this.header = page.locator('text=MindLog Admin Console');
    this.title = page.locator('text=MindLog Admin Console');

    // Navigation tabs
    this.navTabs = page.locator('[style*="display: flex"][style*="gap: 8px"]').filter({ hasText: 'Dashboard' });
    this.dashboardTab = page.locator('button:has-text("Dashboard")');
    this.fhirTab = page.locator('button:has-text("FHIR Endpoints")');
    this.usersTab = page.locator('button:has-text("Users")');
    this.rolesTab = page.locator('button:has-text("Roles")');
    this.auditTab = page.locator('button:has-text("Audit Log")');
    this.securityTab = page.locator('button:has-text("Security")');

    // Dashboard section
    this.metricCards = page.locator('[style*="flex: 1"][style*="minWidth: 180"]');
    this.recentActivity = page.locator('.panel:has-text("Recent Activity")');
    this.systemStatus = page.locator('.panel:has-text("System Status")');

    // Users section
    this.usersTable = page.locator('.patient-table');
    this.addUserBtn = page.locator('button:has-text("Add Manual User")');
    this.importLdapBtn = page.locator('button:has-text("Import from LDAP")');
    this.usersPagination = page.locator('text=/Showing \\d+ of \\d+ users/');

    // Audit section
    this.auditLog = page.locator('.panel:has([style*="borderRadius: 50%"])');
    this.auditFilters = page.locator('[style*="borderRadius: 20"]');
    this.exportCsvBtn = page.locator('button:has-text("Export CSV")');
    this.auditPagination = page.locator('text=/Showing \\d+ of \\d+ entries/');

    // FHIR section
    this.fhirEndpoints = page.locator('.panel:has-text("FHIR R4")');
    this.addEndpointBtn = page.locator('button:has-text("Add Endpoint")');

    // Roles section
    this.roleCards = page.locator('.panel:has-text("Role-Based Access")');

    // Security section
    this.securityPanels = page.locator('.panel:has-text("Authentication"), .panel:has-text("Encryption"), .panel:has-text("Access Control")');

    // Loading
    this.loadingIndicator = page.locator('text=/Loading/');

    // Error
    this.errorMessage = page.locator('[style*="background: var(--critical-bg)"]');
  }

  /**
   * Navigate to admin page
   */
  async goto() {
    await this.page.goto('/admin');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for page to load (admin content)
   */
  async waitForLoad() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
  }

  /**
   * Switch to a specific section
   */
  async switchSection(section: AdminSection) {
    const tabMap: Record<AdminSection, Locator> = {
      dashboard: this.dashboardTab,
      fhir: this.fhirTab,
      users: this.usersTab,
      roles: this.rolesTab,
      audit: this.auditTab,
      security: this.securityTab,
    };
    await tabMap[section].click();
    await this.waitForLoad();
  }

  /**
   * Check if section tab is active
   */
  async isSectionActive(section: AdminSection): Promise<boolean> {
    const tabMap: Record<AdminSection, Locator> = {
      dashboard: this.dashboardTab,
      fhir: this.fhirTab,
      users: this.usersTab,
      roles: this.rolesTab,
      audit: this.auditTab,
      security: this.securityTab,
    };
    const styles = await tabMap[section].getAttribute('style');
    // Active tabs have background: var(--safe)
    return styles?.includes('background: var(--safe)') ?? false;
  }

  /**
   * Check if access is denied
   */
  async isAccessDenied(): Promise<boolean> {
    return this.accessDenied.isVisible();
  }

  /**
   * Return to dashboard from access denied screen
   */
  async returnToDashboard() {
    await this.returnToDashboardBtn.click();
  }

  /**
   * Export audit log CSV
   */
  async exportAuditCsv() {
    await this.switchSection('audit');
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsvBtn.click();
    return downloadPromise;
  }

  /**
   * Filter audit log by action
   */
  async filterAuditByAction(action: 'all' | 'read' | 'create' | 'update' | 'delete' | 'export') {
    const filterBtn = this.page.locator(`button:has-text("${action.charAt(0).toUpperCase() + action.slice(1)}")`);
    await filterBtn.click();
  }

  /**
   * Get user count from pagination text
   */
  async getUserCount(): Promise<{ showing: number; total: number }> {
    const text = await this.usersPagination.textContent();
    const match = text?.match(/Showing (\d+) of (\d+)/);
    if (match) {
      return { showing: parseInt(match[1], 10), total: parseInt(match[2], 10) };
    }
    return { showing: 0, total: 0 };
  }

  /**
   * Navigate users pagination
   */
  async nextUsersPage() {
    const nextBtn = this.page.locator('button:has-text("Next")').last();
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await this.waitForLoad();
    }
  }

  /**
   * Verify admin page is displayed for admin user
   */
  async expectAdminPage() {
    await expect(this.accessDenied).not.toBeVisible();
    await expect(this.header).toBeVisible();
    await expect(this.dashboardTab).toBeVisible();
  }

  /**
   * Verify access denied is shown for non-admin
   */
  async expectAccessDenied() {
    await expect(this.accessDenied).toBeVisible();
    await expect(this.returnToDashboardBtn).toBeVisible();
  }

  /**
   * Get metric card value
   */
  async getMetricValue(label: string): Promise<string> {
    const card = this.page.locator(`[style*="flex: 1"]:has-text("${label}")`);
    const valueEl = card.locator('div').first();
    return (await valueEl.textContent()) ?? '';
  }
}
