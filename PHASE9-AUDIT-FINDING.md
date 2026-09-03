# Phase 9 Audit Finding — Scope Cannot Be Determined From Project Plan

**Date:** 2026-08-28
**Author:** Repository audit (read-only).
**Status:** 🟡 **PARTIALLY COMPLETE — scope decision required from operator.**
**Reason for partial completion:** Per the brief's own CRITICAL RULE (§1): "Do NOT invent features merely because they appear in the Phase 8 'Open Items' section." Per the brief's Final Verdict Rule (§15): "If something remains genuinely unresolved, report PARTIALLY COMPLETE and clearly identify the exact blocker." The blocker is below.

---

## TL;DR

**There is no Phase 9 in the project's original plan.** The brief asks me to execute "Phase 9 of the existing project plan," but the only place the project's future phases are enumerated is `PHASE6-FINAL-REPORT.md` §20 ("Out of Scope / intentionally deferred"). That list jumps from **Phase 8** directly to **Phase 10** — there is no Phase 9. Inventing a Phase 9 scope would violate the brief's own evidence-based rule. I am therefore asking the operator to choose the actual scope before any implementation work begins.

The current repository state is healthy: all 46 Phase 8 checks pass, all earlier-phase regression scripts pass, migrations are in sync, and the dev server is running.

---

## 1. Audit Performed

Read the entire repository before changing anything:

- All `PHASE*.md` final reports: PHASE 3, 4, 5, 6, 7, 8 (and the "UPDATED" Phase 4 file).
- `README.md`, `.env.example`, `package.json`, `prisma/schema.prisma`.
- `scripts/` directory (39 files: verify-part3..16, verify-phase3/4/6/7/8, etc.).
- All `src/` source files reachable from `src/app/`, `src/lib/`, `src/actions/`, `src/components/`.
- The existing plan-mode file at `C:\Users\Hp\.claude\plans\tradeready-ai-effervescent-stardust.md` (this is the Phase 8 plan, not a Phase 9 plan).
- All `node_modules/.bin/...` — not searched (irrelevant to project roadmap).

## 2. What the Project Plan Says

The single authoritative enumeration of future phases is in **`PHASE6-FINAL-REPORT.md` §20 "Out of Scope (intentionally deferred)"** (lines 384-395):

> These belong to later phases and are noted here for future agents:
>
> - **Phase 7 (Database)** — any schema additions, indexes, soft-delete, additional cascade rules.
> - **Phase 8 (Auth & Users)** — MFA, password history, session revocation UI, OAuth account unlinking.
> - **Phase 10 (Document Processing)** — real OCR, virus scan, async pipeline, queue.
> - **Phase 11 (RAG/Ingestion)** — ingestion queue, embedding cache, chunking-strategy changes.
> - **Phase 15 (LangGraph)** — workflow state machine.
> - **Phase 18 (Observability/Security)** — OpenTelemetry, Sentry, structured-logging sink, rate-limit backed by Redis.

**Phases 7 and 8 are now complete.** The next planned phase in the original plan is **Phase 10**, not Phase 9.

The same report's opening line is even more explicit: "**Scope:** Backend Foundation for the next phases (7–20). Phase 6 is the *foundation*, not the implementation of those phases." So the project plan contemplates phases 7, 8, … 20, but the explicit enumeration in §20 names only 7, 8, 10, 11, 15, 18.

There is no other roadmap, plan, or specification document in the repository that defines a Phase 9. No `ROADMAP.md`. No `TODO` list. No `PLANNING.md`. No project-management artifact.

## 3. The Only "Phase 9" Mentions in the Repo

A `grep` for "phase 9" / "phase nine" across the repository returns only two matches — both in `PHASE8-FINAL-REPORT.md` and both in speculative risk-assessment language, not scope-definition language:

- Line 484: `## 27. Risk Assessment Going Into Phase 9` — a section that talks about dev-server state, demo password, and the `passwordChangedAt` field. It does not define Phase 9 scope.
- Line 489: "**The `User.passwordChangedAt` field is the foundation for any future session-revocation feature** (e.g. a 'log out other devices' button in the account settings). Phase 8 lays the schema; **Phase 9+ can build the UI**."

The word "e.g." signals an example, not a scope. The brief's own CRITICAL RULE §1 addresses this exact situation: "Do NOT invent features merely because they appear in the Phase 8 'Open Items' section."

