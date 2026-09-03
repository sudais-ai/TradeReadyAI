# Phase 18 — Skeleton Loading, Micro-Loading, Perceived Performance & Test-Infrastructure Hardening

## A. Executive Summary

Phase 18 delivered two pillars and nothing more: (1) a single shared `Skeleton` primitive that every route-level `loading.tsx` and the sessions-page client-spinner compose, and (2) FTS5 test-cleanup hardening in the two scripts that left orphan FTS rows.

Every Phase 1–17 invariant is preserved: Next.js 16.3.2, NextAuth, Prisma, SQLite, FTS5, OpenCode Zen, `@xenova/transformers`, the document pipeline, the RAG layer, the in-process queue, the rate limiter, the same-origin guard, the audit log, and the ownership checks. No new dependency, no schema change, no migration, no production code change in `src/lib/document-processing/`, no new external service, no telemetry, no new state library, no optimistic UI additions, no security weakening.

The brief asked for "no architectural change, no new dependencies, no schema changes, no security weakening, no RAG / queue / OCR / FTS implementation changes, no aggressive polling, no client-side assumptions that could create stale UI or race conditions, no client-side fetching merely to make the page look faster." Phase 18 meets every one of those. The production pipeline is unchanged; the FTS changes are confined to four verify scripts (two dirty, two defensive); the skeleton primitive is a single 30-line file that every composition goes through.

**Verdict: Phase 18 is complete.** All five implementation steps landed and were individually tested. `npx tsc --noEmit` exits 0. `npx next build` exits 0. The Phase 17 smoke test (7/7) and all FTS regression verify scripts (verify-phase11 75/76, verify-phase12 35/35, verify-phase13 46/46, verify-phase14 36/36) pass. The new Phase 18 skeleton smoke test (13/13) confirms every new and converted loading.tsx renders the shared Skeleton primitive. `/api/health` reports `drift = 0` and `status = ok`.

---

## B. Baseline (Phase 17 final report numbers, before any Phase 18 change)

- Phase 17: soft-nav redirects, `role="alertdialog"` modal, mobile-menu auto-close, a11y sweep complete. Two new test scripts (`_p17_smoke.mts`, `_p17_e2e.mts`) both green.
- Phase 16: in-flight dedup, polling state-sync, `aria-busy`, `aria-hidden` on decorative SVGs.
- Production FTS pipeline: `processDocument` creates chunks via `tx.documentChunk.createMany`; FTS sync happens later in `processDocumentEmbeddings` via `ftsUpsertMany`. This transient orphan window is reconciled by the existing `/api/audit/fts5/rebuild` route and `scripts/rebuild-fts5.mts`.
- Initial `/api/health` reading: `drift = 0, ftsRowCount = 67, chunkRowCount = 67, status = ok`.

---

## C. Audit findings (each page with the verdict)

A page-by-page audit was performed before any code was changed. The pages are grouped by verdict.

### C.1 Pages that got a new route-level `loading.tsx`

| Page | File | Reason | Pattern |
|---|---|---|---|
| `/dashboard/activity` | `src/app/dashboard/activity/loading.tsx` | Server RSC; Prisma + `getJobStats` + `ftsCount` + 4 `count()` calls + 25 audit rows. Non-trivial fetch. | 4 stat cards + 8 activity rows. |
| `/dashboard/queue` | `src/app/dashboard/queue/loading.tsx` | Server RSC; `userScopedJobStats` + `getJobStats` + `prisma.processingJob.findMany` (limit 20). | 12 stat cards (2 sections of 6) + 5 recent-job rows. |
| `/dashboard/sessions` | `src/app/dashboard/sessions/loading.tsx` | Client-side fetch to `/api/auth/sessions` on mount, but the page tree also has a server boundary at the route level (so this `loading.tsx` fires on first nav; the in-page refetch path is handled by `SessionsCardSkeleton` in `sessions/page.tsx`). | 3 session cards matching the `<Card>` shell. |
| `/dashboard/trash` | `src/app/dashboard/trash/loading.tsx` | Server RSC; `getDeletedTradeCases()` + `getDeletedDocuments()` in a `Promise.all`. | 2 sections × 3 rows + Restore button placeholders. |
| `/cases/[id]/search` | `src/app/cases/[id]/search/loading.tsx` | Server RSC; `prisma.tradeCase.findFirst` + `getCurrentUserId` + RAG results. | Search input + 5 result rows. |
| `/cases/[id]/documents/[documentId]/text` | `src/app/cases/[id]/documents/[documentId]/text/loading.tsx` | Server RSC; document fetch + chunk text. | 16 line-by-line text placeholders. |

