import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // Lock prod source maps away from casual inspection; middleware also
  // sets X-Robots-Tag so crawlers shouldn't index anything anyway.
  productionBrowserSourceMaps: false,
};

// Sentry wraps the build only when SENTRY_DSN is set, so local dev
// without the env var keeps the bare nextConfig — no upload step, no
// dependency on Sentry being reachable.
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      // Only upload source maps when running on Vercel + the auth
      // token is available. Without these, withSentryConfig falls
      // back to no upload (errors still report; stack traces will
      // be minified).
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Hide source maps from the browser bundle even though
      // Sentry needs them uploaded — protects the source code from
      // casual inspection while keeping symbolicated stacks in
      // Sentry's UI.
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;
