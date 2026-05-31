// Server-side Sentry. Initialised by Next.js on Vercel functions
// (Node runtime). Catches unhandled exceptions in server components,
// route handlers, and server actions — exactly the places where we
// lost visibility before (Vercel Hobby retains logs for ~1h).

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    // Strip request cookies before sending — they carry the session
    // JWT which we never want exfiltrated to a third party.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers["cookie"];
          delete event.request.headers["authorization"];
        }
      }
      return event;
    },
  });
}
