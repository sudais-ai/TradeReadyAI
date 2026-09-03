import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Document detail page.
 * Composed from the shared `Skeleton` primitive.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading document…</span>

      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Title */}
      <Skeleton className="h-8 w-72 mb-3" />
      <Skeleton className="h-4 w-48 bg-slate-100 mb-8" />

      {/* Metadata grid */}
      <div className="rounded-lg border border-border bg-surface p-5 mb-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20 bg-slate-100" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Preview area skeleton */}
      <div className="rounded-lg border border-border bg-surface p-5 mb-6">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-full bg-slate-100" />
          ))}
        </div>
      </div>

      {/* Related requirements skeleton */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
