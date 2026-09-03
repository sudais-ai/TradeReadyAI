import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: Skeleton loading state for the Activity page.
 * Composed from the shared `Skeleton` primitive.
 *
 * Matches the rendered layout: breadcrumb, page header, 4 stat cards, then
 * a 25-row activity list. No fake content is rendered — only placeholders —
 * so the loading state cannot leak another user's data.
 */
export default function ActivityLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading activity…</span>

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Activity" },
        ]}
      />

      {/* Page header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
      </div>

      {/* 4 stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <Skeleton className="h-3 w-20 bg-slate-100" />
            <Skeleton className="h-7 w-16 mt-2" />
            <Skeleton className="h-3 w-24 bg-slate-100 mt-2" />
          </div>
        ))}
      </div>

      {/* Activity list */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-border bg-surface flex items-start gap-3"
          >
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2 bg-slate-100" />
            </div>
            <Skeleton className="h-3 w-20 bg-slate-100 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
