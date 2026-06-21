"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileText,
  FileCheck,
  Package,
  ScrollText,
  BadgeIndianRupee,
  Receipt,
  Settings,
  UserCog,
  KeyRound,
  LogOut,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(public)/login/actions";

type Role = "OWNER" | "EMPLOYEE" | "VIEWER";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: UsersIcon },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: FileCheck },
  { href: "/products", label: "Products", icon: Package },
  { href: "/payments", label: "Payments", icon: BadgeIndianRupee },
  { href: "/gst", label: "GST", icon: Receipt, ownerOnly: true },
  { href: "/terms", label: "Terms", icon: ScrollText, ownerOnly: true },
  { href: "/settings/users", label: "Users", icon: UserCog, ownerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((i) => !i.ownerOnly || role === "OWNER");

  // Optimistic-nav state: when the user clicks a link, mark that
  // target as the "navigating-to" destination IMMEDIATELY so the
  // clicked row highlights + shows a spinner before the server
  // returns. Without this, a click felt dead until the new page
  // mounted (~400-700ms of nothing happening). Resolves the audit's
  // #1 "did my click work?" finding.
  const [isPending, startTransition] = useTransition();
  const [navTarget, setNavTarget] = useState<string | null>(null);

  function navigate(href: string) {
    if (href === pathname) return;
    setNavTarget(href);
    startTransition(() => {
      router.push(href);
    });
  }

  // True if the link should currently render as "active".
  // While a click-driven navigation is in flight, the navTarget wins
  // (instant feedback). Once navigation settles, fall back to the
  // actual pathname so deep-link landings still highlight correctly.
  function isActive(href: string): boolean {
    if (isPending && navTarget === href) return true;
    if (isPending) return false; // suppress old active during nav
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function isLoading(href: string): boolean {
    return isPending && navTarget === href;
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
      <div className="border-b px-4 py-5">
        <p className="text-sm font-semibold">BreatheWise Ops</p>
        <p className="mt-2 truncate text-sm">{name}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
        <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
          Search
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">⌘K</kbd>
          <span className="text-muted-foreground/60">/</span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">Ctrl K</kbd>
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const loading = isLoading(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.href);
              }}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors active:scale-[0.985]",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <Link
          href="/settings/change-password"
          onClick={(e) => {
            e.preventDefault();
            navigate("/settings/change-password");
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors active:scale-[0.985]",
            isActive("/settings/change-password")
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {isLoading("/settings/change-password") ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Change password
        </Link>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