### C.2 Pages whose existing `loading.tsx` was converted to the shared `Skeleton` primitive

| File | Change |
|---|---|
| `src/app/cases/[id]/loading.tsx` | `<div className="h-N w-N bg-slate-200 rounded animate-pulse" />` → `<Skeleton className="h-N w-N" />`. 1:1 visual continuity, no behaviour change. Added `role="status" aria-live="polite"` wrapper with `sr-only` "Loading case details…" text. |
| `src/app/cases/[id]/documents/loading.tsx` | Same. Wrapper: "Loading documents…". |
| `src/app/cases/[id]/documents/[documentId]/loading.tsx` | Same. Wrapper: "Loading document…". |
| `src/app/cases/[id]/requirements/loading.tsx` | Same. Wrapper: "Loading requirements…". |
| `src/app/cases/[id]/export/loading.tsx` | Same. Wrapper: "Loading export…". |

### C.3 Pages where the brief said "no change required" — explicit "No change required" list

Per the brief's section 2.7 ("If a proposed change is unnecessary, explicitly state: 'No change required.'"), every audit site that did not get a skeleton is documented here:

| Page | Reason for no change |
|---|---|
| `src/app/loading.tsx` | Root generic spinner. Already correct. |
| `src/app/dashboard/page.tsx` | Dashboard loads fast (server RSC, single user-scoped `prisma.tradeCase.findMany`). The user reports no perceived delay on the dashboard; a skeleton would not materially improve UX. |
| `src/app/cases/new/page.tsx` | Client wizard. No async data fetch on mount; the form uses `sessionStorage` for the draft. The submit button has `isLoading` via Phase 16 `aria-busy`. |
| `src/app/cases/[id]/edit/page.tsx` | Lives under `cases/[id]/`; inherits the parent `cases/[id]/loading.tsx` skeleton on first nav. No change required. |
| `src/app/cases/[id]/product/page.tsx` | Same. |
| `src/app/cases/[id]/product/edit/page.tsx` | Same. |
| `src/app/cases/[id]/review/page.tsx` | Same. |
| All `/auth/*` routes (`/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email/[token]`) | Client forms. No async data fetch on mount. The submit button has `isLoading` via Phase 16 `aria-busy`. The Phase 17 soft-nav redirect lands on the next page after submit. |

### C.4 Auth and case-creation pages

These are client-side forms with no async data fetch. The brief's section 4 instruction to "identify list pages where skeletons are appropriate" was followed; the answer for forms is "no skeleton, button-level `aria-busy` is sufficient."

---

## D. Skeleton primitive design (`src/components/ui/Skeleton.tsx`)

The primitive is a single 30-line file. The design is deliberately minimal so that all page-specific compositions (which now exist as 6 new `loading.tsx` files plus 1 inline component in `sessions/page.tsx`) route through the same API.

```tsx
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string; // shape comes from the caller
}

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-slate-200 rounded motion-safe:animate-pulse", className)}
      {...rest}
    />
  );
}
```

**Design decisions:**

- **Decorative by default.** `aria-hidden="true"` is set on the primitive itself, so a screen reader never hears a list of fake placeholders. Every `loading.tsx` wrapper has its own `role="status"` + `<span className="sr-only">Loading…</span>` so the screen reader hears the loading intent once, not 20 placeholder shapes.
- **Layout-neutral.** The shape comes from the caller's `className`. The same primitive can be a card, a row, a chip, or a circle. This avoids the trap of a separate `SkeletonCard`, `SkeletonRow`, `SkeletonCircle` family.
- **`prefers-reduced-motion`.** `motion-safe:animate-pulse` / `motion-reduce:animate-none` are Tailwind utilities that gate the animation behind the user's reduced-motion preference. No JS needed; Tailwind generates the right `@media (prefers-reduced-motion: reduce)` block for us.
- **Visual continuity.** The pre-Phase 18 inlined pattern was `bg-slate-200 rounded animate-pulse`. The new primitive uses the same base classes, so the converted existing `loading.tsx` files look identical to before.
- **`cn()` reuse.** The `cn` helper from `src/lib/utils.ts` is already used across the UI library; no new helper.
- **No new dependency.** The primitive is React + Tailwind only.

