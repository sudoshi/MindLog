import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Dashboard page
 */
export class DashboardPage {
  readonly page: Page;

  // Metric cards
  readonly metricCards: Locator;
  readonly criticalAlertsCard: Locator;
  readonly activeTodayCard: Locator;
  readonly avgMoodCard: Locator;
  readonly avgSleepCard: Locator;
  readonly checkInRateCard: Locator;

  // Alert strip
  readonly alertStrip: Locator;

  // Panels
  readonly moodPanel: Locator;
  readonly moodDistributionPanel: Locator;
  readonly alertsPanel: Locator;
  readonly checkInActivityPanel: Locator;

  // Mood grid cells
  readonly moodCells: Locator;

  // Loading state
  readonly loadingIndicator: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Drilldown modal
  readonly drilldownModal: Locator;
  readonly drilldownClose: Locator;

  constructor(page: Page) {
    this.page = page;

    // Metric cards
    this.metricCards = page.locator('.metric-card');
    this.criticalAlertsCard = page.locator('.metric-card:has-text("Critical Alerts")');
    this.activeTodayCard = page.locator('.metric-card:has-text("Active Today")');
    this.avgMoodCard = page.locator('.metric-card:has-text("Avg Mood")');
    this.avgSleepCard = page.locator('.metric-card:has-text("Avg Sleep")');
    this.checkInRateCard = page.locator('.metric-card:has-text("Check-In Rate")');

    // Alert strip
    this.alertStrip = page.locator('.alert-strip');

    // Panels
    this.moodPanel = page.locator('.panel:has-text("Today\'s Mood")');
    this.moodDistributionPanel = page.locator('.panel:has-text("Mood Distribution")');
    this.alertsPanel = page.locator('.panel:has-text("Active Alerts")');
    this.checkInActivityPanel = page.locator('.panel:has-text("Check-In Activity")');

    // Mood grid
    this.moodCells = page.locator('.two-col >> div[title]');

    // Loading
    this.loadingIndicator = page.locator('text=Loading caseload');

    // Empty state
    this.emptyState = page.locator('.empty-state');

    // Drilldown modal
    this.drilldownModal = page.locator('[data-testid="drilldown-modal"], .modal-overlay');
    this.drilldownClose = page.locator('[data-testid="drilldown-close"], .modal-close');
  }

  /**
   * Navigate to dashboard
   */
  async goto() {
    await this.page.goto('/dashboard');
    await this.waitForLoad();
  }

  /**
   * Wait for dashboard to fully load
   */
  async waitForLoad() {
    // Wait for loading to complete
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
    // Wait for metric cards to appear
    await expect(this.metricCards.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get value from a specific metric card by label
   */
  async getMetricValue(label: string): Promise<string> {
    const card = this.page.locator(`.metric-card:has-text("${label}")`);
    const valueEl = card.locator('.metric-value');
    return (await valueEl.textContent()) ?? '';
  }

  /**
   * Click on a metric card to open drilldown
   */
  async clickMetric(label: string) {
    const card = this.page.locator(`.metric-card:has-text("${label}")`);
    await card.click();
  }

  /**
   * Close the drilldown modal
   */
  async closeDrilldown() {
    // Click outside modal or use close button if available
    const closeBtn = this.page.locator('.modal-close, [data-testid="drilldown-close"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      // Click the overlay
      await this.page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    }
  }

  /**
   * Check if drilldown modal is open
   */
  async isDrilldownOpen(): Promise<boolean> {
    return this.drilldownModal.isVisible();
  }

  /**
   * Click on a mood distribution bar
   */
  async clickMoodBar(label: string) {
    const bar = this.page.locator(`.mini-bar-row:has-text("${label}")`);
    await bar.click();
  }

  /**
   * Get count of mood cells displayed
   */
  async getMoodCellCount(): Promise<number> {
    return this.moodCells.count();
  }

  /**
   * Click "View All" on alerts panel
   */
  async viewAllAlerts() {
    await this.alertsPanel.locator('.panel-action').click();
  }

  /**
   * Click "All patients" link on mood panel
   */
  async viewAllPatients() {
    await this.moodPanel.locator('.panel-action').click();
  }

  /**
   * Click on alert strip
   */
  async clickAlertStrip() {
    if (await this.alertStrip.isVisible()) {
      await this.alertStrip.click();
    }
  }

  /**
   * Check if alert strip is visible
   */
  async hasAlertStrip(): Promise<boolean> {
    return this.alertStrip.isVisible();
  }

  /**
   * Verify dashboard is displayed correctly
   */
  async expectDashboard() {
    await expect(this.metricCards).toHaveCount(5);
    // Either we have caseload data (panels visible) or empty state
    const hasData = await this.moodPanel.isVisible();
    if (!hasData) {
      await expect(this.emptyState).toBeVisible();
    }
  }
}
