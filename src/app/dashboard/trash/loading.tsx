import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Trash page.
 * Composed from the shared `Skeleton` primitive.
 *
 * Matches the rendered layout: breadcrumb, page header, two sections
 * (Deleted trade cases + Deleted documents), each with 3 row placeholders
 * and a Restore button placeholder. No fake content — placeholders only.
 */
export default function TrashLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading trash…</span>

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Trash" },
        ]}
      />

      {/* Page header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-96 bg-slate-100" />
      </div>

      {/* Deleted trade cases */}
      <section className="mb-10">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-border bg-surface flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2 bg-slate-100" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </section>

      {/* Deleted documents */}
      <section>
        <Skeleton className="h-5 w-44 mb-3" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-border bg-surface flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3 bg-slate-100" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