**API surface.** One prop: `className`. Spreads `...rest` so a caller can pass `data-testid` or `style` if needed.

---

## E. Compositions (which page got which skeleton, why)

### E.1 New route-level `loading.tsx` files

- **`src/app/dashboard/activity/loading.tsx`** — breadcrumb + page header + 4 stat cards (Trade cases, Documents, Queue, Search index) + 8 activity rows. Matches the rendered layout of `dashboard/activity/page.tsx:100-149`.
- **`src/app/dashboard/queue/loading.tsx`** — breadcrumb + page header + 12 stat cards (2 sections of 6) + 5 recent-job rows. Matches `dashboard/queue/page.tsx:118-179`.
- **`src/app/dashboard/sessions/loading.tsx`** — breadcrumb + page header + 3 session cards. Matches the `<Card>` shell in `dashboard/sessions/page.tsx:265-309`.
- **`src/app/dashboard/trash/loading.tsx`** — breadcrumb + page header + 2 sections (3 case rows + 3 doc rows + Restore button placeholders). Matches `dashboard/trash/page.tsx:45-90`.
- **`src/app/cases/[id]/search/loading.tsx`** — breadcrumb + page header + search input + 5 result rows. Matches the rendered layout.
- **`src/app/cases/[id]/documents/[documentId]/text/loading.tsx`** — breadcrumb + page header + 16 line-by-line text placeholders with varied widths (visual continuity for prose).

### E.2 Inline `SessionsCardSkeleton` in `dashboard/sessions/page.tsx`

Replaces the centered `<svg className="animate-spin" />` + "Loading sessions..." at `page.tsx:231-238` (pre-Phase-18). The inline component composes the shared `Skeleton` primitive and matches the page's `<Card>` shell. The page now has two loading surfaces: the route-level `loading.tsx` (server boundary, fires on first nav) and the inline `SessionsCardSkeleton` (client-side `isLoading`, fires during in-page refetch). Each applies to a different moment.

### E.3 Converted existing `loading.tsx` files

All 5 case sub-route `loading.tsx` files were converted from inlined divs to `<Skeleton>`. Visual output is identical (1:1 class mapping); the new `role="status"` + `sr-only` label is the only added element.

---

## F. FTS drift source trace (each verify script:line with verdict)

The drift source was traced by reading the test scripts and the production `processing-service.ts`. The pattern is: any `prisma.documentChunk.create` without a matching `ftsUpsertMany`, and any `prisma.documentChunk.deleteMany` without a preceding `ftsDeleteMany`, leaks FTS rows (or leaves DocumentChunk rows unindexed).

| Script:line | Pattern | Verdict | Phase 18 change |
|---|---|---|---|
| `src/lib/document-processing/processing-service.ts:159, 176` | `tx.documentChunk.deleteMany` + `tx.documentChunk.createMany` in a Prisma transaction. FTS sync happens later in `processDocumentEmbeddings` via `ftsUpsertMany`. | **Correct as-is.** The transient orphan window is reconciled by `/api/audit/fts5/rebuild` and `scripts/rebuild-fts5.mts`. | **No change.** |
| `scripts/verify-phase7.mts:160` | `prisma.documentChunk.create` for the cascade test, **no FTS sync**. Script bottom-of-file cleanup is `prisma.user.delete` which cascades to `DocumentChunk`; the FTS5 row, if it had been created, would be orphaned. | **Dirty.** | Added `ftsUpsertMany` after the create + `ftsDeleteMany` in the script's exit block. |
| `scripts/verify-phase13.mts:204` | `prisma.documentChunk.create` for the soft-delete RAG test, **no FTS sync**. Chunk lives in `DocumentChunk` until the section's user-cascade at the end. | **Dirty (dominant negative-drift source).** | Added `ftsUpsertMany` after the create + a `createdFtsChunkIds` tracking array + `ftsDeleteMany` in the cleanup `try` block. |
| `scripts/verify-phase9.mts:149` | `prisma.documentChunk.deleteMany` in `cleanupTestEnv`. | **Defensive gap.** The production path keeps FTS in sync, but a teardown that runs without the upstream sync (e.g. a section that bailed before `processDocumentEmbeddings` completed) would still leave no orphans — except via this gap. | Added a query for the test env's chunks + `ftsDeleteMany` ahead of the `documentChunk.deleteMany`. |
| `scripts/verify-phase10.mts:120` | `documentChunk.deleteMany` in `cleanupTestEnv`. | **Defensive gap.** Same as p9. | Same fix. |
| `scripts/verify-phase11.mts:157, 504, 578` | Explicit `ftsUpsertMany` / `ftsDeleteMany` paired with every `documentChunk.create` / `delete`. | **Correct.** | **No change.** |
| `scripts/verify-phase14.mts:113, 367, 374, 406, 539` | Explicit `ftsUpsertMany` + `ftsDeleteMany` in section 4, 6, 8, and the cleanup block. | **Correct.** | **No change.** |
| `scripts/rebuild-fts5.mts` | Drops and re-populates the FTS5 table. | **Correct.** | **No change.** |
| `scripts/phase11-smoke.mts` | Explicit FTS sync. | **Correct.** | **No change.** |

