import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Alerts page
 */
export class AlertsPage {
  readonly page: Page;

  // Filter chips
  readonly filterBar: Locator;
  readonly allAlertsChip: Locator;
  readonly criticalChip: Locator;
  readonly warningChip: Locator;
  readonly infoChip: Locator;
  readonly unacknowledgedChip: Locator;
  readonly resolvedChip: Locator;

  // Alert cards
  readonly alertCards: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly pageInfo: Locator;

  // Loading and empty states
  readonly loadingIndicator: Locator;
  readonly emptyState: Locator;

  // Live toast
  readonly liveToast: Locator;

  constructor(page: Page) {
    this.page = page;

    // Filter bar
    this.filterBar = page.locator('.filter-bar');
    this.allAlertsChip = page.locator('.filter-chip:has-text("All alerts")');
    this.criticalChip = page.locator('.filter-chip:has-text("Critical")');
    this.warningChip = page.locator('.filter-chip:has-text("Warning")');
    this.infoChip = page.locator('.filter-chip:has-text("Info")');
    this.unacknowledgedChip = page.locator('.filter-chip:has-text("Unacknowledged")');
    this.resolvedChip = page.locator('.filter-chip:has-text("Resolved")');

    // Alert cards (based on the structure in AlertsPage.tsx)
    this.alertCards = page.locator('[style*="borderLeft: 3px solid"], [style*="border-left"]');

    // Pagination
    this.pagination = page.locator('.pagination');
    this.prevButton = page.locator('.page-btn:has-text("Prev")');
    this.nextButton = page.locator('.page-btn:has-text("Next")');
    this.pageInfo = page.locator('.page-info');

    // States
    this.loadingIndicator = page.locator('[data-testid="alerts-page"]').locator('text=Loading');
    this.emptyState = page.locator('.empty-state');

    // Live toast
    this.liveToast = page.locator('.live-toast');
  }

  /**
   * Navigate to alerts page
   */
  async goto() {
    await this.page.goto('/alerts');
    await this.waitForLoad();
  }

  /**
   * Wait for page to load
   */
  async waitForLoad() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(this.filterBar).toBeVisible();
  }

  /**
   * Filter by severity
   */
  async filterBySeverity(severity: 'all' | 'critical' | 'warning' | 'info') {
    const chipMap = {
      all: this.allAlertsChip,
      critical: this.criticalChip,
      warning: this.warningChip,
      info: this.infoChip,
    };
    await chipMap[severity].click();
  }

  /**
   * Filter by status
   */
  async filterByStatus(status: 'all' | 'unacknowledged' | 'resolved') {
    const chipMap = {
      all: this.allAlertsChip,
      unacknowledged: this.unacknowledgedChip,
      resolved: this.resolvedChip,
    };
    await chipMap[status].click();
  }

  /**
   * Get number of visible alert cards
   */
  async getAlertCount(): Promise<number> {
    return this.alertCards.count();
  }

  /**
   * Click acknowledge button on an alert
   */
  async acknowledgeAlert(index: number) {
    const alert = this.alertCards.nth(index);
    const ackBtn = alert.locator('.action-btn:has-text("Acknowledge")');
    await ackBtn.click();
  }

  /**
   * Click resolve button on an alert
   */
  async resolveAlert(index: number) {
    const alert = this.alertCards.nth(index);
    const resolveBtn = alert.locator('.action-btn:has-text("Resolve")');
    await resolveBtn.click();
  }

  /**
   * Click escalate button on an alert
   */
  async escalateAlert(index: number) {
    const alert = this.alertCards.nth(index);
    const escalateBtn = alert.locator('.action-btn:has-text("Escalate")');
    await escalateBtn.click();
  }

  /**
   * Click on patient link in alert
   */
  async clickPatientLink(index: number) {
    const alert = this.alertCards.nth(index);
    const patientLink = alert.locator('button:has-text("@"), a');
    await patientLink.first().click();
  }

  /**
   * Go to next page
   */
  async nextPage() {
    if (await this.nextButton.isEnabled()) {
      await this.nextButton.click();
      await this.waitForLoad();
    }
  }

  /**
   * Go to previous page
   */
  async prevPage() {
    if (await this.prevButton.isEnabled()) {
      await this.prevButton.click();
      await this.waitForLoad();
    }
  }

  /**
   * Get current page number
   */
  async getCurrentPage(): Promise<number> {
    const text = await this.pageInfo.textContent();
    const match = text?.match(/Page (\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Check if filter chip is active
   */
  async isFilterActive(filter: string): Promise<boolean> {
    const chip = this.page.locator(`.filter-chip:has-text("${filter}")`);
    const classes = await chip.getAttribute('class');
    return classes?.includes('active') ?? false;
  }

  /**
   * Dismiss live toast
   */
  async dismissLiveToast() {
    if (await this.liveToast.isVisible()) {
      await this.liveToast.locator('button').click();
    }
  }

  /**
   * Check if empty state is shown
   */
  async hasEmptyState(): Promise<boolean> {
    return this.emptyState.isVisible();
  }

  /**
   * Verify alerts page is displayed
   */
  async expectAlertsPage() {
    await expect(this.filterBar).toBeVisible();
    // Either alerts or empty state should be visible
    const hasAlerts = await this.alertCards.first().isVisible().catch(() => false);
    const hasEmpty = await this.emptyState.isVisible().catch(() => false);
    expect(hasAlerts || hasEmpty).toBeTruthy();
  }
}
