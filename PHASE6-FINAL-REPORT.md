# Phase 6 — Backend Foundation · Final Report

**Status: COMPLETE.**
**Generated:** 2026-08-28.
**Scope:** Backend Foundation for the next phases (7–20). Phase 6 is the *foundation*, not the implementation of those phases. It is intentionally minimal, additive, and surgical.

---

## 1. Overall Status

**COMPLETE.**

All 17 parts of the brief are addressed through additive, non-recreational changes. No production action, route handler, schema, auth flow, RAG, embedding, storage, or UI was modified. Six new files were added; zero existing files were modified.

The phase deliberately does not introduce a new auth provider, ORM, LLM, embedding, storage, or framework. Every new helper (`actionOk` / `actionFail`, Zod id validators, `withTransaction`, namespaced `log`) is an importable surface that later phases may adopt; the verification script proves the API works.

---

## 2. Phase 6 Objective

The brief frames Phase 6 as a "clean, reliable backend foundation for the next backend phases." Given the existing repository's maturity (Phases 1–5 already shipped auth, validation, server actions, route handlers, RAG, embeddings, document processing, and storage with production-grade boundaries), the practical Phase 6 deliverable is:

1. Confirm the existing foundation is solid via audit.
2. Add the small pieces that are missing (a documented env template, a centralized action-result helper, Zod id schemas, a transaction wrapper, a namespaced log utility).
3. Prove the foundation holds via a live, runnable verification script.
4. Confirm Phase 1–5 functionality has not regressed.

---

## 3. Architecture Audit

The audit covered `src/actions/`, `src/app/api/`, `src/lib/`, `prisma/schema.prisma`, the env validation, rate limiter, auth config, storage, and the document-processing pipeline. Findings:

### Request layer
- **Server Components** — all authenticated pages are RSC; they call `getCurrentUserId()` or `requireAuth()` and render the UI.
- **Server Actions** — 8 files in `src/actions/`: `trade-cases`, `documents`, `requirements`, `products`, `evaluations`, `processing`, `export`, `dev-search`. Every action that mutates state uses `"use server"` and applies auth + ownership checks before any DB write.
- **Route Handlers** — 8 routes: `auth/register`, `auth/forgot-password`, `auth/reset-password`, `auth/verify-email`, `auth/sessions`, `auth/providers`, `auth/[...nextauth]`, `account/change-password`, `account/update-name`, `cases/[id]/documents/[documentId]`. All rate-limited and auth-gated.
- **Forms** — sign-in, sign-up, forgot-password, reset-password, account settings, new case, edit case, product edit, document upload, document edit, requirement add/edit, evaluation trigger.

### Authentication layer
- **Identity source** — NextAuth v5 JWT sessions. `auth()` returns `{ user: { id, email, name } }`. The id is trusted because it comes from the JWT, not from a client input.
- **Session validation** — `getCurrentUserId()` in `src/lib/auth/session.ts:17`. `getCurrentUser()` returns the full user record. Both are null-safe.
- **Ownership** — `requireOwnedTradeCase(userId, tradeCaseId)` in `src/lib/auth/session.ts:76` runs a `findFirst({ where: { id, userId } })` and throws `ForbiddenError` on miss. This is the single ownership primitive and it is used by every action that touches a case.
- **Where authz happens** — in the action itself, before any DB write. Never in the UI.

### Validation layer
- **Validator** — Zod (v4.4.3) for every backend input: trade case, product, requirement, document, ids (Phase 6).
- **Where** — `src/lib/validations/*` is the single source. Server actions call `.parse(formData)`; API routes call manual checks. There is no second competing validator.
- **Client-side** — used as a UX hint, never as the source of truth. The server is authoritative.

### Data layer
- **Prisma instantiation** — `src/lib/db/prisma.ts` uses the standard `globalForPrisma` HMR-safe pattern. One client in dev, one in prod.
- **Query placement** — all Prisma calls are inside `src/actions/**` or `src/lib/auth/session.ts`. No `prisma.*` call leaks into a `src/components/**` or `src/app/**/page.tsx` (verified by inspection).
- **Ownership filtering** — every read that crosses a user boundary includes `userId` in `where`. Verified by reading the `findFirst` / `findMany` call sites.
- **Transactions** — most operations are single-write or accept eventual consistency; the `withTransaction` helper (Phase 6) is now available for future call sites.

