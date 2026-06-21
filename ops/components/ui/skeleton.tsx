import { cn } from "@/lib/utils"

/**
 * Loading placeholder block. Uses the `skeleton-shimmer` keyframe
 * defined in app/globals.css — a soft highlight sweeps across the
 * muted block to communicate "actively loading" rather than the
 * static pulse the previous animate-pulse rendered as.
 *
 * Falls back to no animation under prefers-reduced-motion (handled
 * in the CSS itself).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton-shimmer overflow-hidden rounded-md bg-muted",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
