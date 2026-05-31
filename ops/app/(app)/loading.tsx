import { Skeleton } from "@/components/ui/skeleton";

/**
 * App-wide loading fallback. Shows while a route segment under (app)
 * is suspending — most commonly during a cold-start Postgres connect
 * after a Supabase free-tier pause, but also during a deploy
 * cold-start or any long-running server-side fetch.
 *
 * Sized to hint at the typical "title + a couple of cards" page
 * layout without committing to specifics.
 */
export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