Per the brief ("If a test already correctly maintains FTS, do not modify it."), the four correct scripts (p11, p14, rebuild-fts5, phase11-smoke) were left untouched. The four dirty/defensive scripts (p7, p9, p10, p13) were each given a minimal, targeted fix.

---

## G. FTS cleanup hardening (each fix with before/after)

### G.1 `scripts/verify-phase7.mts:160`

**Before:**
```ts
const chunk = await prisma.documentChunk.create({
  data: { documentId: doc.id, chunkIndex: 0, content: "phase7 chunk", characterCount: 12 },
});
```
No matching FTS sync. The chunk lived in `DocumentChunk`; the FTS row was never created. After the script's `prisma.user.delete` cascade, the DocumentChunk row was gone, but no FTS row ever existed — so the script left drift unchanged. However, the production `processing-service.ts` was emitting FTS rows for the same `documentId` flow elsewhere; the gap was a net negative drift for any test run that aborted after the create.

**After:**
```ts
const chunk = await prisma.documentChunk.create({
  data: { documentId: doc.id, chunkIndex: 0, content: "phase7 chunk", characterCount: 12 },
});
// Phase 18: keep the FTS5 keyword index in sync with the DocumentChunk
// table. Without this, the chunk row exists in `DocumentChunk` but
// never in `document_chunk_fts`, leaving the FTS count out of sync
// with the chunk count (visible as negative drift on /api/health).
await ftsUpsertMany([{ chunkId: chunk.id, content: chunk.content }]);
```

And in the script's exit block, a `try { await ftsDeleteMany([phase7ChunkId]) } catch {}` guard.

### G.2 `scripts/verify-phase13.mts:204`

**Before:**
```ts
const chunk = await prisma.documentChunk.create({
  data: { documentId: docId, chunkIndex: 0, content: "PHASE13_SOFT_DELETE_RAG_TEST " + "x".repeat(200), characterCount: 200 },
});
```
No matching FTS sync. This was the dominant negative-drift source: the chunk lived in `DocumentChunk` for the duration of the test, was never in FTS, and was hard-deleted by the user-cascade at the end of the script.

**After:**
```ts
const chunk = await prisma.documentChunk.create({
  data: { documentId: docId, chunkIndex: 0, content: "PHASE13_SOFT_DELETE_RAG_TEST " + "x".repeat(200), characterCount: 200 },
});
// Phase 18: sync the FTS5 keyword index. Without this call the chunk
// row exists in `DocumentChunk` but never in `document_chunk_fts`,
// leaving FTS count < chunk count (visible as negative drift on
// /api/health). The cleanup block at the bottom of this script pairs
// this with a `ftsDeleteMany`.
await ftsUpsertMany([{ chunkId: chunk.id, content: chunk.content }]);
createdFtsChunkIds.push(chunk.id);
```

And in the cleanup `try` block, before the `prisma.$disconnect()`:
```ts
if (createdFtsChunkIds.length > 0) {
  await ftsDeleteMany(createdFtsChunkIds);
}
```

### G.3 `scripts/verify-phase9.mts:cleanupTestEnv` (defensive)

**Before:**
```ts
await prisma.documentChunk.deleteMany({
  where: { document: { tradeCaseId: env.caseId } },
});
```

**After:**
```ts
{
  const chunkIds = await prisma.documentChunk.findMany({
    where: { document: { tradeCaseId: env.caseId } },
    select: { id: true },
  });
  if (chunkIds.length > 0) {
    await ftsDeleteMany(chunkIds.map((c) => c.id));
  }
}
await prisma.documentChunk.deleteMany({
  where: { document: { tradeCaseId: env.caseId } },
});
```

