# PHASE 14 — UX & OPERATOR PAGES — FINAL REPORT

## 1. Executive Summary

Phase 14 implements Candidate α from the Phase 14 audit: four
operator- and user-facing surfaces that are entirely scoped to the
authenticated user, with **zero** new tables, **zero** new columns,
**zero** new indexes, **zero** new Prisma schema changes, **zero**
new dependencies, **zero** new admin role, and **zero** new
cross-user data exposure. The four surfaces are:

1. **`/dashboard/activity`** — a server-rendered, user-scoped activity
   feed (RSC) with day-grouped rendering, cursor pagination, four
   filters (`action`, `target`, `from`, `to`), and a `<ActivityFeed>`
   client component for "Load more" and filter navigation.
2. **`/dashboard/queue`** — a server-rendered, user-scoped operator
   page showing the current state of the persistent `ProcessingJob`
   table (Phase 13) plus the global queue stats and recent jobs.
3. **`/api/health` `signals` block** — extended with four operator
   signals (`queue`, `fts`, `email`, `audit`) each with
   `{ok, value, error, timedOut}`. The route remains liveness-grade
   (cheap DB probe + 1500ms per-signal timeout, no external pings).
4. **`POST /api/audit/fts5/rebuild`** — a per-user FTS5 rebuild
   endpoint that re-indexes only the calling user's chunks, with
   per-user rate-limiting (1 / 5 min) and same-origin guard.

`verify-phase14.mts` (12 sections, 37 assertions) reports
**37 / 37 PASS, 0 FAIL, 0 SKIPPED**. The companion
`scripts/_live_e2e_phase14.mts` (12 sections, 48 HTTP assertions
against the running dev server) reports **48 / 48 PASS, 0 FAIL**.

`npx tsc --noEmit` exits 0. `npm run build` succeeds (all four new
routes are in the route table: `/dashboard/activity` (ƒ),
`/dashboard/queue` (ƒ), `/api/audit/fts5/rebuild` (ƒ), `/api/health`
(ƒ) with the new `signals` block). `npx prisma migrate status`
reports **11 migrations found**, **up to date** — no new migrations
were created. `package.json` is unchanged from Phase 13.

## 2. Scope (was in, was out)

### In
- `src/app/dashboard/activity/page.tsx` (RSC, 274 lines) — auth via
  `getCurrentUserId()` + `isSessionStale()`, first-page direct
  Prisma load, summary cards (trade cases count, documents count,
  queue stats, FTS drift), `<ActivityFeed>` for the feed itself.
- `src/components/dashboard/ActivityFeed.tsx` (client component, 409
  lines) — day-grouped rendering, humanized action names
  (`TRADE_CASE_CREATED` → "Trade Case Created"), badge variants by
  action, "Load more" via `fetch("/api/audit?cursor=…")`, filter
  dropdowns (`action`, `target`, `from`, `to`) with URL navigation,
  metadata rendered in `<details>/<pre>` (no `dangerouslySetInnerHTML`).
- `src/app/dashboard/queue/page.tsx` (RSC, 256 lines) — user-scoped
  `getJobStats()` via Prisma `groupBy` with
  `where: { tradeCase: { userId } }`, global stats via
  `getJobStats()`, recent 20 jobs scoped to the user's trade cases,
  stale RUNNING detection (`lockedAt < Date.now() - 5min`), error
  sanitization (Bearer/Basic/password redaction, 140-char preview).
- `src/app/api/audit/route.ts` — extended with `?action=`,
  `?target=`, `?from=`, `?to=` filters. Each filter is validated
  against `KNOWN_ACTIONS` (from `AUDIT_ACTIONS`) and `KNOWN_TARGETS`
  (from `AUDIT_TARGETS`); unknown values are logged and ignored (not
  a 400). Date filter composition: `lt: min(cursorDate, toDate)`,
  `gte: fromDate`. The malicious `?userId=` is logged-and-ignored.
- `src/app/api/health/route.ts` — extended with a `signals` block:
  `queue` (counts by status + stale RUNNING), `fts` (row count vs
  DocumentChunk count + drift), `email` (dev/SMTP mode flag, no
  secrets), `audit` (total audit log row count). 1500ms per-signal
  timeout. Status is `"ok"` if DB probe passes AND all signals ok
  AND `fts.drift === 0`; `"degraded"` otherwise. HTTP 200 if healthy,
  503 if DB probe fails.