## 4. Why I Am Not Inventing Scope

The brief §1 is unambiguous:

> "Do NOT invent features merely because they appear in the Phase 8 'Open Items' section. … Only implement something if: it is explicitly part of the existing project roadmap/plan, OR the repository contains clear evidence that it belongs to the next planned phase."

The only roadmap in the project (PHASE 6 §20) does not name a Phase 9. The Phase 8 report's "Open Items" are explicitly excluded. There is no repository evidence that any specific feature "belongs to the next planned phase."

If I were to pick arbitrarily (e.g. "let me build MFA, because it was mentioned in PHASE 6 §20"), I would be inventing a Phase 9. The Phase 6 §20 list describes the *themes* of future phases but does not commit to a phase ordering — Phase 10 is about Document Processing, Phase 11 is about RAG, Phase 15 is about LangGraph, Phase 18 is about Observability. None of them are about MFA specifically. The "MFA, password history, session revocation UI, OAuth account unlinking" in §20 is the Phase 8 *theme* — and the Phase 8 brief already addressed it.

The honest conclusion is that I do not have a Phase 9 specification.

## 5. Current Repository State (Evidence of Health)

Before reporting this finding, I confirmed the repository is in a known-good state:

| Check | Result |
| --- | --- |
| Dev server | Running on `localhost:3000` (HTTP 307 on `/`). |
| `npx prisma migrate status` | "Database schema is up to date!" (9 migrations). |
| `npx tsx scripts/verify-phase8.mts scripts/cookies-phase8.txt` | **46 pass, 0 fail, 0 skipped.** |
| `verify-phase3.ts` regression | **PASS.** |
| `verify-phase4.mjs` regression | **PASS.** |
| `verify-phase6.mjs` regression | **PASS.** |
| `verify-phase7.mts` regression | **PASS.** |
| Live route walkthrough (8 routes) | **8/8 pass** (200/307/308 as appropriate). |

No Phase 8 work needs to be redone.

## 6. What I Am NOT Doing (and Why)

- **I am not writing a `PHASE9-FINAL-REPORT.md` claiming completion of an invented scope.** That would be a fabrication — the worst possible kind of project artifact, because future agents reading it would trust it.
- **I am not starting code changes for MFA, OCR, LangGraph, OpenTelemetry, or any other speculative topic.** Each of those is a large, well-defined phase in its own right. Picking one without operator input would be inventing scope.
- **I am not re-running or modifying earlier-phase regression scripts** to "make them pass" — every regression still passes.
- **I am not running `prisma migrate reset`, deleting the database, or fabricating external-service results** (per the brief §5 and §11).

## 7. What the Operator Must Decide

The next step is for the operator to pick **which** planned phase to execute next. The candidates from PHASE 6 §20, in their original ordering:

| Phase | Theme | Source of scope |
| --- | --- | --- |
| 10 | Document Processing — real OCR, virus scan, async pipeline, queue. | PHASE 6 §20. |
| 11 | RAG/Ingestion — ingestion queue, embedding cache, chunking-strategy changes. | PHASE 6 §20. |
| 15 | LangGraph — workflow state machine. | PHASE 6 §20. |
| 18 | Observability/Security — OpenTelemetry, Sentry, structured-logging sink, Redis rate limiter. | PHASE 6 §20. |

There are also two specific items the Phase 8 brief identified as **out of scope for Phase 8** (not yet assigned to a phase):

- A "log out other devices" UI (the `passwordChangedAt` foundation is in place from Phase 8).
- A "password-change notification email" (a small additive feature).

I am not recommending any of these — I am listing them as legitimate candidates. The operator must pick.

## 8. Recommended Path Forward

Per the brief §15 Final Verdict Rule ("If something remains genuinely unresolved, report PARTIALLY COMPLETE and clearly identify the exact blocker"), I am reporting **PARTIALLY COMPLETE** with the blocker being "Phase 9 scope not defined in the existing project plan; operator decision required." Once the operator names the actual scope, the work becomes Phase 9 (renumbered) or remains Phase 10/11/15/18.

The audit is complete. No code has been changed. No migrations have been touched. No database rows have been modified. The current Phase 8 work remains the most recent shipped phase. This finding is the Phase 9 deliverable for now.

---

**End of audit finding.**
