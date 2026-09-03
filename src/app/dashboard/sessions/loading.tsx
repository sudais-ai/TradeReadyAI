import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Sessions page.
 * Composed from the shared `Skeleton` primitive.
 *
 * This is a route-level (server) skeleton that fires during the initial
 * server fetch. The page itself also has a client-side `isLoading` state
 * for in-page refetch; that path is handled by the inline
 * `SessionsCardSkeleton` in the page (Step 4). Both apply to different
 * moments — first nav vs. client refetch.
 */
export default function SessionsLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading sessions…</span>

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Active Sessions" },
        ]}
      />

      {/* Page header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
      </div>

      {/* Session cards */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-border bg-surface flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 bg-slate-100" />
              <Skeleton className="h-3 w-40 bg-slate-100" />
            </div>
            <div className="flex gap-2 shrink-0">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
