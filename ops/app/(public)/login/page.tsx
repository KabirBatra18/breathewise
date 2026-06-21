import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In · UTHS Operations",
  robots: { index: false, follow: false, nocache: true },
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Soft gradient field — large, low-contrast, sits behind the
          card. Pure CSS, no images, zero bundle cost. The two radial
          gradients give the corners a subtle warmth without being
          distracting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 500px at 10% -10%, rgba(14,165,233,0.07), transparent 60%), radial-gradient(1000px 500px at 110% 110%, rgba(99,102,241,0.06), transparent 60%)",
        }}
      />
      {/* Faint grid pattern, again pure CSS — gives the page a
          "professional dashboard" texture without competing with the
          card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background shadow-sm ring-1 ring-foreground/10">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            UTHS Operations
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Urban Tech Home Solutions · internal portal
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm ring-1 ring-foreground/[0.02]">
          <LoginForm />
        </div>

        {/* Footnote */}
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Authorised personnel only. All activity is logged.
        </p>
      </div>
    </main>
  );
}
