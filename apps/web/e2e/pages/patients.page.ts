import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Patients list page
 */
export class PatientsPage {
  readonly page: Page;

  // Filter chips
  readonly filterBar: Locator;
  readonly allFilterChip: Locator;
  readonly crisisFilterChip: Locator;
  readonly highRiskFilterChip: Locator;
  readonly notLoggedFilterChip: Locator;
  readonly streakFilterChip: Locator;

  // Search and sort
  readonly searchInput: Locator;
  readonly sortSelect: Locator;

  // Table
  readonly table: Locator;
  readonly tableRows: Locator;
  readonly tableHeaders: Locator;

  // Invite
  readonly inviteButton: Locator;
  readonly inviteModal: Locator;

  // Pending invites section
  readonly pendingInvitesSection: Locator;

  // Loading and empty states
  readonly loadingIndicator: Locator;
  readonly emptyState: Locator;

  // Toast
  readonly toast: Locator;

  // Patient count
  readonly patientCount: Locator;

  constructor(page: Page) {
    this.page = page;

    // Filter bar
    this.filterBar = page.locator('.filter-bar');
    this.allFilterChip = page.locator('.filter-chip:has-text("All")');
    this.crisisFilterChip = page.locator('.filter-chip:has-text("Crisis")');
    this.highRiskFilterChip = page.locator('.filter-chip:has-text("High risk")');
    this.notLoggedFilterChip = page.locator('.filter-chip:has-text("Not logged")');
    this.streakFilterChip = page.locator('.filter-chip:has-text("Streak")');

    // Search and sort
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.sortSelect = page.locator('.sort-select');

    // Table
    this.table = page.locator('.patient-table');
    this.tableRows = page.locator('.patient-table tbody tr');
    this.tableHeaders = page.locator('.patient-table thead th');

    // Invite
    this.inviteButton = page.locator('button:has-text("Invite Patient")');
    this.inviteModal = page.locator('[data-testid="invite-modal"], .modal');

    // Pending invites
    this.pendingInvitesSection = page.locator('.panel:has-text("Pending Invites")');

    // States
    this.loadingIndicator = page.locator('text=Loading patients');
    this.emptyState = page.locator('.empty-state');

    // Toast
    this.toast = page.locator('[data-testid="toast"], [style*="fixed"][style*="top"]');

    // Count
    this.patientCount = page.locator('text=/\\d+ patients on your caseload/');
  }

  /**
   * Navigate to patients page
   */
  async goto() {
    await this.page.goto('/patients');
    await this.waitForLoad();
  }

  /**
   * Wait for page to load
   */
  async waitForLoad() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
  }

  /**
   * Filter by type
   */
  async filterBy(type: 'all' | 'crisis' | 'high' | 'not-logged' | 'streak') {
    const chipMap = {
      all: this.allFilterChip,
      crisis: this.crisisFilterChip,
      high: this.highRiskFilterChip,
      'not-logged': this.notLoggedFilterChip,
      streak: this.streakFilterChip,
    };
    await chipMap[type].click();
  }

  /**
   * Search for patients
   */
  async search(query: string) {
    await this.searchInput.fill(query);
  }

  /**
   * Clear search
   */
  async clearSearch() {
    await this.searchInput.clear();
  }

  /**
   * Sort by field
   */
  async sortBy(field: 'risk' | 'mood' | 'streak' | 'last-checkin' | 'name') {
    await this.sortSelect.selectOption(field);
  }

  /**
   * Click on a patient row by name
   */
  async clickPatient(name: string) {
    const row = this.page.locator(`.patient-table tr:has-text("${name}")`);
    await row.click();
  }

  /**
   * Click on a patient row by MRN
   */
  async clickPatientByMrn(mrn: string) {
    const row = this.page.locator(`.patient-table tr:has-text("${mrn}")`);
    await row.click();
  }

  /**
   * Get number of visible patient rows
   */
  async getPatientCount(): Promise<number> {
    return this.tableRows.count();
  }

  /**
   * Get patient names from visible rows
   */
  async getVisiblePatientNames(): Promise<string[]> {
    const rows = await this.tableRows.all();
    const names: string[] = [];
    for (const row of rows) {
      const nameEl = row.locator('td:first-child div:first-child');
      const name = await nameEl.textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  /**
   * Open invite patient modal
   */
  async openInviteModal() {
    await this.inviteButton.click();
    await expect(this.inviteModal).toBeVisible();
  }

  /**
   * Check if filter chip is active
   */
  async isFilterActive(type: 'all' | 'crisis' | 'high' | 'not-logged' | 'streak'): Promise<boolean> {
    const chipMap = {
      all: this.allFilterChip,
      crisis: this.crisisFilterChip,
      high: this.highRiskFilterChip,
      'not-logged': this.notLoggedFilterChip,
      streak: this.streakFilterChip,
    };
    const classes = await chipMap[type].getAttribute('class');
    return classes?.includes('active') ?? false;
  }

  /**
   * Click table header to sort
   */
  async clickHeader(headerText: string) {
    const header = this.page.locator(`.patient-table th:has-text("${headerText}")`);
    await header.click();
  }

  /**
   * Check if empty state is shown
   */
  async hasEmptyState(): Promise<boolean> {
    return this.emptyState.isVisible();
  }

  /**
   * Get showing count text
   */
  async getShowingText(): Promise<string> {
    const el = this.page.locator('text=/Showing \\d+ of \\d+/');
    return (await el.textContent()) ?? '';
  }

  /**
   * Verify patients page is displayed
   */
  async expectPatientsPage() {
    await expect(this.filterBar).toBeVisible();
    await expect(this.searchInput).toBeVisible();
    await expect(this.sortSelect).toBeVisible();
  }
}