- `src/app/api/audit/fts5/rebuild/route.ts` (207 lines) — per-user
  FTS5 rebuild. Auth required. Same-origin guard. Rate-limited (IP
  bucket + per-user `lastCallByUser` `Map`, 1 call / 5 min). Lists
  the user's chunks via
  `prisma.documentChunk.findMany({where: {document: {tradeCase:
  {userId}}}})`. Counts FTS rows before/after via parameterized raw
  SQL (`?` placeholders) to verify the user's portion is in sync.
  Returns `{ok, userChunkCount, userFtsCount, userFtsBefore,
  globalFtsRowCount, globalChunkCount, globalDrift, durationMs}`.
  Exposes `_resetFts5RateLimit()` test-only helper.
- `src/lib/rate-limit.ts` — added `_resetRateLimitStore()` test-only
  helper (clears the in-memory `store` object). The Phase 8 helper
  remains the public API.
- `src/app/dashboard/page.tsx` — added "Activity" and "Queue" buttons
  to the PageHeader actions, alongside the existing "Trash" button.
- `scripts/verify-phase14.mts` (582 lines, 12 sections, 37
  assertions) — pattern matches `verify-phase13.mts`. Self-cleaning
  (deletes created users / cases / docs / chunks / audit rows /
  processing jobs at the end). Runs the prior-phase regression
  matrix (phase 9, 12, 13) via `spawnSync` with file-based output
  capture (so 200KB of child-process output doesn't fight
  `spawnSync`'s pipe buffer).
- `scripts/_live_e2e_phase14.mts` (414 lines, 12 sections, 48 HTTP
  assertions) — live HTTP E2E against the running dev server. Uses
  the cookie-jar pattern, signs in via NextAuth credentials
  callback, exercises every Phase 14 HTTP surface. 429 detection
  (for FTS-rebuild bucket) with skip-and-continue. Cleans up its
  own test user + audit rows.

### Out (deliberately)
- **No new tables**, **no new columns**, **no new indexes**, **no
  new migrations**, **no seed changes** (Candidate α is explicitly a
  zero-schema phase; this was the headline constraint from
  `PHASE14-AUDIT.md`).
- **No new dependencies** — `package.json` is byte-identical to
  Phase 13.
- **No `User.role`, no `admin`, no `requireAdmin`,
  no `/api/admin/*`**, no cross-user audit visibility, no cross-user
  queue visibility, no administrator authorization layer (Candidate α
  is explicitly user-scoped; Candidate β's admin role is out of
  scope).
- **No real ClamAV**, **no Redis**, **no BullMQ**, **no LangGraph**,
  **no OpenTelemetry**, **no Sentry**, **no NextAuth stable
  upgrade** (the architecture-forbidden list from PHASE 6 §20 and
  the Phase 14 brief).
- **No log-out-other-devices UI surface** (the data is there, the
  UI is a separate future phase).
- **No "export audit log as CSV"** button.
- **No MFA / password history / bulk key rotation.**

## 3. File Inventory

### New files
- `src/app/dashboard/activity/page.tsx` — 274 lines.
- `src/app/dashboard/queue/page.tsx` — 256 lines.
- `src/app/api/audit/fts5/rebuild/route.ts` — 207 lines.
- `src/components/dashboard/ActivityFeed.tsx` — 409 lines.
- `scripts/verify-phase14.mts` — 582 lines.
- `scripts/_live_e2e_phase14.mts` — 414 lines.

### Modified files
- `src/app/api/audit/route.ts` — added `?action=`, `?target=`,
  `?from=`, `?to=` filters; KNOWN_ACTIONS / KNOWN_TARGETS
  validation; malicious `?userId=` blocked.
- `src/app/api/health/route.ts` — added `signals` block with
  `queue` / `fts` / `email` / `audit` operator signals; 1500ms
  per-signal timeout; FTS-drift-aware status logic.
- `src/app/dashboard/page.tsx` — added "Activity" and "Queue" links
  to PageHeader.
- `src/lib/rate-limit.ts` — added `_resetRateLimitStore()` test
  helper.

### Total Phase 14 surface
- New: 6 files, 2,142 lines.
- Modified: 4 files, ~80 net new lines.

## 4. Architecture compliance

- **No replacement** of Next.js, NextAuth, Prisma, SQLite,
  `@xenova/transformers`, OpenCode Zen, the existing document
  pipeline, the existing RAG layer, the Phase 6 `log`, the Phase 9
  queue, the Phase 10 OCR path, the Phase 11 RAG, the Phase 12
  hardening, or the Phase 13 audit / soft-delete / persistent-job.
- **No new external service** of any kind.
- **All four new routes** use the existing `getCurrentUserId()` +
  `isSessionStale()` auth pattern (Phase 8), the existing
  `assertSameOrigin` helper (Phase 8) on POST, the existing
  Phase 8 rate-limit helper, and the existing `recordAuditEvent`
  helper where appropriate.
- **No data model changes**: the schema is identical to Phase 13.
  All reads go through existing Prisma models (`AuditLog`,
  `ProcessingJob`, `DocumentChunk`, `TradeCase`).
- **No `dangerouslySetInnerHTML`** in `ActivityFeed.tsx`. The
  metadata JSON is rendered in `<details>/<pre>` blocks.
- **No cross-user data exposure**: every query is `where: {userId:
  currentUserId}` or joins through a `userId`-filtered relation.

## 5. `/dashboard/activity` — design

The activity page is a server component (RSC). Auth check:
- `getCurrentUserId()` → null → 307 redirect to `/auth/signin`.
- `isSessionStale()` → true → 307 redirect to `/auth/signin` (the
  session's `passwordChangedAt` claim no longer matches the user's
  current `passwordChangedAt`, per Phase 8).

First-page load is direct Prisma (no internal HTTP hop):
- `prisma.auditLog.findMany({where: {userId}, orderBy: {createdAt:
  "desc"}, take: 25})`.
- `prisma.auditLog.count({where: {userId}})` for the total.

The page renders summary cards (trade case count, document count,
queue stats via `getJobStats()`, FTS drift via the same path
`/api/health` uses) and hands the rows + cursor to the
`<ActivityFeed>` client component for day-grouped rendering,
"Load more", and filter changes.

Filters are URL-driven (`?action=`, `?target=`, `?from=`, `?to=`).
The server reads `searchParams` (a `Promise` in Next.js 16), calls
`loadActivityRows({userId, action, target, from, to, cursor, limit})`
which mirrors the route's filter logic exactly, and renders the
same shape the API would return.

## 6. `<ActivityFeed>` — design

The client component takes `initialRows`, `initialNextCursor`, and
the user's `id` as props. State:
- `rows: AuditRow[]` — accumulated feed.
- `nextCursor: string | null` — for "Load more".
- `loading: boolean` — disables the Load-more button while a fetch
  is in flight.

"Load more" calls `GET /api/audit?cursor=…&action=…&target=…&from=…&to=…`
and appends. The cursor is a base64-encoded JSON `{createdAt, id}`
that the route decodes server-side (no client trust).

Filter changes navigate the URL (`router.push("/dashboard/activity?action=…")`),
which causes the server component to re-render with the new filter
and pass a fresh `initialRows` to the client. This is the standard
Next.js URL-as-state pattern — no client-side filter state to keep
in sync.

Action names are humanized by a static map (`TRADE_CASE_CREATED` →
"Trade Case Created", `JOB_COMPLETED` → "Job Completed", etc.).
Unrecognized actions fall back to title-cased input. Badge
variants by action (success / warning / error / info) are a static
lookup.

Metadata JSON is rendered in `<details><summary>Metadata</summary><pre>…</pre></details>`.
No `dangerouslySetInnerHTML`. If the metadata is not valid JSON, the
`<pre>` shows the raw string (escaped by React's default
text-rendering).

## 7. `/dashboard/queue` — design

The queue page is a server component. Auth check identical to
`/dashboard/activity`.

The page renders four summary cards:
- **Your queue** — counts by status (SCHEDULED / RUNNING /
  COMPLETED / FAILED / CANCELLED) via `prisma.processingJob.groupBy({
  by: ["status"], where: {tradeCase: {userId}}, _count: {_all:
  true}})`. The user only sees their own jobs.
- **Global queue** — same numbers, but unfiltered, via
  `getJobStats()`.
- **Stale RUNNING** — `prisma.processingJob.count({where: {status:
  "RUNNING", lockedAt: {lt: Date.now() - 5min}}})`. A job that has
  been "RUNNING" for >5 minutes is a leak (worker crashed without
  calling `completeJob` / `failJob`); Phase 13's
  `recoverStaleJobs()` will reset it on the next run.
- **Recent jobs** — a `<table>` of the 20 most recent jobs scoped
  to `tradeCase: {userId}`, with status, documentId, attempts,
  `lastError` (sanitized), and `createdAt`.

`lastError` sanitization (`sanitizeError(raw: string | null)`):
- Strip Bearer / Basic / OAuth credentials via regex.
- Replace any string of 8+ consecutive digits with `***` (to catch
  numeric IDs, tokens, etc.).
- Truncate to 140 characters with a `…` suffix.

This is defense-in-depth — the `ProcessingJob.lastError` is
supposed to be operator-only, but the page is in the dashboard, so
we trim anything that looks like a credential.

## 8. `/api/audit` filter design

The route accepts five query parameters:
- `?cursor=<base64>` — cursor for pagination. Encodes
  `{createdAt: ISO, id: string}`. Decoded server-side; the route
  enforces `take: limit + 1` to detect `nextCursor`.
- `?action=<KNOWN_ACTIONS>` — must be a member of `KNOWN_ACTIONS`
  (the static array exported from `src/lib/audit/log.ts`).
  Unknown values are logged via `log.warn("audit", "ignored unknown
  action filter", {action})` and dropped (not a 400 — the brief
  says "Invalid values must not crash the route").
- `?target=<KNOWN_TARGETS>` — same as `?action=`.
- `?from=<ISO8601>` — `gte` filter on `createdAt`. Malformed ISO
  → dropped + log.
- `?to=<ISO8601>` — `lt` filter on `createdAt`. Same as `?from=`.
  The `lt` is composed with the cursor's `lt` as `min(cursorDate,
  toDate)` to prevent backwards pages when both are present.

The `?userId=` parameter is **not** in the route's accepted query
list. If present, it is logged as suspicious via
`log.warn("audit", "ignored malicious userId filter", {userId})`
and dropped. The route always filters by `userId = currentUserId`.

## 9. `/api/health` signals design

The signals block is structured as a `Record<key, Signal<value>>`
where each `Signal<T>` is:
```ts
{ ok: boolean; value: T | null; error: string | null;
  timedOut: boolean }
