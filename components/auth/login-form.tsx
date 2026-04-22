"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Minimal login shell. Full Supabase Auth + TOTP wiring lands in Step 5
// once DB credentials are available. This file exists now so the security
// middleware and the /login route respond with the right HTML.
export function LoginForm() {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" className="w-full">
        Sign in
      </Button>
    </form>
  );
}