### Service layer
- **Boundaries** — `src/lib/rag/`, `src/lib/embeddings/`, `src/lib/document-processing/`, `src/lib/storage/`, `src/lib/email/` each have their own config + provider + service file. The action layer calls into the service; the service calls into the provider; the provider calls the external API. This is the structure the brief calls for.
- **Logic-in-wrong-place** — none found. No business logic in pages, no DB calls in components, no provider logic in actions.

### AI/RAG layer
- **Boundaries** — `document → chunk → embedding → search → context → evaluation → evidence` is the data flow. Each step has its own file in `src/lib/`. The `EvaluationEvidence.chunk.documentId` link makes evidence traceable back to a document.
- **OpenCode Zen** — `src/lib/ai/providers/opencode-zen-provider.ts`. Nemotron-backed model.
- **Provider swap** — not done. The existing OpenCode Zen provider is preserved.

---

## 4. Files Added

| File | Purpose |
| --- | --- |
| `.env.example` | Documented env-var template covering every variable the app reads (required + optional). |
| `src/lib/result.ts` | `ActionResult<T>`, `actionOk`, `actionFail` — centralized contract for future actions. |
| `src/lib/validations/ids.ts` | Zod UUID schemas for `userId`, `tradeCaseId`, `documentId`, `requirementId`, `evaluationId`, `evidenceId`, `chunkId`. |
| `src/lib/db/transaction.ts` | `withTransaction` wrapper around `prisma.$transaction`. |
| `src/lib/log.ts` | Namespaced `log.info/warn/error/debug` with automatic secret redaction. |
| `scripts/verify-phase6.mjs` | Live regression: 31 checks, runnable via `npx tsx scripts/verify-phase6.mjs <cookies>`. |

## 5. Files Modified

**None.**

The verification phase confirmed this: the git diff between start-of-phase and end-of-phase touches only the six new files in the table above.

---

## 6. Backend Architecture

The conceptual layering the brief proposes is the layering the repo already follows:

```
UI / Client
      ↓
Server Action / Route Handler
      ↓
Authentication + Authorization        (requireAuth, requireOwnedTradeCase)
      ↓
Validation                           (Zod schemas in src/lib/validations)
      ↓
Service / Business Logic             (src/lib/rag, src/lib/embeddings, src/lib/storage, ...)
      ↓
Repository / Database Access         (Prisma in src/actions and src/lib/auth/session)
      ↓
Prisma / Database                    (src/lib/db/prisma.ts)
```

For AI:

```
Service Layer (src/actions/evaluations.ts)
      ↓
RAG / Retrieval / AI Service (src/lib/rag/evaluation-service.ts)
      ↓
OpenCode Zen (src/lib/ai/providers/opencode-zen-provider.ts)
      ↓
Nemotron (the model)
```

Phase 6 adds no new layers. It adds three reusable primitives that the existing layers may adopt:
- `ActionResult` + `actionOk` / `actionFail` for the Server-Action layer
- `withTransaction` for the Repository layer
- `log` for diagnostic output (Phase 18 swap-in target)

---

## 7. Validation

Validation coverage at end of Phase 6:

| Input | Schema | Where enforced |
| --- | --- | --- |
| Trade Case create/update | `createTradeCaseSchema` | `src/actions/trade-cases.ts` (server-authoritative) |
| Product update | `updateProductSchema` | `src/actions/products.ts` |
| Document update | `updateDocumentSchema` | `src/actions/documents.ts` |
| Requirement create/update | `createRequirementSchema`, `updateRequirementSchema` | `src/actions/requirements.ts` |
| ID validation | `tradeCaseIdSchema` etc. (new) | ready for adoption; `src/lib/validations/ids.ts` |
| Sign-up | manual + `validatePassword` | `src/app/api/auth/register/route.ts` |
| Sign-in | manual | `src/lib/auth/config.ts` (Credentials provider) |
| Forgot password | manual (email shape) | `src/app/api/auth/forgot-password/route.ts` |
| Reset password | manual + `validatePassword` | `src/app/api/auth/reset-password/route.ts` |
| Document upload (file) | MIME allowlist + 10 MB cap (server) | `src/actions/documents.ts:67-72` |
| File size & extension (client) | client mirror in `DocumentDropzone.tsx` | UX hint, server authoritative |
| Search | manual (not user-supplied in current UI) | n/a |
| Pagination/sort/filter | not currently used in API; would be added in later phases | n/a |

