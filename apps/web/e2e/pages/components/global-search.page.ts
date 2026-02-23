import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Global Search overlay
 */
export class GlobalSearchComponent {
  readonly page: Page;
  readonly overlay: Locator;
  readonly searchInput: Locator;
  readonly results: Locator;
  readonly resultItems: Locator;
  readonly noResults: Locator;
  readonly loading: Locator;
  readonly closeBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator('[data-testid="global-search"]');
    this.searchInput = page.locator('[data-testid="global-search"] input, [data-testid="global-search-input"]');
    this.results = page.locator('[data-testid="global-search-results"]');
    this.resultItems = page.locator('[data-testid="global-search-result"]');
    this.noResults = page.locator('text=No results found');
    this.loading = page.locator('text=Searching');
    this.closeBtn = page.locator('[data-testid="global-search"] button:has-text("×")');
  }

  /**
   * Open global search with keyboard
   */
  async openWithKeyboard() {
    await this.page.keyboard.press('/');
    await expect(this.overlay).toBeVisible();
  }

  /**
   * Open global search with Cmd/Ctrl+K
   */
  async openWithCmdK() {
    const isMac = process.platform === 'darwin';
    await this.page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
    await expect(this.overlay).toBeVisible();
  }

  /**
   * Search for a term
   */
  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for results
    await this.page.waitForTimeout(500); // Debounce
    await expect(this.loading).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Get number of results
   */
  async getResultCount(): Promise<number> {
    return this.resultItems.count();
  }

  /**
   * Click on a result by index
   */
  async clickResult(index: number) {
    await this.resultItems.nth(index).click();
  }

  /**
   * Click on a result by text
   */
  async clickResultByText(text: string) {
    await this.results.locator(`text=${text}`).click();
  }

  /**
   * Close global search
   */
  async close() {
    await this.page.keyboard.press('Escape');
  }

  /**
   * Check if global search is open
   */
  async isOpen(): Promise<boolean> {
    return this.overlay.isVisible();
  }

  /**
   * Check if no results message is shown
   */
  async hasNoResults(): Promise<boolean> {
    return this.noResults.isVisible();
  }

  /**
   * Get result texts
   */
  async getResultTexts(): Promise<string[]> {
    const items = await this.resultItems.all();
    const texts: string[] = [];
    for (const item of items) {
      const text = await item.textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }
}
