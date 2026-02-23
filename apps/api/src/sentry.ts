// =============================================================================
// MindLog API — Sentry initialisation
// Must be imported BEFORE any other module in server.ts / worker.ts.
//
// • Only active when SENTRY_DSN is set (gracefully skipped in dev/test).
// • PHI scrubbing: strips Authorization headers, request bodies, and any
//   field that looks like PII from breadcrumbs before they leave the process.
// =============================================================================

import * as Sentry from '@sentry/node';
import { config } from './config.js';

// Fields whose values must never appear in Sentry events
const SCRUB_KEYS = new Set([
  'password', 'password_hash', 'access_token', 'refresh_token',
  'authorization', 'cookie', 'x-api-key', 'ssn', 'dob',
  'date_of_birth', 'emergency_contact_phone', 'email',
]);

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SCRUB_KEYS.has(k.toLowerCase())) {
      out[k] = '[Filtered]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubObject(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function initSentry(): void {
  if (!config.sentryDsn) return;

  const sentryRelease = process.env['SENTRY_RELEASE'];
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    // Release is injected at build time by the deploy workflow
    ...(sentryRelease ? { release: sentryRelease } : {}),

    // Only sample 10% of traces in production to keep quota low
    tracesSampleRate: config.isProd ? 0.1 : 1.0,

    // Scrub PHI from all outgoing events
    beforeSend(event) {
      if (event.request?.headers) {
        event.request.headers = scrubObject(
          event.request.headers as Record<string, unknown>,
        ) as { [key: string]: string };
      }
      if (event.request?.data && typeof event.request.data === 'object') {
        event.request.data = scrubObject(
          event.request.data as Record<string, unknown>,
        );
      }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Drop HTTP breadcrumbs that contain auth headers
      if (
        breadcrumb.type === 'http' &&
        breadcrumb.data?.['url'] &&
        typeof breadcrumb.data['url'] === 'string' &&
        breadcrumb.data['url'].includes('/auth/')
      ) {
        return null;
      }
      return breadcrumb;
    },
  });
}

/** Capture an exception with an optional extra context map. */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!config.sentryDsn) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('context', scrubObject(context));
    Sentry.captureException(err);
  });
}

export { Sentry };
