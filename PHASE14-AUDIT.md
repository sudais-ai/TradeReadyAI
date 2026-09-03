# PHASE 14 — PRE-IMPLEMENTATION DISCOVERY, AUDIT & SCOPE LOCK

**Type:** Audit, discovery, and recommendation. **NOT an implementation.**
**Status:** NO PHASE 14 IMPLEMENTATION WAS PERFORMED IN THIS AUDIT.
**Audit date:** 2026-08-29

This document answers one question: given that Phases 1–13 are complete
and verified, **what is the strongest evidence-based candidate for Phase 14**?

It is produced under the following constraints, all of which the audit
honored:

- No application code was modified.
- No database, no migration, no seed, no `prisma migrate reset` was run.
- No dependency was added to `package.json`.
- No architectural replacement was proposed (no Redis, BullMQ, Kafka,
  Elasticsearch, Pinecone, Weaviate, Qdrant, Supabase, Firebase, Clerk,
  Auth0, second ORM, second DB, second auth framework, microservices,
  LangGraph, real ClamAV, unnecessary NextAuth upgrade, OTel, Sentry).
- No speculative work was invented. Every candidate item is grounded in
  text already present in the repository, or in operator surfaces that
  are explicitly absent and demanded by a deferred item.
- The existing stack is preserved: Next.js 16.3.2, NextAuth v5 beta 32,
  Prisma 5.22 + SQLite 3.45 + FTS5, `@xenova/transformers` 2.17.2,
  Phase 6 `log` utility, Phase 9 in-process queue (now backed by
  Phase 13 persistent table), Phase 10 OCR (`trocr-small-printed`),
  Phase 11 Advanced RAG, Phase 13 AuditLog + soft-delete + persistent
  ProcessingJob.

---

## 1. Executive Summary

- **Phase 13 is closed and verified.** `verify-phase13.mts` reports
  46/46, `_live_e2e_phase13.mts` reports 32/0/0, the production build
  succeeds, tsc exits 0, `prisma migrate status` reports the database
  is up to date with 11 migrations, and the security regression script
  reports 13/13. The `PHASE13-FINAL-REPORT.md` explicitly marks
  "Phase 13 is CLOSED." Re-verification during this audit (live, today)
  re-confirmed 46/46, 32/0/0, tsc=0, and `migrate status`=up to date.
- **The strongest remaining deferred work is the operator/observability
  surface.** Phase 13 added the data the operator needs (`AuditLog`,
  `ProcessingJob`, soft-delete state) but did not add the surface
  through which the operator can read it. The pieces exist in code
  (`getJobStats()`, `scrubMetadata`, the persistent queue, the audit
  recorder, the `rebuild-fts5.mts` script) but are not exposed via any
  HTTP route or page.
- **The recommended Phase 14 is Candidate β: "Operator & Observability
  Surface."** It is the smallest additive change that turns the data
  Phase 13 produced into something an operator (and a debugging
  developer) can actually see. It does not introduce an admin role
  (the audit log remains user-scoped), does not add any dependency, and
  leaves every prior phase's surface intact.
- **No new architecture, no new service, no new dependency.** The
  operator surface is built on the existing Next.js App Router, the
  existing `getCurrentUserId()` auth helper, the existing `log`
  utility, the existing `getJobStats()` / `recordAuditEvent` /
  `ftsCount()` helpers, and the existing `rebuild-fts5.mts` script.
- **No implementation performed.** This file is the entire deliverable.

---

## 2. Phase 13 Closure Verification (re-run live today)

The brief required an independent re-verification before proposing
Phase 14. Results from this audit's run, in this exact order:

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | exit 0, no output |
| Prisma migration | `npx prisma migrate status` | "Database schema is up to date!" — 11 migrations |
| Phase 13 unit/integration | `npx tsx scripts/verify-phase13.mts` | **46 pass / 0 fail / 0 skipped** |
| Phase 13 live HTTP | `npx tsx scripts/_live_e2e_phase13.mts` | **32 pass / 0 fail / 0 skipped** |
| Schema inspection | `prisma/schema.prisma` | 14 models including `AuditLog`, `ProcessingJob`, `Session`; `deletedAt` on `TradeCase` and `Document`; composite indexes intact |
| Audit log instrumentation | `grep "recordAuditEvent" src/actions src/app/api -r` | 7 call sites in `actions/trade-cases.ts`, `actions/documents.ts`, `api/account/change-password/route.ts`, `api/auth/reset-password/route.ts` |
| Persistent queue | `grep "createProcessingJob" src/lib/document-processing/processing-queue.ts` | The in-process queue writes a `ProcessingJob` row on enqueue, mirrors status, and the executor (`runJob`) already claims and completes it |
| Final report | `PHASE13-FINAL-REPORT.md` §29 | Explicitly states "Phase 13 is CLOSED" with the green post-restart live-verification block |

**No Phase 13 regression was found.** The repository is in the state
the final report describes.

---

## 3. Current Architecture (post-Phase 13)

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16.3.2 (App Router) | Server actions, RSC, route handlers, middleware |
| Auth | NextAuth v5 beta 32, JWT | `Session` model exists but is unwritten (JWT only) |
| ORM | Prisma 5.22 | Single ORM, additive migrations only |
| Database | SQLite 3.45 + FTS5 | Single DB; FTS5 lives in the same file as the Prisma tables |
| Vector search | Brute-force cosine over `DocumentChunkEmbedding.vector` (TEXT) | No FAISS/pgvector; fine at current document scale |
| LLM | OpenCode Zen | One provider, in-process |
| Embedding | `@xenova/transformers` 2.17.2 | Local on-device, three providers (dev, local, opencode) |
| OCR | `Xenova/trocr-small-printed` | Image-only PDFs are returned as `extractedText: null`; this is honest documented behavior, not a bug |
| Logging | `src/lib/log.ts` | Four levels (`info`, `warn`, `error`, `debug`), secret-redacting, `console.*` sink |
| Queue | In-process Phase 9 queue, mirrored to Phase 13 `ProcessingJob` table | The table is the durable record; the in-process queue is the fast executor |
| Audit | Phase 13 `AuditLog` + `recordAuditEvent` | 11 action constants, 4 target constants, best-effort |
| Health | Phase 12 `/api/health` | `prisma.$queryRaw SELECT 1` + 2s timeout, no auth, 200/503 |
| Build | `next build` (TS) | Passes; 23 static pages + 38 routes |
| Dependencies | 18 prod, 10 dev | No Redis, no BullMQ, no LangGraph, no ClamAV, no OTel |

**Forbidden items confirmed absent:** Redis, BullMQ, Kafka, Elasticsearch,
Pinecone, Weaviate, Qdrant, Supabase, Firebase, Clerk, Auth0, second
ORM, second DB, second auth, LangGraph, real ClamAV, OTel, Sentry, any
unnecessary NextAuth upgrade, microservices.

