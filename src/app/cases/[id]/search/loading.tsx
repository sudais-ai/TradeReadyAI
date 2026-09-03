import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the case Search page.
 * Composed from the shared `Skeleton` primitive.
 *
 * Matches the rendered layout: breadcrumb, page header, a search input
 * placeholder, and a 5-row results list. No fake content — placeholders
 * only.
 */
export default function SearchLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading search…</span>

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Loading…", href: "#" },
          { label: "Search" },
        ]}
      />

      {/* Page header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-72 bg-slate-100" />
      </div>

      {/* Search input placeholder */}
      <div className="mb-8">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>

      {/* Results list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-border bg-surface"
          >
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full bg-slate-100" />
              <Skeleton className="h-3 w-5/6 bg-slate-100" />
              <Skeleton className="h-3 w-2/3 bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
