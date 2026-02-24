// Theme loader - conditionally loads new or legacy theme based on VITE_USE_NEW_THEME
import './styles';
import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { authActions } from './stores/auth.js';
import { themeActions } from './stores/theme.js';

// Initialise Sentry before any React render (no-op if VITE_SENTRY_DSN is absent)
const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
if (SENTRY_DSN) {
  const sentryRelease = import.meta.env['VITE_SENTRY_RELEASE'] as string | undefined;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    ...(sentryRelease ? { release: sentryRelease } : {}),
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Never send PHI: strip all request bodies and scrub common PII fields
    beforeSend(event: ErrorEvent) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete (event.request.headers as Record<string, unknown>)['authorization'];
          delete (event.request.headers as Record<string, unknown>)['cookie'];
        }
      }
      return event;
    },
  });
}

// Restore a persisted session before the first render so AuthGuard sees the
// correct state immediately (avoids a flash-redirect to /login for returning users).
authActions.initFromStorage();
themeActions.initFromStorage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
