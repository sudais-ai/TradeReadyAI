import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Requirements page.
 * Composed from the shared `Skeleton` primitive.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading requirements…</span>

      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Title */}
      <Skeleton className="h-8 w-64 mb-3" />
      <Skeleton className="h-4 w-80 bg-slate-100 mb-8" />

      {/* Requirement cards */}
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full bg-slate-100" />
              <Skeleton className="h-3 w-3/4 bg-slate-100" />
            </div>
            <Skeleton className="mt-4 h-16 w-full bg-slate-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
