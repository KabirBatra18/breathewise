import { NextResponse, type NextRequest } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security":
    "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

// TODO(zyra): tighten to nonce-based CSP once auth flow is stable.
// For Phase 1, 'unsafe-inline' is required by Next.js's injected inline scripts
// and next/font's injected inline styles; narrowing that requires emitting a
// per-request nonce, which we'll do in a follow-up.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

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