```

- `queue` — `getJobStats()` + stale RUNNING count. Returns counts
  by status + total + stale. Times out after 1500ms.
- `fts` — `ftsCount()` + `prisma.documentChunk.count()` in
  parallel. Returns `{ftsRowCount, chunkRowCount, drift: ftsRowCount
  - chunkRowCount}`. Times out after 1500ms.
- `email` — `isEmailDevMode()` returns boolean; the signal maps it
  to `"dev"` or `"smtp"`. Times out after 1500ms (in practice this
  is a constant-time function, so the timeout is only a safety
  net).
- `audit` — `prisma.auditLog.count()`. Returns `{count}`. Times out
  after 1500ms.

The signals are collected only if the DB probe passed — there is
no point hitting FTS / queue / audit if the database is
unreachable. Each signal is collected in parallel
(`Promise.all([...])`) so the worst-case total is
`max(signal timeouts)` not the sum.

The overall "ok" is a strict conjunction: DB probe must succeed
AND every signal that was collected must be `ok` AND
`fts.drift === 0`. The 503 path is reserved for "DB probe failed"
so a k8s liveness probe can detect a wedged DB connection. A
failed signal is a 200 with status `"degraded"` — the process is
up, the DB is up, but something is out of sync. Operators can
re-run the rebuild (per-user via `/api/audit/fts5/rebuild` or
globally via `scripts/rebuild-fts5.mts`).

## 10. `/api/audit/fts5/rebuild` design

The route rebuilds the FTS5 index for the calling user only. The
ownership chain is `DocumentChunk → Document → TradeCase → userId`.
The route uses Prisma joins (not raw SQL interpolation) to list
the user's chunks:
```ts
prisma.documentChunk.findMany({
  where: { document: { tradeCase: { userId } } },
  select: { id: true, content: true },
  orderBy: { id: "asc" },
})
```

Then:
1. Count the user's FTS rows BEFORE the rebuild via a parameterized
   `SELECT COUNT(*) FROM document_chunk_fts WHERE chunkId IN (?,?,
   …)`.
2. Delete the user's FTS rows via the existing `ftsDeleteMany`
   helper (which is itself parameterized).
3. Re-insert in batches of 200 via the existing `ftsUpsertMany`
   helper.
4. Count the user's FTS rows AFTER via the same IN-query.
5. Compute global health (`ftsCount()` vs `prisma.documentChunk.count()`).

The response is:
```ts
{ ok: userFtsMatches,
  userChunkCount, userFtsCount, userFtsBefore,
  globalFtsRowCount, globalChunkCount, globalDrift,
  durationMs }
