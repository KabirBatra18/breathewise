import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false, follow: false, nocache: true },
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            aria-hidden
            className="h-8 w-8 rounded-full border border-foreground/20"
          />
          <div className="text-center">
            <p className="text-sm font-semibold">UTHS Operations</p>
            <p className="text-xs text-muted-foreground">
              Urban Tech Home Solutions · internal portal
            </p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
