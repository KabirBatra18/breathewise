import { NextResponse, type NextRequest } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  // SAMEORIGIN (not DENY) so the in-app PDF preview drawer can iframe
  // our own /api/.../pdf endpoints. External sites are still blocked
  // from clickjacking the app via the matching CSP frame-ancestors
  // 'self' below.
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security":
    "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

// TODO(zyra): tighten to nonce-based CSP once auth flow is stable.
// For Phase 1, 'unsafe-inline' is required by Next.js's injected inline
// bootstrap script and next/font's injected inline styles; narrowing that
// requires emitting a per-request nonce, which we'll do in a follow-up.
// 'unsafe-eval' was previously here but Next 14 prod doesn't require it —
// dropped 2026-05-31 per audit. If a client-side dep regresses, re-add
// only after confirming with the audit issue.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // 'self' (not 'none') so the in-app PDF preview drawer can frame
  // our own /api/.../pdf endpoints. Cross-origin framing is still
  // blocked, matching the X-Frame-Options: SAMEORIGIN above.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function middleware(request: NextRequest) {
  // Forward the current pathname as a request header so server
  // components (specifically the (app) layout's mustChangePassword
  // redirect) can detect the current page without spinning up its
  // own router. Next.js doesn't expose request.nextUrl to RSCs.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", CSP);

  return response;
}

export const config = {
  // Match every path except Next.js internals and static assets. The security
  // headers must apply to all HTML responses including 404s, and to
  // /robots.txt so crawler directives survive.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
