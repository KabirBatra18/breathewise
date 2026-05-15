"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Small inline help icon — hover or focus to see a one-line
 * explanation. Use for GST jargon (HSN, place of supply, reverse
 * charge, CGST/SGST), product modes (DP vs MRP), and any term a
 * brand-new user would Google.
 *
 * Why this exists:
 *   • Customer-facing financial app — jargon you can't avoid.
 *   • Tooltips beat help text in a paragraph because they only
 *     surface when needed.
 *   • Keyboard-accessible (focusable trigger).
 */
export function HelpHint({
  children,
  size = "sm",
}: {
  /** The explanation. Plain text or a short JSX node. Keep it
   *  to one or two short sentences. */
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  const iconClass = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
              aria-label="More info"
            >
              <HelpCircle className={iconClass} />
            </button>
          }
        />
        <TooltipContent
          side="top"
          className="max-w-xs text-xs leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
