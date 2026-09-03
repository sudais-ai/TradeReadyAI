import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Queue page.
 * Composed from the shared `Skeleton` primitive.
 *
 * Matches the rendered layout: breadcrumb, page header, two stat-card
 * rows (your queue + system totals, 6 cards each), and a 5-row recent
 * jobs list. No fake content — placeholders only.
 */
export default function QueueLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading processing queue…</span>

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Queue" },
        ]}
      />

      {/* Page header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-96 bg-slate-100" />
      </div>

      {/* Your queue — 6 stat cards */}
      <section className="mb-8">
        <Skeleton className="h-4 w-24 bg-slate-100 mb-3" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <Skeleton className="h-3 w-16 bg-slate-100" />
              <Skeleton className="h-6 w-12 mt-2" />
            </div>
          ))}
        </div>
      </section>

      {/* System totals — 6 stat cards */}
      <section className="mb-8">
        <Skeleton className="h-4 w-28 bg-slate-100 mb-2" />
        <Skeleton className="h-3 w-80 bg-slate-100 mb-3" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <Skeleton className="h-3 w-16 bg-slate-100" />
              <Skeleton className="h-6 w-12 mt-2" />
            </div>
          ))}
        </div>
      </section>

      {/* Recent jobs list */}
      <section>
        <Skeleton className="h-4 w-24 bg-slate-100 mb-3" />
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <div className="p-3 rounded-lg border border-border bg-surface flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2 bg-slate-100" />
                  </div>
                </div>
                <Skeleton className="h-3 w-20 bg-slate-100 shrink-0" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