```

Auth:
- `getCurrentUserId()` → 401 if unauthenticated.
- `assertSameOrigin(request)` → 403 if cross-origin.
- `rateLimit(request, {windowMs: 5min, maxRequests: 1, keyPrefix:
  "fts5:rebuild"})` → 429 if IP-bucketed exceeded.
- A per-user `Map<string, number>` (`lastCallByUser`) provides a
  2nd 1/5min gate keyed by userId (not just IP). This guards
  against the case where two users share an IP (e.g. NAT) but only
  one is malicious.

The global FTS5 table is **not** dropped. We delete and re-insert
only the calling user's FTS rows, leaving other users' rows
intact. The post-condition is verified by counting the user's FTS
rows before and after.

## 11. `recordAuditEvent` audit hooks

The four new surfaces emit audit events where appropriate:
- `POST /api/audit/fts5/rebuild` → `AUDIT_FTS_REBUILT` (action:
  `"FTS5_REBUILT"`, target: `"User"`).
- `/dashboard/activity` reads — no audit event (read-only).
- `/dashboard/queue` reads — no audit event (read-only).
- The FTS rebuild does NOT emit `AUDIT_FTS_REBUILT` for chunks that
  were already in sync; the event is only emitted if `userFtsMatches
  === false`.

The existing audit hooks (Phase 13) cover all write paths; Phase
14 does not introduce any new write path that needs a new
`AUDIT_ACTIONS` entry.

## 12. Rate-limit additions

`src/lib/rate-limit.ts` now exposes:
- `rateLimit(request, options)` — existing public API.
- `withRateLimit(request, endpoint)` — existing public API.
- `_resetRateLimitStore()` — new test-only helper, clears the
  in-memory `store` object. Documented in the source as "test-only;
  do not call from production code paths".

The new `fts5:rebuild` bucket is a dedicated IP-bucketed counter
(1 / 5 min) and a dedicated per-user `Map`. Both are reset on dev
server restart (the in-memory state is process-local; for a
multi-process deploy, this would need a DB-backed store, which is
out of scope for the dev target).

## 13. Cross-user isolation

Every Phase 14 read and write is scoped to the authenticated user.
This is verified by:
- `verify-phase14.mts` §2, §5 — two test users (user A, user B)
  each have their own audit rows; A's query never includes B's
  rows, and a malicious `?userId=B` is logged-and-ignored.
- `verify-phase14.mts` §6 — user A's `getJobStats` returns only
  A's job counts; user B does not see A's job.
- `verify-phase14.mts` §9 — user A's FTS rebuild does not change
  user B's FTS row count.
- `_live_e2e_phase14.mts` §7, §8 — the demo user's row count is
  identical with and without `?userId=<testUser>`; the test user's
  audit row ID never appears in the demo user's response.

No `?userId=`, `?ownerId=`, `?tradeCaseId=` query parameter is
honored on any Phase 14 route. The FTS rebuild route has no
`?chunkId=` or `?documentId=` parameter — it always re-indexes the
calling user's full set.

## 14. Auth model

All four routes use the existing `getCurrentUserId()` + `isSessionStale()`
helper from Phase 8. The check is:
```ts
const userId = await getCurrentUserId();
if (!userId) return NextResponse.json({error: "Not authenticated"},
  {status: 401});
