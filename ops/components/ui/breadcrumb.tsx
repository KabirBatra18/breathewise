import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Simple breadcrumbs. Pass items as { label, href? }. The last item
 * (no href) is rendered as plain text — the current page.
 *
 * Used on detail / edit pages so the user always knows where they
 * are in the hierarchy. Especially useful on /invoices/[id]/edit
 * which is two levels deep.
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded transition-colors hover:text-foreground hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground" : ""}>{item.label}</span>
            )}
            {!isLast ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