---

## 4. Completed Capability Inventory

The following are present and verified at the close of Phase 13. Phase
14 must build on this surface; it must not re-implement it.

- **Foundation (1–7):** Schema, dashboard, RAG pipeline, ownership, indexes.
- **Auth (8):** `passwordChangedAt`, rate-limit buckets, secret redaction, same-origin guard, collapsed verify-email errors.
- **Queue (9):** In-process queue, file-safety check (magic bytes), bounded concurrency, SIGTERM/SIGINT drain.
- **OCR (10):** `trocr-small-printed`, lazy model load, routed in `processor.ts`.
- **Advanced RAG (11):** FTS5 (BM25 + porter), query rewriter, metadata filter, hybrid RRF, cross-encoder reranker, context expander, freshness, citation validator.
- **Production hardening (12):** `/api/health`, FTS5 rebuild script, trust-proxy hardening, `PROCESSING_CONCURRENCY` env, SIGTERM drain, password-change email, `passwordChangedAt` UI, composite `(userId, updatedAt DESC)` index.
- **Data safety (13):** Soft delete on `TradeCase` and `Document`, restore paths, `AuditLog` + `recordAuditEvent`, persistent `ProcessingJob` with stale-recovery, `/api/audit` endpoint, `/dashboard/trash` page.

Every capability above is verified by a passing `verify-phase*.mts` script
and (where applicable) a passing `_live_e2e_phase*.mts` HTTP script.

---

## 5. Remaining Deferred-Work Inventory (after Phase 13)

The complete inventory of items that were "deferred", "out of scope",
"future", "open", or "known limitation" in any completed phase report
(6–13), **after** applying Phase 13's implementation. Each item is
classified per the brief's A–G taxonomy:

| # | Item | Source | Classification | Why |
| - | --- | --- | --- | --- |
| 1 | Real ClamAV integration | PHASE 9 §29, PHASE 10 §30 | **C. Architecture-forbidden** | Explicitly forbidden by brief |
| 2 | "Log out other devices" UI | PHASE 8 §32, PHASE 12 §30, PHASE 13 §31 | **D. Blocked by another decision** | JWT sessions are not individually revocable; the `Session` Prisma model is unwritten; DB-session table is the fix and is out of scope |
| 3 | NextAuth v5 stable upgrade | PHASE 8 §32, all later phases | **C. Architecture-forbidden** | Brief forbids swapping auth framework |
| 4 | LangGraph workflow | PHASE 6 §20, PHASE 12 §30, PHASE 13 §31 | **C. Architecture-forbidden** | Brief forbids LangGraph |
| 5 | Real OTel / Sentry / structured-logging sink | PHASE 6 §20, PHASE 12 §30, PHASE 13 §31 | **C. Architecture-forbidden** | External service; Phase 18 was always the future home and remains out of scope |
| 6 | Rate-limit backed by Redis | PHASE 6 §20, PHASE 12 §30, PHASE 13 §31 | **C. Architecture-forbidden** | In-memory rate-limit is sufficient for single-instance dev target |
| 7 | Bulk key rotation | PHASE 8 §32, PHASE 12 §30, PHASE 13 §31 | **C. Architecture-forbidden** | "Deferred to the deployer" per PHASE 8 §32; no keys to rotate in the current build |
| 8 | Handwriting OCR (`trocr-small-handwritten`) | PHASE 10 §30 | **E. Still genuinely unblocked** | Pure opt-in addition to existing OCR pipeline |
| 9 | Multi-language OCR | PHASE 10 §30 | **E. Still genuinely unblocked** | Same — requires a different model load |
| 10 | PDF rasterize + OCR fallback | PHASE 10 §30 | **E. Still genuinely unblocked (with caveat)** | Needs `pdfjs-dist` (already a prod dep) for rasterization; "image-only PDF" is a known surface today that returns `extractedText: null` |
| 11 | Larger OCR model (`trocr-base-printed`) | PHASE 10 §30 | **G. Candidate for Phase 14** | Already switchable via `OCR_MODEL` env; the only real work is a quality test |
| 12 | FTS5 rebuild script exposed via authenticated route | PHASE 12 §11 | **E. Still genuinely unblocked** | `scripts/rebuild-fts5.mts` is CLI-only; the brief already named "operator can rebuild" as a future concern |
| 13 | `/api/health` extended to readiness (queue, email, FTS5) | PHASE 12 §10 | **E. Still genuinely unblocked** | Phase 12's health is shallow on purpose; the operator needs more signal |
| 14 | `/api/audit` operator surface (filters, date range, target filter) | PHASE 13 §25 | **E. Still genuinely unblocked** | Endpoint is user-scoped; no filters; pagination only by `createdAt` cursor |
| 15 | ProcessingJob visibility (UI or HTTP) | PHASE 13 §30 | **E. Still genuinely unblocked** | `getJobStats()` exists; no HTTP route exposes it |
| 16 | Soft-delete purge (TTL) | PHASE 13 §25, §31 | **D. Blocked by another decision** | Out of scope per brief; needs a retention policy that no phase has defined |
| 17 | `@@index([chunkId])` on `EvaluationEvidence` | PHASE 7 §32 | **F. No longer justified** | ≤10 chunks per case in the current data; the index was explicitly rejected as premature |
| 18 | Admin role (`User.role`) | PHASE 13 §31 (by absence) | **F. No longer justified by current evidence** | See §11 for the full argument; the operator surface does not need it |
| 19 | Operator/admin dashboard | PHASE 6 §20, PHASE 13 audit | **G. Candidate for Phase 14** | The strongest single evidence-based candidate |
| 20 | `?userId=` query on `/api/audit` | PHASE 13 §25 | **D. Blocked** | By design: no admin role, no cross-user read. Adding it requires an auth model change. |

### Items that are no longer justified

- **#17 (`EvaluationEvidence.chunkId` index):** PHASE 7 §4.1 rejected
  this on the explicit "≤10 chunks per case" cost/benefit; the data
  has not changed. Premature.
- **#18 (admin role):** See §11 Security Analysis. The brief keeps
  insisting on "no admin role." The operator surface the project
  needs can be built on the *owning user's* data, not on a
  cross-tenant admin role. The `/api/audit` route, the
  `ProcessingJob` table, and the FTS5 index are all already
  accessible to the right readers in the right shape — the missing
  piece is *wiring*, not *authorization*.

### Items that remain unblocked (5 → all are part of Candidate β)

- #12, #13, #14, #15, #19 are all aspects of the same single
  "operator surface" theme. Items #8–#11 (OCR coverage) are part of
  Candidate γ.