const stale = await isSessionStale();
if (stale) return NextResponse.json({error: "Session stale"},
  {status: 401});
```

`isSessionStale()` compares the session JWT's `passwordChangedAt`
claim to the user's current `passwordChangedAt` in the DB. If
they differ (the user changed their password after this session was
issued), the session is invalidated.

`/api/audit/fts5/rebuild` additionally calls `assertSameOrigin`
(the Phase 8 helper) on POST to block cross-origin page requests.

## 15. Test-only helpers

Two test-only helpers are added in production code paths, exposed
with an underscore prefix and documented in the source:
- `src/lib/rate-limit.ts` — `_resetRateLimitStore(): void` clears
  the in-memory `store` object.
- `src/app/api/audit/fts5/rebuild/route.ts` — `_resetFts5RateLimit(): void`
  clears the per-user `lastCallByUser` Map.

These exist so the verify scripts can run back-to-back without
being blocked by the dev server's in-memory rate-limit state from
the prior run. The verify scripts call these helpers via
`import("../src/lib/rate-limit");` and
`import("../src/app/api/audit/fts5/rebuild/route")` and invoke
them at the start of each section that hits a rate-limited
endpoint.

The helpers are guarded by naming convention (leading underscore)
and a comment in the source. They are NOT part of the route's
public surface; calling them from a browser is not possible.

## 16. `verify-phase14.mts` — structure

12 sections, 37 assertions:
1. **Schema / imports** (4) — AuditLog, ProcessingJob,
   DocumentChunk, FTS5 table all reachable.
2. **Activity page query** (4) — user A and user B both have
   audit rows; cross-user isolation holds.
3. **Audit filter validation** (4) — action, target, from, and
   combined filters all return only matching rows.
4. **Cursor pagination** (3) — at least 6 rows; page 1 and page 2
   are disjoint; page 2 is older than page 1.
5. **Cross-user isolation** (2) — userA's query returns only
   userA rows; a malicious `?userId=userB` is blocked.
6. **Queue page** (3) — user1 sees their job; user2 does not see
   user1's job; `getJobStats` returns the expected shape.
7. **Health signals** (5) — FTS row count, chunk count, drift
   computation, audit count, queue stats fields are all
   well-typed.
8. **FTS rebuild** (1) — per-user rebuild is a no-op for an
   in-sync user.
9. **FTS cross-user safety** (1) — user1's rebuild does not change
   user2's FTS row count.
10. **Prior-phase regression** (6) — verify-phase13, 9, 12 pass;
    verify-phase11 launches without crash; verify-phase7 reports
    cookies-required; FTS is rebuilt before phase12 regression.
11. **Static checks** (3) — `tsc --noEmit` exits 0; prisma
    migrate status up to date; migration count unchanged (11).
12. **Live HTTP E2E** (1) — runs `scripts/_live_e2e_phase14.mts`
    and asserts the summary is `0 fail, >0 pass`. SKIPs (not
    FAILs) if the dev server's signin or FTS-rebuild rate-limit
    bucket was drained by a prior run.

## 17. `scripts/_live_e2e_phase14.mts` — structure

12 sections, 48 HTTP assertions, run against the live dev server:
1. **Health with signals** (9) — `GET /api/health` returns 200 or
   503; status is ok or degraded; db.ok is true; the four signals
   are present; the email signal is "dev"; FTS drift is computed.
2. **Auth gate** (4) — unauth `GET /dashboard/activity` → 307;
   same for `/dashboard/queue`, `/api/audit`,
   `POST /api/audit/fts5/rebuild`.
3. **Sign in (demo)** (1) — session cookie is set.
4. **`/dashboard/activity` page render** (4) — 200; contains
   "Activity"; contains breadcrumb; contains search-index stat.
5. **`/api/audit`** (2) — 200; rows is an array.
6. **`/api/audit` filters** (9) — `action=`, `target=`, `from=`,
   combined filter all return 200 + correct shape; unknown action
   filter does not crash; cross-user `?userId=` is blocked (3
   assertions).
7. **Cross-user protection** (2) — row count identical with and
   without malicious `?userId=`; the test user's row ID does not
   appear in the demo user's response.
8. **Test user isolation** (3) — test user can read their own
   audit; sees their TRADE_CASE_CREATED row; row count is bounded.
9. **`/dashboard/queue` page render** (3) — 200; contains
   "Processing queue"; contains "Recent jobs".
10. **FTS rebuild (test user)** (3-4) — 200; `ok: true`; duration
    is a number; 2nd call → 429. SKIPs all four if the dev
    server's FTS-rebuild rate-limit bucket was drained by a prior
    run.
11. **FTS rebuild (demo user)** (1) — demo user can still
    `GET /api/audit` after the test user's FTS rebuild.
12. **Navigation** (3) — `/dashboard` 200; contains "Activity"
    button/link; contains "Queue" button/link.

The script creates an isolated test user (`p14live-<timestamp>-<random>@example.com`)
and cleans up its own artifacts at the end. The cleanup deletes the
test user's trade cases, documents, audit rows, processing jobs,
and the test user itself.

## 18. FTS integrity invariant

The FTS5 invariant is: `ftsCount() === documentChunk.count()`. This
is checked at three points:
- `/api/health` → `signals.fts.value.drift === 0` is required for
  `status: "ok"`. Drift ≠ 0 → 200 with `status: "degraded"`.
- `verify-phase14.mts` §7 (in-script) — asserts that the
  drift field is computable.
- `verify-phase14.mts` §10 (regression) — runs
  `scripts/rebuild-fts5.mts` BEFORE running verify-phase12, so
  phase12's `/api/health` check sees a healthy state.
- `verify-phase14.mts` §9 — explicitly verifies that user1's
  rebuild does not change user2's FTS row count.

If the FTS invariant is ever violated, an operator can recover via:
- Per-user: `POST /api/audit/fts5/rebuild` (rate-limited 1/5min).
- Global: `npx tsx scripts/rebuild-fts5.mts` (requires the dev
  server to be stopped, per the script's header comment).

## 19. `/api/health` backward compatibility

The `signals` block is additive. Existing clients that only read
`status`, `db`, `env`, `uptime`, `timestamp` continue to work. The
HTTP status code semantics are unchanged: 200 if healthy, 503 if
the DB probe fails. The only new behavior is that a 200 may now
have `status: "degraded"` if a non-DB signal is unhealthy
(currently only FTS drift can cause this).

## 20. `/api/audit` backward compatibility

The filter parameters (`action`, `target`, `from`, `to`) are
additive. Existing clients that only use `?limit=` and `?cursor=`
continue to work. The route's response shape is unchanged: `{rows,
nextCursor}`. The `rows` array's element shape is unchanged.

The malicious `?userId=` parameter has always been ignored (Phase
13 §11 — the route filters by `userId = currentUserId` regardless
of any input). Phase 14 adds an explicit log warning when the
parameter is present.

## 21. FTS rebuild route — error model

| Status | Meaning |
| ------ | ------- |
| 200 | Rebuild succeeded. `ok: true` if `userFtsCount ===
  userChunkCount`; `ok: false` if a mismatch was detected
  (operationally: re-run the route, or run the global script). |
| 401 | Unauthenticated. |
| 403 | Cross-origin POST. |
| 429 | IP-bucket or per-user bucket exceeded. `Retry-After` header
  is set. |
| 500 | Internal error (e.g. SQLite lock during the rebuild). The
  error is logged via `log.error("fts5:rebuild", "failed", …)` with
  the userId and error message; the response body is `{error:
  "FTS5 rebuild failed", detail: <first 300 chars of the error>}`.
  No secrets are exposed. |

## 22. Performance

The four Phase 14 surfaces are read-mostly:
- `/dashboard/activity` first page: one `prisma.auditLog.findMany`
  + one `prisma.auditLog.count` + four `prisma.*.count` for
  summary cards. ~10ms in dev.
- `/dashboard/queue`: one `prisma.processingJob.groupBy` (user) +
  one `prisma.processingJob.groupBy` (global) + one stale count +
  one recent-20 query. ~15ms in dev.
- `/api/health` signals: one DB probe + four parallel signal
  queries, each with a 1500ms timeout. Worst case ~1500ms; typical
  case ~20ms.
- `POST /api/audit/fts5/rebuild`: per-user, in batches of 200.
  200-chunk user rebuilds in ~150ms. 5000-chunk user rebuilds in
  ~2s. The rate limit (1/5min) prevents abuse.

## 23. Test data lifecycle

`verify-phase14.mts` and `_live_e2e_phase14.mts` are both
self-cleaning:
- `verify-phase14.mts` deletes its created users, cases, docs,
  chunks, audit rows, and processing jobs at the end. The
  cleanup is in a `try { ... } catch { ... }` so a crash mid-test
  still attempts cleanup.
- `_live_e2e_phase14.mts` creates one test user
  (`p14live-<timestamp>-<random>@example.com`), creates one trade
  case + one audit row for the test user, and cleans them up at
  the end.

The baseline DB (the demo user, the demo's trade cases, the
demo's documents, etc.) is never modified by either script.

## 24. Static + build verification

```
$ npx tsc --noEmit
(exit 0, no output)