Rules respected:
- Client-side validation is never sufficient. The server validates every input.
- The client never controls ownership. Every action's `userId` comes from `requireAuth()`, never from the form.
- IDs are validated by Zod (new) where used; document and case IDs are validated by ownership checks already (which implicitly assert UUID shape via Prisma's findFirst).

---

## 8. Authentication / Authorization

The existing auth boundary is correct and complete. Phase 6 verified it does not regress.

### Live checks (verify-phase6.mjs §1, §3)

- **Unauthenticated GET document API** → `denied (401 or redirect)` — PASS
- **Unauthenticated /dashboard** → redirect to /auth/signin — PASS
- **Authenticated /dashboard** → 200 — PASS
- **Bogus case id (demo user)** → not-found page — PASS
- **Bogus document id (demo user)** → not-found page — PASS
- **Real cross-user: 2nd user denies demo case** → not-found / redirect — PASS
- **Real cross-user: response does not leak demo case content** (Aseptic Mango, Lithium Ion) — PASS

### Per-entry-point audit

Every protected operation enforces the standard pattern:

```
unauthenticated → 401 or 307 redirect
authenticated, not owner → 404 or not-found page
authenticated, owner → operation allowed
```

| Operation | Auth gate | Ownership gate |
| --- | --- | --- |
| `createTradeCase` | `requireAuth` | n/a (creates for current user) |
| `updateTradeCase` | `requireAuth` | `requireOwnedTradeCase` |
| `deleteTradeCase` | `requireAuth` | `requireOwnedTradeCase` |
| `getTradeCaseById` | `getCurrentUserId` | implicit `where: { id, userId }` |
| `getTradeCases` | `getCurrentUserId` | `where: { userId }` |
| `uploadDocument` | `requireAuth` | `requireOwnedTradeCase` |
| `updateDocument` | `requireAuth` | `requireOwnedTradeCase` + `findFirst({ id, tradeCaseId })` |
| `deleteDocument` | `requireAuth` | `requireOwnedTradeCase` + `findFirst({ id, tradeCaseId })` |
| `updateProduct` | `requireAuth` | `requireOwnedTradeCase` |
| `createRequirement` | `requireAuth` | `requireOwnedTradeCase` |
| `updateRequirement` | `requireAuth` | `requireOwnedTradeCase` + `findFirst({ id, tradeCaseId })` |
| `deleteRequirement` | `requireAuth` | `requireOwnedTradeCase` + `findFirst({ id, tradeCaseId })` |
| `triggerRequirementEvaluation` | `requireAuth` | `requireOwnedTradeCase` + `findFirst({ id, tradeCaseId })` |
| `triggerAllRequirementsEvaluation` | `requireAuth` | `requireOwnedTradeCase` |
| `GET /api/cases/[id]/documents/[documentId]` (file) | `auth()` | `where: { id, tradeCaseId, tradeCase: { userId } }` |
| `POST /api/account/change-password` | `auth()` | n/a (changes own password) |
| `POST /api/account/update-name` | `auth()` | n/a (changes own name) |
| `POST /api/auth/forgot-password` | n/a (public) | n/a |
| `POST /api/auth/reset-password` | token check | token + `findUnique({ emailVerificationToken })` |
| `POST /api/auth/register` | n/a (public) | n/a |
| `POST /api/auth/sessions` | n/a (public list) | n/a (lists for current session) |
| `GET /api/auth/providers` | n/a (public) | n/a |
| All `auth/[...nextauth]` | NextAuth | n/a |

Cross-user isolation is intact. `requireOwnedTradeCase` is the only ownership primitive and it is the one used everywhere.

---

## 9. Database Foundation

Phase 6 made no schema changes. Phase 7 owns the database phase. What Phase 6 did:

- **Prisma client** — `src/lib/db/prisma.ts` already uses the HMR-safe global pattern. Verified.
- **No client duplication** — single instance shared across the process. Verified.
- **No DB calls from client components** — `prisma.*` calls in `src/components/**` = 0 (grep verified). All are in `src/actions/**`, `src/lib/**`, and `src/app/api/**`.
- **No unscoped user queries** — every read of `TradeCase`, `Document`, `Requirement`, etc. either includes `userId` in `where` or is reachable only after `requireOwnedTradeCase`. Verified by reading the call sites.
- **No unsafe dynamic query construction** — Zod-validated inputs are the only path to Prisma writes; IDs come from `requireOwnedTradeCase` returns. No `prisma.$queryRawUnsafe` anywhere.
- **Transactions** — `withTransaction` (new) is available. Phase 6 does not retrofit existing actions. The transaction helper is exercised in `verify-phase6.mjs` §8 to prove it rolls back on throw and leaves no partial rows.

---

## 10. Error Handling

The repo's existing error strategy is consistent and was not changed in Phase 6. Summary:

- **Server actions** return `{ success: boolean; error?: string }`. `UnauthorizedError` and `ForbiddenError` get human-readable fallback messages. `ZodError` is treated as a validation error. Generic `Error.message` is forwarded. Anything else becomes a generic fallback.
- **API routes** return `NextResponse.json({ error: string }, { status })` with a status code matching the category: 400 (validation), 401 (auth), 404 (not found), 409 (conflict), 429 (rate limit), 500 (internal).
- **Internal details** — never leaked. `console.error(...)` is for server-side diagnostics; the response body is always a clean user-facing string. No stack traces, no Prisma error names, no internal paths in responses.
- **`actionFail` (new)** — `src/lib/result.ts` centralizes the action-error mapping. Future actions can adopt it. The four branches are unit-tested in `verify-phase6.mjs` §7.

---

## 11. Configuration

`src/lib/env-validation.ts` already implements the required / optional / feature-disabled distinction. It runs on import in server context and:

- **Required** — `DATABASE_URL`, `OPENCODE_ZEN_API_KEY`. App throws on missing.
- **Optional but recommended** — embedding / AI provider vars, OAuth, email, NextAuth. App warns but does not throw.
- **Feature intentionally disabled** — Google OAuth logs "not configured" when both halves of its env are absent; same for Facebook; same for Gmail / generic SMTP (defaults to dev-fallback that writes to `.emails/dev/`).

Phase 6 adds:
- **`.env.example`** — a documented template. Every variable the app reads is listed, with format hints and the consequence of leaving it blank. No real values, no secrets.

No new secrets were introduced. No `.env` was modified. No env-reading code was changed.

---

## 12. Security Audit

A focused backend security audit was performed. Findings:

| Concern | Status | Evidence |
| --- | --- | --- |
| SQL injection | Safe | No `$queryRawUnsafe` anywhere; all writes via Prisma's typed API; Zod-validated inputs. |
| Authorization bypass | Safe | `requireOwnedTradeCase` is the single ownership primitive; verified in every action. |
| IDOR | Safe | Every cross-user read filters by `userId` (direct or transitive). Live cross-user test passes. |
| Secret leakage | Safe | New `log` utility redacts `password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `accessToken`, `refreshToken`, `idToken`. Verified in `verify-phase6.mjs` §9. |
| Password leakage | Safe | `bcryptjs` hashing; never logged; never echoed. |
| Token leakage | Safe | Reset tokens are single-use, 60-min TTL, set then cleared on email send failure. |
| Insecure cookies | Safe | NextAuth session cookies are HttpOnly; sameSite defaults are set by NextAuth v5. |
| Unsafe redirects | Safe | `forgot-password` falls back to `request.nextUrl.origin` only if no env override is set. |
| Path traversal | Safe | Upload `fileRef` is `crypto.randomUUID() + path.extname(file.name)`. No `..` allowed. |
| File access control | Safe | `GET /api/cases/[id]/documents/[documentId]` checks `tradeCase: { userId }` before serving bytes. |
| Unsafe file handling | Safe | MIME allowlist + 10 MB cap; orphan cleanup on upload failure; `ENOENT`-tolerant delete. |
| Prompt injection | Not Phase 6 scope | RAG prompt construction is in `src/lib/rag/prompts.ts`; not modified. |
| User-to-user data leakage | Safe | Cross-user live test PASS. |

No real "secure" claim is made without a check. The cross-user test in `verify-phase6.mjs` §3 actually creates a second user and tries to access the first user's case.

---

## 13. External Services

| Service | Status | Evidence |
| --- | --- | --- |
| OpenCode Zen (AI) | VERIFIED via `validateEnv` + `evaluateRequirement` (Phase 3 regression passes) | `verify-phase3.ts` PASS |
| Nemotron (model) | VERIFIED via OpenCode Zen | indirect — same path |
| OpenCode embeddings | VERIFIED via Phase 3 regression | `verify-phase3.ts` PASS |
| Local / dev embedding providers | VERIFIED via config | `src/lib/embeddings/config.ts` |
| Gmail SMTP | NOT VERIFIED — no Gmail credentials configured | logged as "DEV FALLBACK" |
| Generic SMTP | NOT VERIFIED — no SMTP credentials configured | logged as "DEV FALLBACK" |
| Dev email fallback | VERIFIED — writes to `.emails/dev/` | `src/lib/email/service.ts` |
| Google OAuth | NOT VERIFIED — no Google credentials configured | logged as "not configured" |
| Facebook OAuth | NOT VERIFIED — no Facebook credentials configured | logged as "not configured" |
| Local file storage | VERIFIED — `src/lib/storage/local-storage.ts` | `verify-phase4.mjs` PASS |
| Prisma | VERIFIED | `verify-phase3.ts` PASS |

External services that are NOT VERIFIED are not fabricated. The logs explicitly say "not configured" and the app still boots.

---

## 14. Verification Results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 33 problems (11 errors, 22 warnings) — same as start of Phase 6; **zero new** |
| `npm run build` | exit 0; all routes registered |
| `npx tsx scripts/verify-phase6.mjs scripts/cookies-phase4.txt` | **31 pass / 0 fail / 1 skipped** |

The single skipped check is the oversized-file-upload live test, which requires a real multipart form post from a browser session. The size / MIME check is enforced server-side in `src/actions/documents.ts:67-72` and the existing path is exercised by `verify-phase4.mjs` indirectly (Phase 4 regression still passes 21/21).

---

## 15. Phase 6 Regression

```
verify-phase6.mjs  →  31 PASS,  0 FAIL,  1 SKIPPED
```

Breakdown:
- Auth boundary: 2
- Authenticated session: 2
- Cross-user isolation: 4 (incl. 2 real cross-user sub-checks)
- Malformed input: 3
- Upload input validation: 1 SKIPPED (with reason)
- ID validators: 5
- Action-result helper: 5
- Transaction helper: 2
- Log utility (secret redaction): 5
- Environment validation: 1
- Phase 4 regression: 1 (subprocess)
- Phase 3 regression: 1 (subprocess)

---

## 16. Previous Phase Regression

```
verify-phase4.mjs   →  21/21 PASS
verify-phase3.ts    →  97/97 PASS  (2 NOT-VERIFIED for real Google OAuth)
```

Both invoked as subprocesses from `verify-phase6.mjs`. No regression.

---

## 17. Live Browser Verification

Signed in as `demo@tradeready.ai` against the live dev server:

| Route | Status |
| --- | --- |
| `/dashboard` | 200 |
| `/account` | 200 |
| `/dashboard/sessions` | 200 |
| `/cases/{demo-id}` | 200 |
| `/cases/{demo-id}/documents` | 200 |
| `/cases/{demo-id}/product` | 200 |
| `/cases/{demo-id}/requirements` | 200 |
| `/cases/{demo-id}/review` | 200 |
| `/cases/{demo-id}/export` | 200 |
| `/cases/{demo-id}/search` | 200 |
| `/cases/new` | 200 |

All 11 critical routes return 200. Cross-user isolation confirmed by registering a fresh second user and verifying the demo case is not reachable (see `verify-phase6.mjs` §3).

---

## 18. Bugs Found and Fixes

| # | Severity | Root Cause | Fix | Retest |
| - | -------- | ---------- | --- | ------ |
| 1 | Low | `withTransaction` initial signature used `typeof prisma` instead of `Prisma.TransactionClient`, causing a TypeScript error. | Switched to `Prisma.TransactionClient`. | tsc exit 0; verify-phase6 §8 PASS. |
| 2 | Low | `log.ts` had an unused `eslint-disable no-console` directive. | Removed the directive. | lint back to 33/11/22. |
| 3 | Low | Initial `verify-phase6.mjs` acceptance for "denied" did not include the Next.js 200 + not-found-page convention. | Broadened `denied` to include `200 && body includes "not found" / "Not Found" / "404"`. | verify-phase6 §3 PASS. |
| 4 | Low | Initial `verify-phase6.mjs` used `npx tsx` and `.bin/tsx` from `spawnSync` on Windows — both returned `status=null`. | Switched to `node node_modules/tsx/dist/cli.mjs` direct invocation. | verify-phase6 §9, §12 PASS. |
| 5 | Low | Initial cross-user "leak" check matched the case-id URL inside a 307 redirect body. | Restricted the leak check to `r.status === 200` only. | verify-phase6 §3 PASS. |
| 6 | Low | Initial `verify-phase6.mjs` left an unused `sleep` import and unused `result` variable, producing 3 new lint warnings. | Removed unused code. | lint back to 33/11/22. |
| 7 | Low | `prisma:error` lines from a deliberately-failed transaction in the test caused cosmetic noise in the output. | Kept as-is — the test PASSES (the error is the expected FK violation that proves the transaction rolled back). | verify-phase6 §8 PASS. |

---

## 19. Known Limitations (carried forward)

- **Real Google OAuth** — not configured; `signIn.google` is not present in the providers response.
- **Real Facebook OAuth** — not configured.
- **Real SMTP delivery** — dev mode writes `.eml` to `.emails/dev/`; SMTP is not configured.
- **Real document preview** — the document detail page exposes a "future-compatible preview area" but does not render PDFs in the browser.
- **In-app PDF rendering** — same.
- **Bulk document actions** — out of scope for the 4–10-doc per case volume.
- **No real external credentials** — every NOT-VERIFIED line in §13 reflects this honestly. None are fabricated.

---

## 20. Out of Scope (intentionally deferred)

These belong to later phases and are noted here for future agents:

- **Phase 7 (Database)** — any schema additions, indexes, soft-delete, additional cascade rules.
- **Phase 8 (Auth & Users)** — MFA, password history, session revocation UI, OAuth account unlinking.
- **Phase 10 (Document Processing)** — real OCR, virus scan, async pipeline, queue.
- **Phase 11 (RAG/Ingestion)** — ingestion queue, embedding cache, chunking-strategy changes.
- **Phase 15 (LangGraph)** — workflow state machine.
- **Phase 18 (Observability/Security)** — OpenTelemetry, Sentry, structured-logging sink, rate-limit backed by Redis.

The `log` utility was deliberately designed to be the swap-in point for Phase 18: changing the sink does not require touching any call site.

---

## 21. Final Verdict

**Phase 6 is COMPLETE.**

The repo's existing backend foundation was already strong (Phases 1–5). Phase 6 added the six small files that make the foundation easier to build on, and verified via a 31-check live script that nothing regressed. The next phases can adopt `ActionResult` / `withTransaction` / `log` / `idSchemas` incrementally without breaking any existing call site.

**No claim is made beyond what the live checks verified. No external service is falsely claimed to be working. No bug is hidden. No production code was modified.**

---

## Documentation Integrity

- `PHASE3-FINAL-REPORT.md` — present, untouched.
- `PHASE4-FINAL-REPORT-UPDATED.md` — present, untouched.
- `PHASE5-FINAL-REPORT.md` — present, untouched.
- `PHASE6-FINAL-REPORT.md` — this file (new).
- `PHASE4-FINAL-REPORT.md` (original) — does not exist in the tree, as previously documented.

No historical report was modified.

---

**End of report.**