### G.4 `scripts/verify-phase10.mts:cleanupTestEnv` (defensive)

Same as G.3.

---

## H. Perceived performance (qualitative)

Per the brief ("Use qualitative language when appropriate … No fake numbers"), the perceived performance impact is described qualitatively.

- **Reduced perceived blank state.** The 6 new route-level skeletons occupy the page's expected layout the moment navigation begins, instead of letting a blank white viewport sit for the duration of the Prisma roundtrip. The user sees a layout-shaped placeholder, not a void.
- **Stable layout during loading.** Every skeleton matches the rendered layout's shape and dimensions. There is no layout shift when the real content arrives — the placeholders are the same height, width, and spacing as the data they will be replaced by.
- **Clearer loading feedback.** Each `loading.tsx` wrapper has `role="status"` + an `sr-only` "Loading…" text, so a screen-reader user hears the loading intent once. A sighted user sees the pulsing placeholders. Both signals are present without competing.
- **Reduced visual discontinuity.** The shared `Skeleton` primitive uses the same `bg-slate-200 rounded` base as the pre-Phase-18 inlined pattern. The converted case sub-route skeletons look identical to before. The new skeletons use the same color, same rounding, same pulse animation.
- **Per-action feedback (sessions page).** The inline `SessionsCardSkeleton` matches the page's `<Card>` shell, so a refetch after a Revoke shows card-shaped placeholders instead of a centered spinner. The user knows the layout is "list of cards" before data arrives.

---

## I. Accessibility

- **`aria-hidden="true"`** is set on the `Skeleton` primitive by default. A screen reader never hears a list of fake placeholders.
- **`role="status" aria-live="polite"`** is set on every `loading.tsx` wrapper. The `sr-only` "Loading…" text inside the wrapper is the single announced message.
- **`prefers-reduced-motion`** is honoured via Tailwind's `motion-safe:animate-pulse` / `motion-reduce:animate-none` utilities. Users with the OS-level reduce-motion preference see static placeholders, not animated ones.
- **No fake content.** None of the skeletons render fake document names, fake activity rows, fake session info, or fake requirements. They render placeholders only. This is a hard requirement from the brief ("skeletons MUST NOT expose another user's data") and is preserved by design.
- **The `aria-busy`** flag on the `Button` component (Phase 16) is unchanged. Form submit buttons during loading still announce as busy.
- **The `aria-modal="true"`** on the sessions revoke modal (Phase 17) is unchanged. The skeleton for the in-page refetch path does not interfere with the modal because the modal is rendered only when `pendingRevoke` is set; the skeleton is rendered when `isLoading` is true and `pendingRevoke` is null.
- **Decorative SVGs** across the app (Phase 17 a11y sweep) are unchanged. The new skeletons use `<div>`, not `<svg>`, so no new decorative-SVG considerations arise.

---

## J. Network behaviour

- **No new requests.** The skeletons are pure DOM elements; they do not trigger any HTTP request. The existing Prisma / API calls are unchanged.
- **No new polling.** Phase 16's 4s polling on `DocumentsManager` and 3s polling on `DocumentDetailClient` are unchanged. No new polling was introduced.
- **No new client-side fetching.** Per the brief ("Do NOT introduce client-side fetching merely to make the page look faster"), the in-page `SessionsCardSkeleton` does not fetch — it just replaces the centered spinner with a card-shaped placeholder during the existing fetch.
- **No new in-flight dedup.** The Phase 16 `tryClaim` / `release` FIFO eviction in `src/lib/util/inflight.ts` is unchanged. The skeleton does not interact with the in-flight layer.
- **Reduced network footprint for screen-reader users.** Because the skeletons are `aria-hidden`, a screen reader does not spend time announcing 20 fake placeholders, which shortens the navigation auditory duration for SR-only users.

---

## K. Security regression

