import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MindLog Web E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI for consistency
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list'],
  ],

  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:5173',

    // Collect trace when retrying failed test
    trace: 'on-first-retry',

    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',

    // Set viewport size
    viewport: { width: 1280, height: 720 },

    // Increase action timeout for slower CI environments
    actionTimeout: 15000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Global test timeout
  timeout: 60000,

  // Configure projects for different test scenarios
  projects: [
    // Setup project - authenticates and saves state
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // Main test suite with authentication
    // Excludes auth tests (they test unauthenticated flows) and admin tests (they need admin auth)
    {
      name: 'chromium',
      testIgnore: /\/(auth|admin)\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/clinician.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      testIgnore: /\/(auth|admin)\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        storageState: '.auth/clinician.json',
      },
      dependencies: ['setup'],
    },

    // Auth tests - run without saved state
    {
      name: 'auth-tests',
      testMatch: /auth\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // No storage state - tests unauthenticated flows
      },
    },

    // Admin tests - need admin auth state
    {
      name: 'admin-tests',
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  // Output directory for test artifacts
  outputDir: 'test-results',

  // Expect configuration
  expect: {
    // Increase timeout for expects
    timeout: 10000,
  },
});
