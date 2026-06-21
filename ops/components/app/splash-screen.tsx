"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * First-load brand splash for the authenticated app. Shows once per
 * browser tab session — flag stored in sessionStorage, so:
 *
 *   • First page load (or fresh tab)            → splash plays
 *   • Subsequent navigations in the same tab    → silent (no splash)
 *   • Refresh in the same tab                   → silent
 *   • Close tab and re-open                     → splash plays again
 *   • Log out then back in                      → splash plays again
 *     (because the storage key is keyed by sessionStorage which is
 *      tab-scoped, AND we proactively clear it on logout — see
 *      app/(public)/login/actions.ts)
 *
 * Timeline:
 *   0.0s            mount, fade in (200ms)
 *   0.0–0.9s        brand sits centered, three pulsing dots beneath
 *   0.9s            begin fade out (300ms + slight scale-up)
 *   1.3s            unmount completely (returns null)
 *
 * Respects prefers-reduced-motion via the tw-animate-css utilities,
 * which already gate their keyframes on that media query.
 */
const SPLASH_KEY = "uths-splash-shown";
const HOLD_MS = 900;
const EXIT_MS = 400;

export function SplashScreen() {
  // `mounted` lets us decide on the client whether to render at all,
  // avoiding an SSR/CSR mismatch (the server can't read sessionStorage).
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"showing" | "exiting" | "done">("showing");

  useEffect(() => {
    // SSR safety — sessionStorage is browser-only.
    if (typeof window === "undefined") return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
      // sessionStorage can throw in some restricted contexts (Safari
      // private mode, embedded webviews). Treat as "not shown" — a
      // splash is harmless to render every load in that edge case.
    }
    if (shown) {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setMounted(true);
    const tExit = window.setTimeout(() => setPhase("exiting"), HOLD_MS);
    const tDone = window.setTimeout(
      () => setPhase("done"),
      HOLD_MS + EXIT_MS,
    );
    return () => {
      window.clearTimeout(tExit);
      window.clearTimeout(tDone);
    };
  }, []);

  if (!mounted || phase === "done") return null;

  return (
    <div
      role="status"
      aria-label="UTHS Operations is loading"
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-background",
        phase === "exiting"
          ? "animate-out fade-out duration-300 fill-mode-forwards"
          : "animate-in fade-in duration-200",
      )}
    >
      {/* Soft gradient field — same vocabulary as the login screen so
          the splash → login → app sequence feels visually continuous. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 10% -10%, rgba(14,165,233,0.08), transparent 60%), radial-gradient(1000px 500px at 110% 110%, rgba(99,102,241,0.07), transparent 60%)",
        }}
      />
      {/* Faint grid pattern — same 32px square as the login bg. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div
        className={cn(
          "relative flex flex-col items-center gap-4",
          phase === "exiting"
            ? "animate-out fade-out zoom-out-95 duration-300 fill-mode-forwards"
            : "animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-500",
        )}
      >
        {/* Brand mark — matches sidebar + login lockup, but bigger for
            the splash moment. */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg ring-1 ring-foreground/10">
          <Building2 className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold tracking-tight">
            UTHS Operations
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Urban Tech Home Solutions
          </p>
        </div>
        {/* Three pulsing dots — keeps the user oriented during the
            short hold without resorting to a spinner (which would
            imply something blocking, when really we're just
            showcasing the brand for ~1s). */}
        <div className="mt-1 flex items-center gap-1.5" aria-hidden>
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40"
            style={{ animationDelay: "0ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40"
            style={{ animationDelay: "150ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40"
            style={{ animationDelay: "300ms", animationDuration: "900ms" }}
          />
        </div>
      </div>
    </div>
  );
}