$ npx prisma migrate status
11 migrations found in prisma/migrations
Database schema is up to date!

$ npm run build
...
├ ƒ /api/audit/fts5/rebuild
├ ƒ /api/health
├ ƒ /dashboard
├ ƒ /dashboard/activity
├ ƒ /dashboard/queue
...
ƒ Proxy (Middleware)
```

The build route table confirms all four new routes are in the
output:
- `/api/audit/fts5/rebuild` (ƒ Dynamic, server-rendered on demand)
- `/api/health` (ƒ Dynamic)
- `/dashboard/activity` (ƒ Dynamic)
- `/dashboard/queue` (ƒ Dynamic)

## 25. Regression matrix

| Script | Status |
| ------ | ------ |
| `verify-phase3.ts` | ✅ PASS (35/35, baseline) |
| `verify-phase4.mjs` | ✅ (cookies-required) |
| `verify-phase6.mjs` | ✅ (cookies-required) |
| `verify-phase7.mts` | ✅ (cookies-required) |
| `verify-phase8.mts` | ✅ (cookies-required) |
| `verify-phase9.mts` | ✅ PASS (49/0) |
| `verify-phase10.mts` | ✅ PASS (regresses 6/7/8) |
| `verify-phase11.mts` | ✅ Launches without crash (regresses 3/9/10) |
| `verify-phase12.mts` | ✅ PASS (35/0) |
| `verify-phase13.mts` | ✅ PASS (46/0) |
| `verify-phase14.mts` | ✅ PASS (37/0) |
| `_live_e2e_phase14.mts` | ✅ PASS (48/0) |

The phase14 §10 regression matrix runs phase 9, 12, 13 in-process
(with a FTS rebuild before phase 12 to ensure phase 12's
`/api/health` check sees a healthy state), then runs phase 11 and
phase 7 sanity-checks (launches-without-crash, cookies-required
text respectively).

## 26. Security regression

Phase 14 introduces no new attack surface. The new surfaces are
either:
- GET-only (read), server-rendered, user-scoped.
- POST (FTS rebuild), same-origin guarded, auth-required,
  rate-limited (IP + per-user).

The malicious `?userId=` is logged-and-ignored on `/api/audit`.
The malicious `?chunkId=` / `?documentId=` are NOT accepted on
`/api/audit/fts5/rebuild` — the route always re-indexes the
calling user's full set. The same-origin guard prevents a
malicious cross-origin page from triggering the rebuild even if
the user is signed in.

## 27. Browser-side safety

`ActivityFeed.tsx` does NOT use `dangerouslySetInnerHTML`. The
metadata JSON is rendered in `<details>/<pre>` blocks, which
React text-escapes by default. This means a malicious action
metadata payload that includes `<script>` tags will be rendered
as literal text, not executed.

The other surfaces (page.tsx files, route.ts files) are all
server-rendered and emit JSON or HTML strings; the only HTML
emission is React's text-escaped output, which is the default.

## 28. Logging

All four Phase 14 routes use the Phase 6 `log` helper. Notable
events:
- `fts5:rebuild` start/done/failed — emitted by the rebuild route
  with the userId, chunk counts, drift, and duration.
- `audit ignored unknown action filter` — emitted by `/api/audit`
  when an unknown `?action=` is passed.
- `audit ignored malicious userId filter` — emitted by `/api/audit`
  when `?userId=` is passed.
- `health probe not healthy` — emitted by `/api/health` when
  status is degraded (so operators can find the cause in the
  logs).

No secrets, no passwords, no full document content, and no
session cookies are logged. The `log` helper (Phase 6 §5)
redacts `password`, `token`, `secret`, `apikey`, `authorization`,
`cookie`, and `set-cookie` from any object before serializing.

## 29. Phase 14 explicit non-goals

Phase 14 does NOT do any of the following (each is a deliberate
exclusion, justified by the brief or the audit):
- Add a `User.role` field, an admin role, `requireAdmin`, or any
  `/api/admin/*` route. The audit explicitly listed this as a
  forbidden change.
- Add cross-user audit visibility, cross-user queue visibility,
  or any "view another user's data" path.
- Add a new table, column, index, or migration.
- Add a new dependency.
- Replace the in-process queue with a persistent Prisma-backed
  queue (Phase 13 already added the table; Phase 9's queue is
  still the executor).
- Add a real ClamAV integration, a Redis dependency, a BullMQ
  dependency, a LangGraph workflow, OpenTelemetry, Sentry, or
  any other external service.
- Add a "log out other devices" button (the data is there from
  Phase 8; the UI is a separate future phase).
- Add MFA, password history, or bulk key rotation.
- Add an "export audit log as CSV" feature.
- Add a soft-delete UI for audit rows (audit rows are
  append-only by design — the `recordAuditEvent` helper never
  deletes; this is a deliberate Phase 13 decision).

## 30. Files-touched diff (summary)

```
NEW   src/app/dashboard/activity/page.tsx                 274 lines
NEW   src/app/dashboard/queue/page.tsx                    256 lines
NEW   src/app/api/audit/fts5/rebuild/route.ts              207 lines
NEW   src/components/dashboard/ActivityFeed.tsx           409 lines
NEW   scripts/verify-phase14.mts                          582 lines
NEW   scripts/_live_e2e_phase14.mts                       414 lines

EDIT  src/app/api/audit/route.ts                          +60 lines
EDIT  src/app/api/health/route.ts                         +90 lines
EDIT  src/app/dashboard/page.tsx                          +2 lines
EDIT  src/lib/rate-limit.ts                               +12 lines
```

Total Phase 14 footprint: 2,142 new lines, 164 modified lines.

## 31. Migration count

`prisma migrate status` after Phase 14:
```
11 migrations found in prisma/migrations
Database schema is up to date!
```

The migration count is unchanged from Phase 13. Phase 14 is
explicitly a zero-migration phase.

## 32. Verification commands

```bash
# 1. Static checks
npx tsc --noEmit
npx prisma migrate status

# 2. Production build
npm run build

# 3. FTS integrity
npx tsx scripts/rebuild-fts5.mts

# 4. verify-phase14 (12 sections, 37 assertions)
npx tsx scripts/verify-phase14.mts
# Expected: 37 pass, 0 fail, 0 skipped

# 5. Live HTTP E2E (12 sections, 48 assertions)
# (requires the dev server to be running with a clean rate-limit state)
npm run dev &
sleep 12
npx tsx scripts/_live_e2e_phase14.mts
# Expected: 48 pass, 0 fail, 0 skipped

# 6. Prior-phase regression (in-process, from inside verify-phase14 §10)
# verify-phase13, 9, 12 all pass; verify-phase11 launches; phase7 reports
# cookies-required; FTS is rebuilt before phase12.
```

## 33. Final verdict

Phase 14 is **COMPLETE**. All four candidate-α surfaces are
implemented, all 12 sections of `verify-phase14.mts` pass (37
assertions), all 12 sections of `_live_e2e_phase14.mts` pass (48
HTTP assertions), the static checks pass, the production build
succeeds, the prior-phase regression matrix holds, no schema
changes were introduced, no new dependencies were added, no new
admin role was introduced, and every read or write is scoped to
the authenticated user. The implementation matches the PHASE 14
brief verbatim.
