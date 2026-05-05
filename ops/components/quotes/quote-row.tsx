"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

// Wraps a TableRow so the whole row navigates to the quote detail
// page on click. Suppresses navigation if the user is selecting text
// or clicked an interactive element inside the row.
export function QuoteRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <TableRow
      role="link"
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      onClick={(e) => {
        const sel = window.getSelection?.();
        if (sel && sel.toString().length > 0) return;
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) {
          return;
        }
        router.push(`/quotes/${id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/quotes/${id}`);
        }
      }}
    >
      {children}
    </TableRow>
  );
}
