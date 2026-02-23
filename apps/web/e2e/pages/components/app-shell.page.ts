import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the AppShell component (sidebar + topbar)
 */
export class AppShellComponent {
  readonly page: Page;

  // Sidebar
  readonly sidebar: Locator;
  readonly brandName: Locator;
  readonly clinicianBadge: Locator;
  readonly clinicianName: Locator;

  // Navigation items
  readonly populationNav: Locator;
  readonly patientsNav: Locator;
  readonly alertsNav: Locator;
  readonly trendsNav: Locator;
  readonly reportsNav: Locator;
  readonly cohortNav: Locator;
  readonly adminNav: Locator;
  readonly invitePatientBtn: Locator;

  // Topbar
  readonly topbar: Locator;
  readonly topbarTitle: Locator;
  readonly topbarSubtitle: Locator;
  readonly searchBar: Locator;
  readonly searchInput: Locator;
  readonly criticalAlertsBtn: Locator;
  readonly quickNoteBtn: Locator;
  readonly shortcutsHelpBtn: Locator;
  readonly wsStatus: Locator;

  // Logout
  readonly logoutBtn: Locator;

  // Modals/Overlays
  readonly inviteModal: Locator;
  readonly globalSearch: Locator;
  readonly quickNotePanel: Locator;
  readonly shortcutsHelp: Locator;

  // Toast
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sidebar
    this.sidebar = page.locator('.sidebar');
    this.brandName = page.locator('.brand-name');
    this.clinicianBadge = page.locator('.clinician-badge');
    this.clinicianName = page.locator('.clinician-name');

    // Navigation
    this.populationNav = page.locator('.nav-item:has-text("Population")');
    this.patientsNav = page.locator('.nav-item:has-text("All Patients")');
    this.alertsNav = page.locator('.nav-item:has-text("Alerts")');
    this.trendsNav = page.locator('.nav-item:has-text("Population Trends")');
    this.reportsNav = page.locator('.nav-item:has-text("Reports")');
    this.cohortNav = page.locator('.nav-item:has-text("Cohort Builder")');
    this.adminNav = page.locator('.nav-item:has-text("Admin Panel")');
    this.invitePatientBtn = page.locator('.nav-item:has-text("Invite Patient")');

    // Topbar
    this.topbar = page.locator('.topbar');
    this.topbarTitle = page.locator('.topbar-title');
    this.topbarSubtitle = page.locator('.topbar-subtitle');
    this.searchBar = page.locator('.search-bar');
    this.searchInput = page.locator('.search-bar input');
    this.criticalAlertsBtn = page.locator('.topbar-btn.primary');
    this.quickNoteBtn = page.locator('.topbar-btn:has-text("Note")');
    this.shortcutsHelpBtn = page.locator('.topbar-btn:has-text("?")');
    this.wsStatus = page.locator('.ws-dot');

    // Logout
    this.logoutBtn = page.locator('.sidebar-footer-btn');

    // Modals
    this.inviteModal = page.locator('[data-testid="invite-modal"]');
    this.globalSearch = page.locator('[data-testid="global-search"]');
    this.quickNotePanel = page.locator('[data-testid="quick-note-panel"]');
    this.shortcutsHelp = page.locator('text=Keyboard Shortcuts');

    // Toast
    this.toast = page.locator('[style*="fixed"][style*="bottom"][style*="right"]');
  }

  /**
   * Navigate to a specific route via sidebar
   */
  async navigateTo(route: 'dashboard' | 'patients' | 'alerts' | 'trends' | 'reports' | 'cohort' | 'admin') {
    const navMap: Record<string, Locator> = {
      dashboard: this.populationNav,
      patients: this.patientsNav,
      alerts: this.alertsNav,
      trends: this.trendsNav,
      reports: this.reportsNav,
      cohort: this.cohortNav,
      admin: this.adminNav,
    };
    await navMap[route].click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if navigation item is active
   */
  async isNavActive(route: string): Promise<boolean> {
    const navMap: Record<string, Locator> = {
      dashboard: this.populationNav,
      patients: this.patientsNav,
      alerts: this.alertsNav,
      trends: this.trendsNav,
      reports: this.reportsNav,
      cohort: this.cohortNav,
      admin: this.adminNav,
    };
    const classes = await navMap[route].getAttribute('class');
    return classes?.includes('active') ?? false;
  }

  /**
   * Open global search
   */
  async openSearch() {
    // Click search bar or use keyboard shortcut
    await this.searchInput.focus();
  }

  /**
   * Search from topbar
   */
  async searchPatient(query: string) {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  /**
   * Open quick note panel
   */
  async openQuickNote() {
    await this.quickNoteBtn.click();
  }

  /**
   * Open shortcuts help
   */
  async openShortcutsHelp() {
    await this.shortcutsHelpBtn.click();
    await expect(this.shortcutsHelp).toBeVisible();
  }

  /**
   * Close shortcuts help
   */
  async closeShortcutsHelp() {
    // Click close button or press Escape
    const closeBtn = this.page.locator('button:has-text("×")').last();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  /**
   * Open invite patient modal
   */
  async openInvitePatient() {
    await this.invitePatientBtn.click();
    await expect(this.inviteModal).toBeVisible();
  }

  /**
   * Logout
   */
  async logout() {
    await this.logoutBtn.click();
  }

  /**
   * Get current page title from topbar
   */
  async getPageTitle(): Promise<string> {
    return (await this.topbarTitle.textContent()) ?? '';
  }

  /**
   * Get current page subtitle from topbar
   */
  async getPageSubtitle(): Promise<string> {
    return (await this.topbarSubtitle.textContent()) ?? '';
  }

  /**
   * Check if WebSocket is connected
   */
  async isWsConnected(): Promise<boolean> {
    const style = await this.wsStatus.getAttribute('style');
    return style?.includes('--safe') ?? false;
  }

  /**
   * Get clinician name from sidebar
   */
  async getClinicianName(): Promise<string> {
    return (await this.clinicianName.textContent()) ?? '';
  }

  /**
   * Check if admin nav is visible (only for admin users)
   */
  async isAdminNavVisible(): Promise<boolean> {
    return this.adminNav.isVisible();
  }

  /**
   * Check if cohort nav is visible (only for admin users)
   */
  async isCohortNavVisible(): Promise<boolean> {
    return this.cohortNav.isVisible();
  }

  /**
   * Click critical alerts button in topbar
   */
  async clickCriticalAlerts() {
    if (await this.criticalAlertsBtn.isVisible()) {
      await this.criticalAlertsBtn.click();
    }
  }

  /**
   * Get alert badge count from sidebar
   */
  async getAlertBadgeCount(): Promise<number> {
    const badge = this.alertsNav.locator('.nav-badge');
    if (await badge.isVisible()) {
      const text = await badge.textContent();
      return parseInt(text ?? '0', 10);
    }
    return 0;
  }

  /**
   * Verify app shell is displayed correctly
   */
  async expectAppShell() {
    await expect(this.sidebar).toBeVisible();
    await expect(this.topbar).toBeVisible();
    await expect(this.brandName).toContainText('MindLog');
    await expect(this.clinicianBadge).toBeVisible();
  }
}
