import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Login page
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly form: Locator;
  readonly title: Locator;
  readonly subtitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.locator('form#login-form');
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.rememberMeCheckbox = page.locator('input[type="checkbox"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[data-testid="login-error"], p:has-text("failed")');
    this.title = page.locator('h1');
    this.subtitle = page.locator('p:has-text("Clinician Dashboard")');
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login');
    await expect(this.form).toBeVisible();
  }

  /**
   * Fill in login credentials
   */
  async fillCredentials(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /**
   * Submit the login form
   */
  async submit() {
    await this.submitButton.click();
  }

  /**
   * Perform full login flow
   */
  async login(email: string, password: string, rememberMe = false) {
    await this.fillCredentials(email, password);

    if (rememberMe) {
      await this.rememberMeCheckbox.check();
    }

    await this.submit();
  }

  /**
   * Login and wait for dashboard
   */
  async loginAndWaitForDashboard(email: string, password: string, rememberMe = false) {
    await this.login(email, password, rememberMe);
    await this.page.waitForURL(/\/(dashboard|mfa)/, { timeout: 30000 });
  }

  /**
   * Verify error message is displayed
   */
  async expectError(expectedMessage?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (expectedMessage) {
      await expect(this.errorMessage).toContainText(expectedMessage);
    }
  }

  /**
   * Verify login page is displayed correctly
   */
  async expectLoginPage() {
    await expect(this.title).toContainText('MindLog');
    await expect(this.subtitle).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Check if form is in loading state
   */
  async isLoading() {
    const buttonText = await this.submitButton.textContent();
    return buttonText?.includes('Signing in');
  }
}
