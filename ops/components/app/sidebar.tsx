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
  Building2,
  Clock,
  KeyRound,
  LogOut,
  Loader2,
  Menu,
  Search,
  X,
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
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/my-attendance", label: "My attendance", icon: Clock },
  { href: "/payroll", label: "Payroll", icon: BadgeIndianRupee, ownerOnly: true },
  { href: "/gst", label: "GST", icon: Receipt, ownerOnly: true },
  { href: "/terms", label: "Terms", icon: ScrollText, ownerOnly: true },
  { href: "/settings/users", label: "Users", icon: UserCog, ownerOnly: true },
  { href: "/settings/verticals", label: "Verticals", icon: Building2, ownerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The actual nav body — used by both the desktop persistent sidebar
 * AND the mobile slide-in drawer. Keep the layout self-contained so
 * both wrappers can drop it in and get the same visual.
 *
 * onNavigate is called after a click navigates; the mobile drawer
 * uses it to close itself so the user lands on the new page with
 * the drawer dismissed.
 */
function SidebarBody({
  role,
  name,
  onNavigate,
}: {
  role: Role;
  name: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((i) => !i.ownerOnly || role === "OWNER");

  // Optimistic-nav state: when the user clicks a link, mark that
  // target as the "navigating-to" destination IMMEDIATELY so the
  // clicked row highlights + shows a spinner before the server
  // returns. Resolves the audit's #1 "did my click work?" finding.
  const [isPending, startTransition] = useTransition();
  const [navTarget, setNavTarget] = useState<string | null>(null);

  function navigate(href: string) {
    if (href === pathname) {
      onNavigate?.();
      return;
    }
    setNavTarget(href);
    startTransition(() => {
      router.push(href);
    });
    onNavigate?.();
  }

  function isActive(href: string): boolean {
    if (isPending && navTarget === href) return true;
    if (isPending) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function isLoading(href: string): boolean {
    return isPending && navTarget === href;
  }

  return (
    <>
      <div className="border-b px-4 py-5">
        {/* Brand mark — small inline lockup using the same Building2
            icon as the login page. Keeps a consistent UTHS identity
            across the staff portal. */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background ring-1 ring-foreground/10">
            <Building2 className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold tracking-tight">UTHS Operations</p>
        </div>
        <p className="mt-3 truncate text-sm">{name}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
        {/* The Cmd+K hint only matters on desktop; mobile has its
            own visible Search button in the top bar. */}
        <p className="mt-3 hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
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
                // min-h-9 ensures iOS/Android touch-target minimum on
                // mobile while keeping a tight visual on desktop where
                // it doesn't matter. The before:* pseudo-element draws
                // a slim accent bar on the left when active — animated
                // in via a width transition for a tactile feel.
                "relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-all duration-150 active:scale-[0.985] before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:rounded-r-full before:bg-foreground before:transition-all before:duration-200 before:content-['']",
                active
                  ? "bg-muted font-medium text-foreground before:w-0.5"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground before:w-0",
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
            "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors active:scale-[0.985]",
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
    </>
  );
}

/**
 * Desktop sidebar. Hidden below the md breakpoint — on mobile the
 * MobileNavBar (rendered separately in the (app) layout) provides a
 * slide-in drawer with the same SidebarBody contents.
 */
export function Sidebar({ role, name }: { role: Role; name: string }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-background md:flex">
      <SidebarBody role={role} name={name} />
    </aside>
  );
}

/**
 * Mobile top bar — visible only below md. Provides:
 *   • Hamburger button → opens the SidebarBody in a left-side Sheet
 *   • App brand
 *   • Search button → dispatches an 'open-command-palette' event that
 *     the CommandPalette listens for. Mobile users have no keyboard
 *     shortcut to reach Cmd+K otherwise.
 */
export function MobileNavBar({ role, name }: { role: Role; name: string }) {
  const [open, setOpen] = useState(false);

  function openSearch() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-background px-3 md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <p className="text-sm font-semibold">UTHS Operations</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={openSearch}
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Button>
      </header>
      {/* Slide-in drawer. We render a minimal Sheet by hand rather
          than importing the UI primitive so we keep this file
          self-contained and don't have to deal with the Base UI
          Dialog backdrop ergonomics here. */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-0 z-50 md:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-background shadow-xl">
            <div className="flex h-12 items-center justify-end border-b px-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarBody
              role={role}
              name={name}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
