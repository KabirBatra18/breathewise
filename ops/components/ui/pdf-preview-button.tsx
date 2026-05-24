"use client";

import * as React from "react";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * A button that, when clicked, opens a right-side drawer with the PDF
 * embedded inline (via <iframe>). The drawer also exposes "Open in
 * new tab" and "Download" affordances so the previous workflow stays
 * accessible.
 *
 * Why this exists:
 *   Previously every PDF download opened a new browser tab. For a
 *   quick "did this come out right?" check on a quote/invoice/agreement,
 *   that's two extra context switches per glance. Embedding inline lets
 *   the user verify, then decide whether to download or share.
 *
 * The iframe only mounts while the drawer is open — no PDF fetch
 * happens at page-load time. Sheet handles focus management, ESC,
 * click-outside, and aria roles via Base UI.
 *
 * Mobile note: iframe PDF rendering on iOS Safari is unreliable.
 * Users on phones can still hit "Open in new tab" / "Download".
 */
export function PdfPreviewButton({
  url,
  filename,
  title,
  description,
  variant = "default",
  size = "sm",
  className,
  children,
}: {
  /** Endpoint that returns the PDF (inline Content-Disposition). */
  url: string;
  /** Suggested filename when the user clicks Download. */
  filename: string;
  /** Drawer header title. */
  title: string;
  /** Optional subtitle line. */
  description?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** Trigger button content (icon + label). */
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant={variant} size={size} className={className}>
            {children}
          </Button>
        }
      />
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 w-[min(1100px,95vw)] sm:max-w-[min(1100px,95vw)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="relative flex-1 overflow-hidden bg-muted">
          {open ? (
            <iframe
              src={url}
              title={title}
              className="h-full w-full border-0"
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            render={
              <a href={url} target="_blank" rel="noopener">
                <ExternalLink className="h-4 w-4" />
                Open in new tab
              </a>
            }
          />
          <Button
            size="sm"
            render={
              <a href={url} download={filename}>
                <Download className="h-4 w-4" />
                Download
              </a>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
