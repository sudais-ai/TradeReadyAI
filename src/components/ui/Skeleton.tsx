import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The shape comes from the caller's className (e.g. "h-8 w-40 rounded-full").
   * The primitive is layout-neutral on purpose so the same component can be a
   * card, a row, a chip, or a circle.
   */
  className?: string;
}

/**
 * Phase 18 — shared Skeleton primitive.
 *
 * Used by every route-level `loading.tsx` and by inline client-side loading
 * states (e.g. the sessions refetch path). Every page-specific composition
 * composes this single primitive — there is no SessionSkeleton / ActivitySkeleton
 * / DocumentSkeleton as separate, unrelated systems.
 *
 * Design decisions:
 *  - Decorative only: `aria-hidden="true"` by default. A screen reader should
 *    NOT hear a list of fake placeholders; it should hear the wrapper's
 *    "Loading…" text once. The `loading.tsx` wrappers all wrap their skeleton
 *    composition in a `role="status"` element with that single message.
 *  - `prefers-reduced-motion`: the pulse animation is suppressed via the
 *    Tailwind `motion-safe:animate-pulse` / `motion-reduce:animate-none`
 *    utilities. Tailwind generates the right `@media` query for us; no
 *    JS needed.
 *  - Visual baseline matches the inlined pattern that has been in the app
 *    since Phase 13: `bg-slate-200 rounded animate-pulse`. The 1:1 visual
 *    continuity is intentional so existing pages do not "look different"
 *    after the conversion.
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-slate-200 rounded motion-safe:animate-pulse", className)}
      {...rest}
    />
  );
}
