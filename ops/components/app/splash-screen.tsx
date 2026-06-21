"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * First-load brand splash for the authenticated app. Shows once per
 * browser tab session — flag stored in sessionStorage.
 *
 * Choreography (total ~3.0s):
 *   0   ms — backdrop fades in (250ms)
 *   200 ms — brand tile zooms + drops in (700ms ease-out)
 *   600 ms — wordmark slides up & in (500ms)
 *   900 ms — subtitle fades in (400ms)
 *   1200ms — progress bar starts sweeping left→right (1800ms total)
 *   1200ms — brand tile starts its slow breathing scale loop
 *   2400ms — exit fade + zoom out begins (600ms)
 *   3000ms — unmounted
 *
 * The timings are tuned for "you can definitely see what it is" but
 * still feel like a snappy launch sequence — not a marketing video.
 *
 * Once-per-tab logic:
 *   • shown on first authenticated load in a new tab
 *   • silent on subsequent navigations / refreshes in same tab
 *   • shown again on fresh tab open
 *   • shown again on logout-then-login same-tab (login form clears
 *     the storage flag on mount)
 */
const SPLASH_KEY = "uths-splash-shown";

const ENTER_MS = 1200; // backdrop + brand + wordmark + subtitle done
const HOLD_MS = 1200;  // progress bar runs through here
const EXIT_MS = 600;
const TOTAL_MS = ENTER_MS + HOLD_MS + EXIT_MS; // 3000ms

export function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"showing" | "exiting" | "done">("showing");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
      // sessionStorage can throw under Safari private mode / certain
      // embedded webviews. Treat as "not shown" and proceed.
    }
    if (alreadyShown) {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setMounted(true);
    const tExit = window.setTimeout(
      () => setPhase("exiting"),
      ENTER_MS + HOLD_MS,
    );
    const tDone = window.setTimeout(() => setPhase("done"), TOTAL_MS);
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
          ? "animate-out fade-out duration-600 fill-mode-forwards"
          : "animate-in fade-in duration-300",
      )}
    >
      {/* Soft gradient field — matches login background vocabulary. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 10% -10%, rgba(14,165,233,0.10), transparent 60%), radial-gradient(1000px 500px at 110% 110%, rgba(99,102,241,0.08), transparent 60%)",
        }}
      />
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
          "relative flex flex-col items-center gap-5",
          phase === "exiting"
            ? "animate-out fade-out zoom-out-95 duration-500 fill-mode-forwards"
            : "",
        )}
      >
        {/* Brand tile: zoom-in entrance with a soft drop-shadow, then
            the slow "breathing" scale kicks in once visible. */}
        <div
          className={cn(
            "splash-breathe relative flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-background shadow-xl ring-1 ring-foreground/10",
            "animate-in fade-in zoom-in-50 slide-in-from-bottom-3 duration-700 delay-200 fill-mode-backwards ease-out",
          )}
        >
          <Building2 className="h-8 w-8" />
          {/* Soft halo glow behind the tile — sits under the icon
              and adds depth on light backgrounds without being
              flashy on dark. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-foreground/20 blur-xl"
          />
        </div>

        {/* Wordmark — slides up after the tile lands. */}
        <div className="text-center">
          <p
            className={cn(
              "text-xl font-semibold tracking-tight",
              "animate-in fade-in slide-in-from-bottom-2 duration-500 delay-700 fill-mode-backwards ease-out",
            )}
          >
            UTHS Operations
          </p>
          <p
            className={cn(
              "mt-1 text-xs text-muted-foreground",
              "animate-in fade-in duration-400 delay-1000 fill-mode-backwards",
            )}
          >
            Urban Tech Home Solutions
          </p>
        </div>

        {/* Progress bar — slim, deterministic sweep left→right during
            the hold period. Gives the eye something to track that
            isn't competing with the brand. */}
        <div
          className={cn(
            "mt-4 h-0.5 w-40 overflow-hidden rounded-full bg-foreground/10",
            "animate-in fade-in duration-300 delay-1100 fill-mode-backwards",
          )}
          aria-hidden
        >
          <div
            className="splash-progress h-full rounded-full bg-foreground/80"
            style={{ animationDelay: "1200ms" }}
          />
        </div>
      </div>
    </div>
  );
}
