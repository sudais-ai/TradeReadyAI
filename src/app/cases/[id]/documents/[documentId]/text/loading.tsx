import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Document Text page.
 * Composed from the shared `Skeleton` primitive.
 *
 * Matches the rendered layout: breadcrumb, page header, then a
 * text-content area with line-by-line placeholders. No fake content.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading document text…</span>

      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Title */}
      <Skeleton className="h-8 w-72 mb-3" />
      <Skeleton className="h-4 w-48 bg-slate-100 mb-8" />

      {/* Text content area */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="space-y-2">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-3 bg-slate-100 ${
                i % 7 === 6 ? "w-3/4" : i % 5 === 4 ? "w-5/6" : "w-full"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