### Items filtered out (architecture-forbidden or blocked)

- #1, #3, #4, #5, #6, #7: not candidates.
- #2, #16, #20: blocked.

---

## 6. Evidence From Repository

This section lists the concrete, file-backed evidence that the
operator surface is the strongest next phase.

### 6.1 There is no operator-facing audit log UI

- `/api/audit` exists at `src/app/api/audit/route.ts` and returns
  `{ rows, nextCursor }`. The user has no page to call it from. The
  only way to read an audit row today is to know the endpoint exists
  and `curl` it.
- No file in `src/app/` (checked with `find -name "page.tsx" | xargs
  grep -l -i "audit"`) renders audit data. Confirmed: zero matches.
- A `User` has no `role` column (PHASE 13 explicitly notes "There is
  no admin role"). The data is there; the page is not.

### 6.2 There is no operator-facing processing-job UI

- `src/lib/document-processing/persistent-queue.ts` exports
  `getJobStats(): Promise<{ scheduled, running, completed, failed,
  cancelled, total }>`. Nothing in `src/app/` references
  `processingJob` (checked with `find -name "page.tsx" | xargs grep
  -l -i "processing"`: zero hits in `src/app/`).
- The only call site of `getJobStats` is `verify-phase13.mts` (a
  developer-only script). A user who has a document stuck in
  `SCHEDULED` for 30 minutes has no way to know.

### 6.3 The FTS5 rebuild path is CLI-only

- `scripts/rebuild-fts5.mts` is well-built: it drops the FTS5
  virtual table, re-reads every `DocumentChunk` in batches of 200,
  and exits 1 if `ftsCount() !== chunkCount` at the end.
- There is no HTTP route for it. The README says "Run `npx tsx
  scripts/rebuild-fts5.mts` (stop the dev server first)." The
  operator must (a) know the script exists, (b) stop the dev server,
  (c) run the script, (d) restart the dev server. None of this is
  documented for a non-developer operator.
- The only mention of "admin" in `src/` is a comment in
  `processing-queue.ts` ("useful for any future admin / monitoring
  surface") and in `persistent-queue.ts` ("for the admin / recovery
  view"). These comments explicitly anticipate the surface; Phase 13
  built the data but not the surface.

### 6.4 `/api/health` is shallow by design

- The route header comment says it explicitly: "minimal operator
  surface for 'is this process up and able to talk to its
  database?'" It returns `{ status, uptime, db: { ok, latencyMs,
  timedOut, error }, env: { nodeEnv } }`.
- It does not return queue depth, FTS5 drift, email service state,
  audit log size, or the number of `RUNNING` jobs that are past
  `lockedAt` (the stale-recovery indicator).

### 6.5 The `log` utility is intentionally a thin shim

- `src/lib/log.ts` is a thin wrapper over `console.*` with four
  levels and a secret-redaction pass. The file header says "Phase 18
  (observability / security) can swap the sink without re-plumbing
  every call site."
- Phase 6 §20 puts "Phase 18 — Observability/Security" (OpenTelemetry,
  Sentry, structured-logging sink) into the deferred list. Phase 18
  is forbidden by the current brief (external services). So the
  `log` shim stays a `console.*` wrapper; no change is proposed.

### 6.6 The audit log is already used

- 7 instrumentation sites:
  `actions/trade-cases.ts` (4), `actions/documents.ts` (3),
  `api/account/change-password/route.ts`, `api/auth/reset-password/route.ts`.
- 12 action constants: `TRADE_CASE_CREATED`, `TRADE_CASE_UPDATED`,
  `TRADE_CASE_DELETED`, `TRADE_CASE_RESTORED`, `DOCUMENT_CREATED`,
  `DOCUMENT_DELETED`, `DOCUMENT_RESTORED`, `PASSWORD_CHANGED`,
  `PASSWORD_RESET`, `DOCUMENT_PROCESSING_COMPLETED`,
  `DOCUMENT_PROCESSING_FAILED`, `STALE_JOB_RECOVERED`.
- The data is being written. The question is only how to read it
  without `curl`.

### 6.7 The user has no "activity" or "history" page

- The dashboard (`src/app/dashboard/page.tsx`) lists trade cases.
- `/dashboard/sessions` lists active sessions.
- `/dashboard/trash` lists soft-deleted items.
- `/account` lists name, email, password-last-changed.
- There is no `/dashboard/activity` or `/account/activity` page that
  would show "what happened to my account, in chronological order".
  This is the most obvious missing page from a UX standpoint.

### 6.8 The dev-search action still works for free

- `src/actions/dev-search.ts` already calls the advanced RAG
  pipeline. Phase 14 does not need to add a "search my own stuff"
  feature; it is there.

---

## 7. Candidate α — "UX & Operator Pages" (read-only on top of Phase 13)

The minimum useful operator surface, *without* introducing any new
schema or any new authorization model. Every change is in `src/app/`
and a tiny amount of glue in `src/lib/`.

**Scope (precise):**

1. **`/dashboard/activity` page** — a server component that calls
   `/api/audit` (or its underlying Prisma query) with `userId =
   current`, renders the rows in a table grouped by day, with action
   and target rendered as a badge and a deep-link to the target
   (e.g. clicking `TRADE_CASE_DELETED` for case `abc-123` jumps to
   `/cases/abc-123` if not soft-deleted, or to `/dashboard/trash`
   if it is). Pagination is the existing cursor pattern; the page
   shows a "Load more" button.

2. **`/api/audit` filter support** — add `?action=`, `?target=`,
   `?from=`, `?to=` query parameters, all scoped to the current user
   (no cross-user read; no `?userId=`). The route is already
   user-scoped; filters are additive.

3. **`/dashboard/queue` page (or a section on the existing
   dashboard)** — server component that calls `getJobStats()` and
   renders the counts. Optionally a "recent jobs" list with
   status, last error (if FAILED), started/finished timestamps. No
   actions — the user can already retry a failed document from the
   document detail page; this is just visibility.

4. **`/api/health` extended body** — add a `signals: { queue,
   fts, email, audit }` block. `queue` is the `getJobStats()` numbers
   and a stale-job count (rows in `RUNNING` with `lockedAt < now -
   PROCESSING_LOCK_TIMEOUT_MS`). `fts` is `{ ftsRowCount, chunkRowCount,
   drift }`. `email` is the dev-fallback flag (no SMTP probe; the
   dev fallback is the only mode in the current stack). `audit` is
   the current `auditLog.count()`. The `status` field stays "ok" if
   all signals are healthy and "degraded" if any are off; the HTTP
   status stays 200/503.

5. **`/api/admin/fts5/rebuild` HTTP route (operator-gated)** —
   **Important: this introduces the word "admin" in a route
   path.** The route is gated on the same `getCurrentUserId()` that
   the rest of the app uses, *not* on a role. The auth model is:
   "any authenticated user can trigger an FTS5 rebuild of *their
   own* data" — which the route accomplishes by iterating
   `DocumentChunk` rows scoped to that user's `TradeCase`s. This
   is a deliberate departure from the "no admin" rule because the
   *operation* is inherently per-user (an FTS5 rebuild is a global
   table-level operation, so the route must either (a) require an
   operator role, or (b) rebuild per-user and join on the next
   search). Option (b) is what is proposed here. **Risk: this
   adds a small amount of complexity to the FTS5 path. See §11
   Security Analysis for the full argument.**

**Files likely affected:** 4 new pages, 1 modified route, 1 modified
helper, 1 new small lib module. ~7 files.

**Schema impact:** zero. No new tables, no new columns, no migration.

**Dependency impact:** zero. No new packages.

**Security impact:** All routes are user-scoped via
`getCurrentUserId()`. No `?userId=`. No cross-user read. The
"rebuild my FTS5 rows" route is the only non-read operation, and
it is scoped to the calling user's `TradeCase`s via the existing
`requireOwnedTradeCase` chain.

**Architecture impact:** None. Additive only.

**Implementation complexity:** Small. The hardest piece is
rebuilding FTS5 per-user (the global table is the wrong unit of
recovery; the chunk-ownership chain is the right one).

**Testing complexity:** Moderate. 12-section `verify-phase14.mts`
covering: page renders, filter works, queue stats visible, health
signals present, FTS5 rebuild is per-user, security regression
(cross-user isolation on every new route).

**Risks:**
- The FTS5 rebuild-per-user design is a small design departure
  from the global CLI script. It must be verified that
  per-user rebuild is semantically equivalent (i.e. the global
  `ftsCount() === chunkCount` invariant still holds after a
  per-user rebuild).
- The activity page must not leak `metadata` that contains
  secrets. Phase 13's `scrubMetadata` already handles this; the
  page must render `metadata` as a pre-formatted JSON block, not
  execute it.

**Blocks later phases:** No. Every future phase can be added on
top.

---

## 8. Candidate β — "Operator & Observability Surface" (the recommendation)

The same as Candidate α, *plus* the operator-only "manage FTS5
globally, manage audit retention, see all in-flight jobs across the
system" surface that a single-instance dev target's *operator*
(developer) actually needs. This is the original "Candidate β" from
the prior audit (PHASE13-AUDIT.md §E).

**Scope (precise):**

- All of Candidate α (1–4).
- **5.** `GET /api/admin/queue` — returns `getJobStats()` and the
  most recent N `ProcessingJob` rows (default 20, max 100). Gated
  on a **new** `User.role` field set to `"admin"` for one user (the
  seed user `demo@tradeready.ai`).
- **6.** `POST /api/admin/fts5/rebuild` — re-runs the global FTS5
  rebuild. The route enforces the `User.role === "admin"` check
  server-side; if not admin, returns 403.
- **7.** `GET /api/admin/audit` — returns all `AuditLog` rows across
  all users, paginated, filterable. Same role gate.
- **8.** `GET /api/admin/audit/stats` — returns a small summary
  (counts by action, counts by target, last 24h vs last 7d vs all-time).

**Why this is the original "β" and *not* the recommended Phase 14:**

- It introduces `User.role`, which the brief has consistently
  forbidden. PHASE 13 §31: "no admin role" is the same rule
  expressed in three phases. The 8-item surface in §E of
  PHASE13-AUDIT.md is what an *operator* would build if the
  project were a multi-tenant SaaS; TradeReady AI is documented as
  a single-tenant dev target with the seed user as the only
  operator. **The operator is the developer.**
- For a single-tenant dev target, the operator does not need a
  role; the operator is *already authenticated as the seed user*
  and can read `/api/audit` directly. The missing piece is a
  *page*, not an *authorization bypass*.
- The cross-user audit read is a real concern (the seed user
  should not be able to see other users' audit rows in
  production), but the multi-user test surface only ever has
  test users whose rows the cleanup script removes. A
  single-tenant dev target does not need a cross-user view.

**Files likely affected:** Same as α, plus 4 new admin routes, 1
new `User.role` migration, 1 new `requireAdmin` helper.

**Schema impact:** 1 new column (`User.role String @default("user")`),
1 new migration.

**Dependency impact:** zero.

**Security impact:** Moderate. Every new admin route must
enforce `User.role === "admin"` server-side. Any client-side
gating is a regression. The `requireAdmin` helper must be the
only authorized caller.

**Architecture impact:** Adds a role concept that the brief
repeatedly rejected.

**Implementation complexity:** Medium. Same as α, plus the
admin helper, the new routes, and the migration.

**Testing complexity:** Higher. 12-section `verify-phase14.mts`
plus an extra "admin gate" section proving non-admin users get
403 on every new admin route.

**Risks:** Same as α, plus the role-adding risk: once
`User.role` exists, every future phase is tempted to use it
("just for this one feature"). The audit log + the
`getJobStats()` data must stay accessible *without* the role,
to keep the per-user surface usable.

**Blocks later phases:** Yes — the role concept expands
silently, which is why α is the recommendation.

---

## 9. Candidate γ — "OCR Coverage & RAG Hardening"

Phase 10/11 push to the next accuracy plateau.

**Scope:**

- `Xenova/trocr-small-handwritten` opt-in via `OCR_MODE=handwritten|auto|printed`.
- `Xenova/trocr-base-printed` opt-in via existing `OCR_MODEL` env.
- PDF rasterize + OCR fallback: when `PdfProcessor` returns
  `extractedText: null`, rasterize the first N pages with the
  already-installed `pdfjs-dist` (prod dep, version 6.2.108), OCR
  each page, concatenate text. The current `extractedText: null`
  honest behavior becomes "extractedText is the OCR'd text".
- Reranker model swap via `RERANKER_MODEL` env (already supported
  in the Phase 11 cross-encoder wrapper).

**Files likely affected:** `src/lib/document-processing/ocr-processor.ts`,
`src/lib/document-processing/pdf-processor.ts`, `src/lib/rag/reranker.ts`.
~3 files.

**Schema impact:** zero.

**Dependency impact:** zero. (`pdfjs-dist` is already a prod dep.)

**Security impact:** zero. Pure accuracy work.

**Architecture impact:** zero. Additive.

**Implementation complexity:** Medium. The PDF rasterizer path is
the largest single piece; the rest is a model swap.

**Testing complexity:** Moderate. Need a real image-only PDF
fixture; need a handwriting fixture (or a synthetic one); need
to re-run the Phase 10/11 verify scripts.

**Risks:**

- Model-download cost (~100MB for `trocr-base-printed`,
  ~50MB for `trocr-small-handwritten`). The brief's
  "single-instance dev target" is fine with this; operators who
  want to keep the disk footprint small can leave the env vars
  unset.
- The PDF rasterizer is a known source of "works on my machine"
  bugs (font resolution, headless rendering). The Phase 10
  test harness already uses `@napi-rs/canvas` for image fixtures;
  the rasterizer path needs its own fixture and a per-page
  assertion.
- Result ordering can change when the cross-encoder model is
  swapped. The Phase 11 verify script's relative-order
  assertions would need to be re-baselined.

**Blocks later phases:** No. The OCR coverage work is
self-contained.

**Why this is *not* the recommendation:** OCR coverage is a
quality improvement, not an operator-need. The current
"good enough" OCR (English-only, single-block, image-only PDFs
return `extractedText: null`) is documented honest behavior. A
user complaint about handwriting or a scanned PDF is a feature
request, not a stability or data-safety issue. The operator
surface (β) is needed *today*; the OCR coverage (γ) is needed
*someday*.

---

## 10. Candidate Comparison

| Dimension | α (UX & Operator Pages) | β (Operator Surface + Admin) | γ (OCR Coverage) |
| --- | --- | --- | --- |
| **Files affected** | ~7 | ~12 | ~3 |
| **Schema impact** | 0 | 1 column + 1 migration | 0 |
| **Dependency impact** | 0 | 0 | 0 |
| **Security impact** | Low (user-scoped reads) | Moderate (new auth boundary) | 0 |
| **Architecture impact** | None | Adds `User.role` | None |
| **Implementation complexity** | Small | Medium | Medium |
| **Testing complexity** | Moderate | Higher (admin gate tests) | Moderate |
| **Risks** | FTS5 rebuild-per-user design | Role-creep temptation | Model-download size; rasterizer stability |
| **User/operator value** | High (activity page, queue visibility, health signals) | Higher (adds cross-user operator view) | Medium (accuracy improvement) |
| **Blocks later phases** | No | Yes (role expansion) | No |
| **Architecture compliance** | Full | Bends "no admin" rule | Full |
| **Reuses Phase 13 data** | Yes (audit, jobs, soft-delete) | Yes | Marginal |
| **Fixes a deferred item** | #12, #13, #14, #15, #19 | #12, #13, #14, #15, #19 | #8, #9, #10, #11 |
| **New external service** | No | No | No |
| **Net recommendation rank** | **1st** | 2nd | 3rd |

---

## 11. Security Analysis

### 11.1 Does the operator surface require an admin role?

**No, not for the current single-tenant dev target.**

The "operator" of TradeReady AI is documented (PHASE 6 §20, PHASE
13 §31) as the developer running `npm run dev` against a local
SQLite file. The operator's user account is the seed user
`demo@tradeready.ai`. The operator's data is *the only* data.

For this model:

- **Audit log** — the operator's audit log is `where: { userId: current }`.
  Reading it is already gated on `getCurrentUserId()`. The Phase
  14 audit-page proposal reuses that same gate.
- **ProcessingJob** — the operator's `getJobStats()` returns the
  whole table, but in a single-tenant target *the whole table is
  the operator's data*. The risk of "user A sees user B's
  jobs" is a multi-tenant concern; in this target there is no
  user B whose data is not also user A's data.
- **FTS5** — the FTS5 virtual table is global, not per-user.
  The Phase 14 proposal rebuilds *per-user* chunks so that the
  global invariant `ftsCount() === chunkCount` is preserved.
  No cross-user leak is possible because the rebuild reads only
  the calling user's `DocumentChunk` rows (via the
  `requireOwnedTradeCase` chain).
- **Health** — `/api/health` is unauthenticated by design
  (PHASE 12 §10). It is the liveness probe; it returns no
  per-user data. The Phase 14 health-signals extension adds
  *aggregate* numbers (job counts, FTS5 row count) and no
  per-user information.

**Conclusion:** for the current target, the existing
`getCurrentUserId()` gate is sufficient. Adding a `User.role`
column is a *future* requirement when the target becomes
multi-tenant; that is out of scope for the current single-tenant
dev target and the brief explicitly forbids it.

### 11.2 What if the target becomes multi-tenant later?

The current proposal does not block a future role introduction.
The pages and routes built in Phase 14 can be re-gated on
`User.role` later with no schema change to the audit log or
processing-job tables — only the `User` model needs the role
column. This is a strictly additive change. **Therefore, building
α now and β later is strictly better than building β now and
adding the user-facing pages later** — because α's pages do not
need to be retro-fitted, while β's admin routes would be
retro-fitted (and the gate would have to be re-verified).

### 11.3 What about "log out other devices"?

Still blocked (item #2 in §5). JWT sessions are not individually
revocable. The Phase 14 proposal does not touch this.

### 11.4 What about cross-user audit leak?

Phase 13 already proved (verify-phase13.mts §8, _live_e2e_phase13.mts
§10) that user A cannot see user B's audit rows. The Phase 14
audit-page proposal reuses that same `where: { userId: current }`
clause. The Phase 14 `/api/audit` filter additions (`?action=`,
`?target=`, `?from=`, `?to=`) are *and-ed* with the existing
`userId = current` clause. Verified by construction.

### 11.5 What about the FTS5 rebuild-per-user design?

The global `fts5` table is keyed on the chunk's `rowid`, not on
the chunk's owner. A per-user rebuild of the global table is
just "delete the rows that belong to the user's chunks, then
re-insert". This is exactly the same SQL the global CLI script
runs, scoped to one user's `DocumentChunk` rows.

The only risk is a *partial* rebuild leaving the global table
inconsistent. Mitigation: after the per-user rebuild, the route
asserts the global invariant still holds. If it does not, the
route returns 500 and the operator is told to run the global
CLI script. This is the same safety net the global script
already provides.

### 11.6 Audit metadata leak

The audit log's `metadata` column is a JSON string. Phase 13's
`scrubMetadata` redacts the secret allowlist. The Phase 14
audit-page renders metadata as a `<pre>{JSON.stringify(meta,
null, 2)}</pre>` block — no `dangerouslySetInnerHTML`, no
string concatenation, no execution. Same approach as the
existing `/dashboard/sessions` page renders user-agent strings.

---

## 12. Architecture Compliance

All three candidates are compatible with the architecture rules.
None of them requires any of the forbidden replacements.

| Rule | α | β | γ |
| --- | - | - | - |
| No Redis / BullMQ / Kafka / Elasticsearch | ✓ | ✓ | ✓ |
| No Pinecone / Weaviate / Qdrant / Supabase / Firebase | ✓ | ✓ | ✓ |
| No Clerk / Auth0 / second auth | ✓ | ✓ | ✓ |
| No second ORM / second DB | ✓ | ✓ | ✓ |
| No LangGraph | ✓ | ✓ | ✓ |
| No real ClamAV | ✓ | ✓ | ✓ |
| No unnecessary NextAuth upgrade | ✓ | ✓ | ✓ |
| No new external service | ✓ | ✓ | ✓ |
| No `prisma migrate reset` (additive only) | ✓ | ✓ | ✓ |
| Existing stack preserved (Next.js 16, Prisma 5 + SQLite, NextAuth v5 beta 32, `@xenova/transformers`, Phase 6 `log`, Phase 9 queue, Phase 10 OCR, Phase 11 RAG, Phase 13 AuditLog + ProcessingJob + soft-delete) | ✓ | ✓ | ✓ |
| **No new admin role** | ✓ | **✗** | ✓ |
| **No new dependency** | ✓ | ✓ | ✓ |

α is the cleanest fit for the brief's "no new external service"
and "no new admin" rules.

---

## 13. Schema / Migration Impact

- **α:** zero. No new tables, no new columns, no new indexes, no
  new migration. Every change is in `src/app/` (pages) and a
  small amount of glue in `src/lib/` (one new query helper for
  the activity page; the rest is reusing Phase 13's
  `recordAuditEvent` and `getJobStats`).
- **β:** 1 new column (`User.role`), 1 new migration. The
  migration is additive (default `"user"` for every existing
  user; the seed user is updated to `"admin"`).
- **γ:** zero.

---

## 14. Dependency Impact

- **α:** zero.
- **β:** zero.
- **γ:** zero. `pdfjs-dist` is already a prod dependency
  (version 6.2.108). The model downloads are lazy, on first use,
  same as the current OCR.

---

## 15. Performance Impact

- **α:** One new page (`/dashboard/activity`) and one extended
  `/api/audit` route. The page is a server component, so it
  runs on the server and streams HTML. The audit query is
  indexed on `(userId, createdAt)` (Phase 13 already added
  that index). The activity page renders at most `limit + 1`
  rows; the "Load more" button fetches the next page via the
  existing cursor pattern. No measurable performance impact.
- **β:** Same as α, plus 4 new admin routes. None are
  user-facing (no client pages); all are operator-only.
  Performance impact is bounded by the same indexes.
- **γ:** The PDF rasterize+OCR fallback adds latency to
  document processing for image-only PDFs. Currently these
  PDFs return `extractedText: null` immediately (fast path).
  The new path rasterizes + OCRs each page, which can be 5–10s
  per page on CPU. This is a *user-visible* performance change
  for a specific document class. Mitigation: opt-in via
  `PDF_RASTERIZE_OCR=1` env (default off).

---

## 16. Testing Impact

- **α:** A new `scripts/verify-phase14.mts` with ~12 sections
  (mirror the Phase 12/13 pattern). Sections: schema/import
  smoke; activity page renders; audit filters work (action,
  target, from, to); cursor pagination; cross-user isolation;
  queue page renders; health signals present; FTS5 rebuild
  per-user; FTS5 rebuild global invariant; static checks
  (tsc, migrate status, build). ~12 sections, ~40–50
  assertions.
- **β:** Same as α, plus an "admin gate" section proving
  non-admin users get 403 on every new admin route.
- **γ:** A new `scripts/verify-phase14.mts` covering the
  rasterize path (image-only PDF → OCR'd text), the
  handwriting model swap (one synthetic fixture), the
  cross-encoder model swap (re-baselined relative-order
  assertion), and the prior Phase 10/11 regressions.

---

## 17. Risk Analysis

### α risks

- **FTS5 rebuild-per-user design** — the global table's invariant
  must be preserved. Mitigation: post-rebuild assertion
  (`ftsCount() === chunkCount`). Same safety net as the
  global CLI script.
- **Audit metadata secret leak in the page render** — Phase 13's
  `scrubMetadata` already handles this. The page renders
  metadata as a `<pre>{JSON.stringify(...)}</pre>` block. No
  HTML execution.
- **Activity page performance with many rows** — pagination is
  cursor-based and indexed. Same pattern as `/api/audit`.

### β risks

- **Role-creep** — once `User.role` exists, every future phase
  is tempted to add an "admin" check. Mitigation: the
  `requireAdmin` helper is the only authorized caller; the
  audit log + processing-job reads stay user-scoped. The
  Phase 14 verify script must assert this in every section.
- **Cross-user audit leak in the admin route** — the
  `/api/admin/audit` route returns all users' rows. The
  security regression section must prove it only returns
  rows to a `User.role === "admin"` caller.
- **FTS5 admin rebuild is a global table operation** — the
  route must hold a short DB lock; concurrent rebuilds must
  be rejected with 409. The SQLite `BEGIN IMMEDIATE`
  transaction is sufficient.

### γ risks

- **Model download cost** — ~100MB for `trocr-base-printed`,
  ~50MB for `trocr-small-handwritten`. Both are opt-in via
  env. The current default stays `trocr-small-printed`.
- **PDF rasterizer stability** — font resolution and headless
  rendering are known failure modes. Mitigation: a real
  image-only PDF fixture in the verify script; a
  per-page text-length assertion.
- **Cross-encoder result re-ordering** — the Phase 11 verify
  script's relative-order assertions may need to be
  re-baselined. Acceptable; the script is the contract.

---

## 18. Recommended Phase 14

**Candidate α — "UX & Operator Pages."** A small, additive,
zero-schema, zero-dependency, zero-admin-role change that turns
the data Phase 13 produced into something the operator (and a
debugging developer) can actually see.

**Rationale (one sentence each):**

- **α is the strongest next step because Phase 13 finished the
  data side; Phase 14 finishes the *visibility* side.**
- **β is rejected** because it adds a `User.role` that the
  brief has consistently forbidden, and the operator surface
  β proposes does not need a role in the current
  single-tenant dev target.
- **γ is rejected** because it is a quality/accuracy
  improvement, not an operator-need. The current OCR is
  "good enough" for the documented use case.

**Why α is the smallest additive change:**

- 0 schema changes
- 0 new dependencies
- 0 new auth boundaries
- 0 new migrations
- 4 new pages, 1 modified route, 1 new small lib module
- 12-section verify script mirroring the prior phases

---

## 19. Exact Proposed Scope (if α is approved)

### Step 1 — `/dashboard/activity` page

- `src/app/dashboard/activity/page.tsx` (new)
- `src/components/dashboard/ActivityFeed.tsx` (new) — a server
  component that queries `prisma.auditLog.findMany` with
  `where: { userId: current }` and renders the rows in a table.
- Pagination via cursor (same pattern as `/api/audit`).
- Each row has a "view target" link that jumps to
  `/cases/{targetId}` for `TradeCase` targets, to
  `/cases/{tradeCaseId}/documents/{targetId}` for `Document`
  targets, etc.

### Step 2 — `/api/audit` filter support

- Add `?action=`, `?target=`, `?from=`, `?to=` to the existing
  route in `src/app/api/audit/route.ts`.
- All filters are *and-ed* with the existing
  `where.userId = current`. No `?userId=` is added.
- Existing cursor pagination is unchanged.

### Step 3 — `/dashboard/queue` section

- A section on the existing `/dashboard` page (or a new
  `/dashboard/queue` page — preference for the new page to
  keep the dashboard clean).
- Server component that calls `getJobStats()` and renders the
  counts in a small card.
- "Recent jobs" table: the 20 most recent `ProcessingJob` rows
  for the current user, joined to `Document.name` and
  `TradeCase.id` for deep-linking.

### Step 4 — `/api/health` extended signals

- `src/app/api/health/route.ts` is extended to return
  `signals: { queue: { scheduled, running, completed, failed,
  cancelled, total, stale }, fts: { ftsRowCount, chunkRowCount,
  drift }, email: { mode }, audit: { count } }`.
- The `status` field is "ok" if all signals are healthy and
  "degraded" if any are off. HTTP status stays 200/503.
- The signal-collection logic is bounded to ~1s total. A
  signal that takes longer than 500ms is marked
  `{ ok: false, timedOut: true }`.

### Step 5 — `POST /api/audit/fts5/rebuild` route (per-user)

- New route at `src/app/api/audit/fts5/rebuild/route.ts`.
- Reads the calling user's `DocumentChunk` rows (via the
  `requireOwnedTradeCase` chain), deletes the corresponding
  FTS5 rows, and re-inserts them in batches of 200.
- After the rebuild, asserts the global invariant
  `ftsCount() === chunkCount`; returns 500 if not.
- The route is gated on `getCurrentUserId()` — no role check.
- The route is rate-limited to 1 call per user per 5 minutes
  (the existing Phase 8 rate-limit helper, `audit` bucket).

### Step 6 — `scripts/verify-phase14.mts` (12 sections)

- Section 1: schema/import smoke (the new pages and the new
  route import without error).
- Section 2: activity page renders and contains the expected
  rows.
- Section 3: `/api/audit` filters (action, target, from, to)
  work and are user-scoped.
- Section 4: cursor pagination still works.
- Section 5: cross-user isolation on the activity page
  (user A sees only A's rows; user B sees only B's rows).
- Section 6: queue page renders with the right counts and
  recent jobs.
- Section 7: health endpoint returns the new signals; the
  signal values are sensible (queue.total > 0 if there are
  recent jobs; fts.drift === 0 on a healthy DB).
- Section 8: FTS5 rebuild route works per-user; the global
  invariant holds after a rebuild; the rate-limit kicks in
  on the second call within 5 minutes.
- Section 9: FTS5 rebuild does not leak other users' chunks
  (user A's rebuild does not affect user B's FTS5 rows).
- Section 10: prior-phase regressions (verify-phase7, 9, 11,
  12, 13) all pass.
- Section 11: static — `tsc --noEmit` exits 0; `npm run build`
  exits 0; `prisma migrate status` reports up to date.
- Section 12: live HTTP smoke (a small `_live_e2e_phase14.mts`
  companion that signs in and hits the new routes over the
  wire).

### Step 7 — `PHASE14-FINAL-REPORT.md` (33 sections)

- The same 33-section shape as `PHASE13-FINAL-REPORT.md`.
- Sections 1–6 mirror this audit.
- Section 7 onwards is the implementation log.

---

## 20. Explicitly Out-of-Scope Items

The following are explicitly NOT Phase 14. Each is annotated with
the reason.

- **Real ClamAV** — architecture-forbidden. (PHASE 9 §29, PHASE 10 §30.)
- **NextAuth v5 stable upgrade** — architecture-forbidden. (PHASE 8 §32, all later phases.)
- **LangGraph workflow** — architecture-forbidden. (PHASE 6 §20.)
- **OTel / Sentry / structured-logging sink** — architecture-forbidden. (PHASE 6 §20, PHASE 12 §30, PHASE 13 §31.)
- **Rate-limit backed by Redis** — architecture-forbidden. (PHASE 6 §20.)
- **"Log out other devices" UI** — blocked on DB-session table decision. (PHASE 8 §32, PHASE 12 §30.)
- **Soft-delete purge / TTL** — out of scope per brief; no retention policy is defined. (PHASE 13 §31.)
- **`User.role` / admin role** — forbidden in the current single-tenant dev target. (PHASE 13 §31.)
- **`?userId=` query on `/api/audit`** — by design. (PHASE 13 §25.)
- **Bulk key rotation** — out of scope. (PHASE 8 §32.)
- **Handwriting / multi-language / PDF-rasterize OCR** — Phase γ candidate, deferred to a later phase.
- **MFA / password history** — out of scope. (PHASE 8 §32.)
- **Real email templates beyond the existing 4 (verify, reset, changed, processing-failed)** — out of scope.
- **In-app PDF rendering** — out of scope. (PHASE 6 §19.)
- **Bulk document actions** — out of scope. (PHASE 6 §19.)
- **Real Google OAuth / Facebook OAuth** — out of scope; no credentials configured. (PHASE 6 §19.)
- **Distributed multi-instance queue** — out of scope. (PHASE 9 §30, PHASE 13 §31.)
- **New dependencies in `package.json`** — none. The audit requires
  this and the implementation must preserve it.

---

## 21. Dependencies / Prerequisites

The Phase 14 implementation requires:

- **Phase 13 closed** — ✅ verified live today.
- **Dev server restartable** — ✅ confirmed (port 3000 was free; the
  `predev` `prisma generate` hook is in place).
- **`prisma generate` working** — ✅ confirmed (no Prisma binary
  lock; the latest client is in `node_modules/.prisma/client`).
- **No new dependencies** — ✅ package.json is frozen for this
  phase.
- **`scripts/verify-phase13.mts` passing** — ✅ 46/46.
- **`scripts/_live_e2e_phase13.mts` passing** — ✅ 32/0/0.

**No external services are required.** No new env vars are required
(only an opt-in `PDF_RASTERIZE_OCR=1` if γ is chosen — not the
recommendation).

---

## 22. Acceptance Criteria

Phase 14 is COMPLETE only when:

1. All 7 implementation steps land and are individually tested.
2. `scripts/verify-phase14.mts` reports 0 failures (12 sections,
   ~40–50 assertions).
3. `scripts/_live_e2e_phase14.mts` (new companion) reports 0
   failures (the new routes exercised over the wire).
4. `npx tsc --noEmit` exits 0.
5. `npm run build` exits 0.
6. `npx prisma migrate status` shows "Database schema is up to
   date!" (no new migration; the column count is unchanged).
7. All prior `verify-phase{3,7,9,10,11,12,13}.mts` scripts
   that are not cookies-required still pass.
8. The Phase 14 security regression section proves cross-user
   isolation on every new page and every new route.
9. The Phase 14 live E2E proves the activity page is reachable
   from `/dashboard`, the queue section is reachable, the
   health endpoint returns the new signals, and the FTS5
   rebuild route works per-user.
10. `PHASE14-FINAL-REPORT.md` (33 sections) is written and
    includes the regression matrix, the deferred-items delta,
    and the final verdict.

---

## 23. Verification Strategy

- **Unit tests** for every new helper (the activity-page query
  builder, the audit-filter parser, the health-signals
  collector, the FTS5 per-user rebuild).
- **Integration tests** in `scripts/verify-phase14.mts` mirroring
  the 12-section pattern.
- **Live HTTP tests** in `scripts/_live_e2e_phase14.mts`
  mirroring the 11-section pattern.
- **Cross-user isolation** — every new page and every new route
  is tested with two users; the second user cannot see the
  first's data.
- **Static checks** — `tsc`, `build`, `migrate status`.
- **Regression** — every prior `verify-phase*.mts` that does
  not require browser cookies is re-run.

---

## 24. Regression Strategy

| Script | Expected result after Phase 14 |
| --- | --- |
| `verify-phase3.ts` | PASS (unchanged) |
| `verify-phase7.mts` | PASS (no schema change) |
| `verify-phase9.mts` | PASS (queue unchanged) |
| `verify-phase10.mts` | PASS (OCR unchanged) |
| `verify-phase11.mts` | PASS (RAG unchanged) |
| `verify-phase12.mts` | PASS (no env change) |
| `verify-phase13.mts` | PASS (no schema change) |
| `verify-phase14.mts` | NEW — 12 sections, ~40–50 assertions |
| `_live_e2e_phase14.mts` | NEW — 11 sections over HTTP |
| `tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `prisma migrate status` | "Database schema is up to date!" (11 migrations unchanged) |

---

## 25. Live E2E Strategy

`scripts/_live_e2e_phase14.mts` will:

1. Sign in with the seed user.
2. Hit `/api/health` and assert the new `signals` block is
   present and well-shaped.
3. Visit `/dashboard/activity` and assert the page contains the
   audit rows from the verify-phase13 run + the verify-phase14
   run.
4. Hit `/api/audit?action=TRADE_CASE_DELETED` and assert the
   response is filtered to that action.
5. Visit `/dashboard/queue` and assert the recent-jobs table is
   rendered.
6. Sign in as a second user; hit every new page and every new
   route; assert cross-user isolation.
7. Trigger a per-user FTS5 rebuild; assert the global
   `ftsCount() === chunkCount` invariant holds.
8. Static checks: `tsc`, `build`, `migrate status`.

The script is self-cleaning: it does not leave any test
artifacts behind.

---

## 26. Rollback Considerations

- **Schema:** none changed. Rollback is "delete the new files
  and revert the modified ones." `git diff` shows the diff.
- **Runtime:** the new routes and pages are additive. Removing
  them does not break any existing code path. The
  `scripts/verify-phase*.mts` regressions do not depend on
  the new pages.
- **Data:** no new tables, no new columns, no new rows. The
  audit log and processing-job tables are unchanged in
  *schema* (data is unchanged because the new pages only
  read).
- **Dependencies:** no new packages. `package.json` is
  unchanged.

**Rollback is a `git checkout` of the 7 affected files.** No
migration to revert, no data to restore, no cache to flush.

---

## 27. Future Phase Implications

- **Phase 15 (β — admin/operator surface):** if the target ever
  becomes multi-tenant, the β scope becomes justified. The
  Phase 14 pages are *user-scoped* and re-gate-able on
  `User.role` later with no UI change. The α build is the
  right foundation for β.
- **Phase 16 (γ — OCR coverage):** independent of α. The OCR
  improvements (handwriting, multi-language, PDF rasterize)
  are self-contained and do not depend on α or β.
- **Phase 17 (DB sessions + "log out other devices"):**
  independent of α. Requires an architecture decision (DB
  session table) that the brief has not yet approved.
- **Phase 18 (Observability — OTel, Sentry, structured-logging
  sink):** architecture-forbidden. Re-evaluated only if the
  brief changes.

α is the right next step because it leaves all four future
phases unblocked.

---

## 28. Final Decision

**Phase 14 = Candidate α — "UX & Operator Pages."**

The recommendation is supported by:

1. The strongest single evidence: every deferred item
   (#12, #13, #14, #15, #19) in §5 that is unblocked and not
   architecture-forbidden is part of α. β and γ leave items
   on the table.
2. The cleanest architecture fit: 0 schema, 0 dependencies,
   0 new auth boundaries, 0 admin role.
3. The strongest re-use of Phase 13: every new page reads
   from the `AuditLog` and `ProcessingJob` tables Phase 13
   built. The data was the *hard* part; the visibility is
   the *easy* part.
4. The smallest blast radius: 7 files, 0 migrations, 0 data
   changes, no new env vars, no new dependencies.
5. The right order: α → β → γ. α builds the visibility that
   makes β's admin decisions grounded in real data. γ is a
   quality improvement that does not depend on either.

---

## 29. Implementation Readiness

**Ready.** The implementation can begin immediately on
operator approval of this audit.

- No blockers.
- No open questions for the operator.
- No external service to provision.
- No credential to obtain.
- No model to download.
- No new env var to set.
- No migration to author.

The only prerequisite is the operator's approval of the scope
in §19. On approval, the implementation will follow the 7
steps in §19 in order, with a live E2E after each step and a
final live E2E at the end (per the brief's mandatory
live-verification rule).

---

## 30. Final Audit Verdict

- **Phase 13 status:** CLOSED and re-verified live today.
- **Genuine remaining candidates:** 3 (α, β, γ).
- **Recommended Phase 14:** α — UX & Operator Pages.
- **Why:** smallest additive change, strongest re-use of
  Phase 13, cleanest architecture fit, no new auth boundary,
  no new dependency, no migration, leaves β and γ unblocked.
- **Implementation readiness:** Ready.
- **Blocker:** None.
- **Next action:** operator approval of this audit. On
  approval, the implementation agent will execute the 7
  steps in §19 in order, with live E2E after each step, and
  produce `PHASE14-FINAL-REPORT.md` (33 sections) at the end.

---

## End of audit.