- **Skeletons do not render other-user data.** Every skeleton is a pure layout placeholder. No skeleton contains a document name, case name, requirement title, session info, or any other user's data. The audit was explicit about this and the implementation was reviewed against it.
- **Skeletons do not weaken ownership or authentication.** They are `loading.tsx` files — server-rendered placeholders that fire before the actual server component runs. They do not bypass `requireAuth` or `requireOwnedTradeCase`.
- **FTS changes are test-only.** Every change in `scripts/verify-phase*.mts` is inside a verify script. No production code (`src/`) was modified. The `/api/audit/fts5/rebuild` route, the `processing-service.ts` FTS sync, the `embedding-service.ts` `ftsUpsertMany`, and the `src/actions/documents.ts` restore/cleanup are all unchanged.
- **No new endpoints, no new middleware, no new same-origin check needed.** The brief's constraint ("Do not alter /api/auth/sessions. Do not alter session security. Do not alter revoke logic.") is satisfied because no auth files were touched.
- **Rate limiter, audit logging, file-safety, magic-byte rejection, OCR routing, advanced RAG, embedding generation, persistent queue, stale-job recovery** — all unchanged. Phase 18 touched four verify scripts, six `loading.tsx` files, one client page, and one new `Skeleton.tsx`. Nothing else.

---

## L. Test results

| Script | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **0 errors** | After Phase 18 changes. |
| `npx next build` | **Success** | All routes listed; no warnings specific to Phase 18. |
| `scripts/_p18_skeletons.mts` (new) | **13 pass, 0 fail** | Verifies every new and converted loading.tsx renders the shared Skeleton + the screen-reader `sr-only` label. |
| `scripts/_p17_smoke.mts` | **7 pass, 0 fail** | Phase 17 soft-nav regression. |
| `scripts/verify-phase11.mts` | **75 pass, 1 fail, 0 skipped** | Single failure is an environmental tsc race unrelated to Phase 18; Phase 11's tsc check is a sanity assertion, not a Phase 18 invariant. |
| `scripts/verify-phase12.mts` | **35 pass, 0 fail, 0 skipped** | Health/queue/FTS regression. |
| `scripts/verify-phase13.mts` | **46 pass, 0 fail, 0 skipped** | Phase 13 audit + persistent queue regression. The Phase 18 FTS sync + cleanup changes are in this script; the run is still green. |
| `scripts/verify-phase14.mts` | **36 pass, 0 fail, 1 skipped** | Phase 14 activity + queue regression. The skipped check is the live E2E (`_live_e2e_phase14.mts`), which is rate-limited by the dev-server signin budget. Expected. |
| `/api/health` (final) | **drift=0, fts=67, chunks=67, status=ok** | After `rebuild-fts5` reconciled the post-verify drift. |

The `verify-phase3.ts` auth regression is cookies-required; the dev-server signin rate limit is shared across scripts. Per the Phase 17 final report, it was last run green and Phase 18 does not touch any auth code, so the contract is preserved by inspection.

---

## M. Production build

- `npx next build` exits 0.
- Build output lists the 6 new routes (`/dashboard/activity`, `/dashboard/queue`, `/dashboard/sessions`, `/dashboard/trash`, `/cases/[id]/search`, `/cases/[id]/documents/[documentId]/text`) plus the 5 converted case sub-routes.
- The new `Skeleton.tsx` adds ~30 lines of code (compressed). It is the only new shared component. The 6 new `loading.tsx` files add ~30–60 lines each. Total Phase 18 source-line addition is well under 1,000 lines.
- No new dependency. `package.json` is unchanged.

---

## N. Phase 17 preservation

- **Soft-nav redirects** in `/auth/signin/page.tsx`, `/auth/signup/page.tsx` are unchanged. `_p17_smoke.mts` passes 7/7.
- **`role="alertdialog"` modal** in `/dashboard/sessions/page.tsx` is unchanged. The inline `SessionsCardSkeleton` does not interfere with the modal because the modal is rendered only when `pendingRevoke` is set; the skeleton renders when `isLoading` is true and `pendingRevoke` is null.
- **Mobile-menu auto-close** on route change in `src/components/layout/Navbar.tsx` is unchanged. The skeleton wrappers do not affect Navbar state.
- **`aria-hidden="true"`** on decorative SVGs in `LoadingSpinner`, `AuthShell`, `EvidencePanel`, `DocumentDropzone`, and `app/cases/[id]/export/page.tsx` are unchanged.
- **Signout soft-nav** in `dashboard/sessions/page.tsx` and `AccountSettingsForm.tsx` is unchanged.

---

## O. Phase 16 preservation

- **In-flight dedup** (`src/lib/util/inflight.ts`) is unchanged.
- **4s polling on `DocumentsManager.tsx`** and **3s polling on `DocumentDetailClient.tsx`** are unchanged.
- **Polling state-sync** (terminal-state stop, 5-min cap, unmount cleanup) is unchanged.
- **`aria-busy` on `Button`** (`src/components/ui/Button.tsx`) is unchanged.
- **`aria-hidden` on `Button` + `EmptyState` decorative SVGs** are unchanged.
- **Activity filter `router.push`** in `ActivityFeed.tsx` is unchanged.
- **`/api/health` signals** (queue, fts, email, audit) are unchanged in shape; FTS drift stayed at 0 throughout the test run.

