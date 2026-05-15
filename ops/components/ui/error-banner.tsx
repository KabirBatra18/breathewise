import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Persistent inline error banner. Use for action failures that the
 * user needs to read carefully and fix (e.g. "Client has no state set
 * — open their page and add Delhi"). Toast-only errors get missed;
 * a banner that stays until dismiss or retry doesn't.
 *
 * Render this above the dialog/form's primary content. Pass null to
 * hide.
 */
export function ErrorBanner({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

/**
 * Standard empty-state card body. Used inside CardContent when a
 * list has no rows. Cleaner + less work than re-writing the markup
 * each time.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
