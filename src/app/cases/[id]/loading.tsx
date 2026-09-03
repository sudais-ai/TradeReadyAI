import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Skeleton loading state for the case-detail page.
 * Renders placeholder blocks that mirror the case-detail layout:
 * breadcrumb, header, sidebar, content cards.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <span className="sr-only">Loading case details…</span>

      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Case header skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
        <div>
          <Skeleton className="h-8 w-64 mb-3" />
          <Skeleton className="h-4 w-80 bg-slate-100" />
          <Skeleton className="h-3 w-48 bg-slate-100 mt-2" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24 bg-slate-100" />
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar skeleton (desktop) */}
        <aside className="hidden lg:block w-56 shrink-0 space-y-2">
          <Skeleton className="h-3 w-20 mb-3" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-full bg-slate-100" />
          ))}
        </aside>

        {/* Content skeleton */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Next step card */}
          <Skeleton className="h-36 w-full bg-slate-100 rounded-lg" />
          {/* Progress card */}
          <Skeleton className="h-24 w-full bg-slate-100 rounded-lg" />
          {/* Details card */}
          <Skeleton className="h-40 w-full bg-slate-100 rounded-lg" />
          {/* Sections list */}
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
