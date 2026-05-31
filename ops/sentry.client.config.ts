// Client-side Sentry. Initialised in browsers when the app loads.
//
// Keep this thin: errors only, no performance tracing (saves the
// free-tier event quota), no session replay (privacy + bundle size).
// If SENTRY_DSN is unset the SDK warns once and no-ops — safe in
// local dev where you don't want noise.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // App is a single-tenant CRM with PII (client names, GSTINs,
    // emails). Strip URL query strings + cookies before they ever
    // leave the browser.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.url) {
          event.request.url = event.request.url.split("?")[0];
        }
      }
      return event;
    },
  });
}
