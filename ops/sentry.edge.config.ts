// Edge-runtime Sentry. Middleware runs on the Edge runtime by
// default in Next 14 — initialise here so middleware exceptions
// surface in Sentry too.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
  });
}
