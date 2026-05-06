"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileText,
  Package,
  ScrollText,
  BadgeIndianRupee,
  Receipt,
  Settings,
  UserCog,
  LogOut,
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
  { href: "/products", label: "Products", icon: Package },
  { href: "/payments", label: "Payments", icon: BadgeIndianRupee },
  { href: "/gst", label: "GST", icon: Receipt, ownerOnly: true },
  { href: "/terms", label: "Terms", icon: ScrollText, ownerOnly: true },
  { href: "/settings/users", label: "Users", icon: UserCog, ownerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.ownerOnly || role === "OWNER");

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
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="border-t p-2">
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
    </aside>
  );
}
