// Client-side Sentry deliberately disabled (2026-06-21).
//
// Why: this app is a 3-user internal CRM. The ~30-45 KB gzipped
// Sentry SDK shipping into every browser bundle was disproportionate
// for the value — server-side error tracking (see sentry.server.config.ts)
// captures the errors that actually matter (server actions, route
// handlers, PDF rendering), and Vercel's own dashboard captures any
// client-side script error reasonably well for our usage.
//
// The audit on 2026-06-21 flagged this as a HIGH-impact bundle win;
// removing client init drops the shared chunk from ~87 KB to ~50 KB
// and removes the SDK's runtime patches on fetch/history that were
// adding latency to every client navigation.
//
// If you ever need browser-side error tracking back, restore the
// previous body of this file (in git history) and re-add
// NEXT_PUBLIC_SENTRY_DSN to Vercel env vars.
//
// This file is kept so withSentryConfig in next.config.mjs doesn't
// error out looking for it.
export {};
