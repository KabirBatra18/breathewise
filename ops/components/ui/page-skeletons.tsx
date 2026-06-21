import { Skeleton } from "@/components/ui/skeleton";

/**
 * Standard skeleton shapes used by route-level loading.tsx fallbacks
 * across the (app) tree. Kept thin and shape-only — the goal is to
 * give the user "something is loading" within the first frame after
 * a click, replacing the previous behaviour where navigation between
 * sibling pages froze on the old route until the new RSC arrived.
 *
 * Each shape mirrors the typical layout of its page family so the
 * skeleton doesn't visibly shift when the real content lands.
 */
export function ListPageSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Title + subtitle row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Tiles row */}
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      {/* Table block */}
      <div className="rounded-lg border bg-card">
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-3 border-t p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48" />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      {/* Two cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
      {/* Wide card */}
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function EditorPageSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      {/* Meta form block */}
      <Skeleton className="h-56 w-full" />
      {/* Line items table */}
      <div className="rounded-lg border bg-card">
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-3 border-t p-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      {/* Totals card */}
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
