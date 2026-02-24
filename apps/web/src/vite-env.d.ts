/// <reference types="vite/client" />

/**
 * Extended environment variables for MindLog web application.
 * These are compile-time constants injected by Vite.
 */
interface ImportMetaEnv {
  /** Rollback to legacy theme (for debugging). Set to 'true' to use legacy theme. */
  readonly VITE_USE_LEGACY_THEME?: string;

  /** Sentry DSN for error reporting. If absent, Sentry is disabled. */
  readonly VITE_SENTRY_DSN?: string;

  /** Sentry release version for source map association. */
  readonly VITE_SENTRY_RELEASE?: string;

  /** API base URL (defaults to '/api/v1' in dev). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
