import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Export page.
 * Composed from the shared `Skeleton` primitive.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading export…</span>

      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72 bg-slate-100" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-8 w-24 bg-slate-100" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="space-y-2">
              {[...Array(3)].map((__, j) => (
                <Skeleton key={j} className="h-3 w-full bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-lg border border-border bg-surface p-5 sm:col-span-2">
          <Skeleton className="h-5 w-48 mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(5)].map((_, j) => (
              <Skeleton key={j} className="h-10 bg-slate-100" />
            ))}
          </div>
        </div>
      </div>

      {/* Full report card */}
      <div className="rounded-lg border border-border bg-surface">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`p-5 ${i !== 3 ? "border-b border-border" : ""}`}
          >
            <Skeleton className="h-4 w-40 mb-3" />
            <div className="space-y-2">
              {[...Array(3)].map((__, j) => (
                <Skeleton key={j} className="h-3 w-full bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