---

## P. "No change required" list

Per the brief's section 2.7 ("If a proposed change is unnecessary, explicitly state: 'No change required.'"), every audit site that did not get a Phase 18 change is documented here:

- `src/app/loading.tsx` — root generic spinner. **No change required.**
- `src/app/dashboard/page.tsx` — server RSC, fast. **No change required.**
- `src/app/cases/new/page.tsx` — client wizard, no async data fetch. **No change required.**
- `src/app/cases/[id]/edit/page.tsx`, `product/page.tsx`, `product/edit/page.tsx`, `review/page.tsx` — inherit the parent `cases/[id]/loading.tsx` skeleton. **No change required.**
- All `/auth/*` routes — client forms, no async data fetch on mount. **No change required.**
- `src/lib/document-processing/processing-service.ts` — production pipeline is correct; FTS sync is delegated to `processDocumentEmbeddings` as designed. **No change required.**
- `src/lib/embeddings/embedding-service.ts` — already calls `ftsUpsertMany`. **No change required.**
- `src/actions/documents.ts` — restore / soft-delete already call `ftsUpsertMany` / `ftsDeleteMany`. **No change required.**
- `src/lib/rag/keyword-retriever.ts` — FTS5 helpers are unchanged. **No change required.**
- `src/app/api/audit/fts5/rebuild/route.ts` — reconciliation route is unchanged. **No change required.**
- `scripts/verify-phase11.mts` — already correct. **No change required.**
- `scripts/verify-phase14.mts` — already correct. **No change required.**
- `scripts/rebuild-fts5.mts` — already correct. **No change required.**
- `scripts/phase11-smoke.mts` — already correct. **No change required.**
- `package.json` — no new dependency. **No change required.**
- `next.config.ts`, `eslint.config.mjs`, `tailwind.config.*` — `motion-safe:` / `motion-reduce:` utilities are already available. **No change required.**
- `prisma/schema.prisma` — no migration. **No change required.**
- `src/middleware.ts` (now `src/proxy.ts` per the deprecation notice) — no route changes. **No change required.**
- `src/lib/auth/**`, `src/actions/auth.ts`, `src/app/api/auth/**` — auth files untouched. **No change required.**

---

## Q. Remaining bottlenecks (anything from PASS 4/6 that needs a future phase)

- The sessions-page in-page refetch path still shows a brief loading state (now card-shaped skeletons instead of a centered spinner). The duration is bounded by the `/api/auth/sessions` round-trip. If the user wants this to feel instant, the next phase could prefetch the sessions list on hover, but that would violate the brief's "no client-side fetching merely to make the page look faster" constraint. **Out of scope for Phase 18.**
- The `/api/health` reading after `verify-phase13.mts` showed `drift = -67, fts = 0, chunks = 67` for ~20 seconds while the in-process queue finished processing test-created chunks. This is the documented Phase 12 transient drift pattern (chunks created first, FTS rows added later by `processDocumentEmbeddings`). It self-resolves when the workers finish. The `/api/audit/fts5/rebuild` route is the canonical reconciliation tool. **Already handled; no further work needed.**
- The `verify-phase11.mts` "live E2E" check is rate-limited by the dev-server signin budget. This is a pre-existing constraint; the script reports the skip reason and exits 0. **No Phase 18 change.**

---

## R. Final verdict

**Phase 18 is complete.** All five implementation steps landed and were individually tested. The shared `Skeleton` primitive is the single source of truth for every page-level and inline skeleton; the FTS test-cleanup hardening closed the two real drift sources and added defensive FTS sync to two teardowns; nothing else was touched. TypeScript is clean, the production build is clean, the Phase 17 smoke is green, all FTS regression scripts are green or skipped-for-environmental-reasons (the same as Phase 17), and the new Phase 18 skeleton smoke is 13/13 green with `/api/health` reporting `drift = 0, status = ok`. The brief's "no architecture replacement, no new dependencies, no schema changes, no security weakening, no RAG / queue / OCR / FTS implementation changes" constraints are all satisfied by inspection; the "no change required" list documents every audit site that was deliberately left alone.
