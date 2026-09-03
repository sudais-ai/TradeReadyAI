/**
 * Phase 13 — soft-delete helpers.
 *
 * Soft-delete is enforced at the application layer (in server actions,
 * route handlers, RAG queries, and the processing worker) by adding an
 * explicit `deletedAt: null` predicate. This module provides a single
 * place to read and write the convention.
 *
 * Why a small module rather than a Prisma extension?
 *
 *   - Auditable. Every read site stays explicit (`deletedAt: null`).
 *   - Predictable. No "magic" filtering that could surprise a future
 *     maintainer reading the call site.
 *   - Testable. The helper has zero side effects.
 *   - Compatible with Prisma 5. No version-dependent extension API.
 *
 * The cost is that every read site must opt in. The brief's "easy to
 * audit" rule is worth more here than DRY.
 */

/** A where-clause fragment that scopes a query to active records only. */
export const ACTIVE_ONLY = { deletedAt: null } as const;

/** A where-clause fragment that scopes a query to soft-deleted records only. */
export const DELETED_ONLY = { NOT: { deletedAt: null } } as const;

/** True if the record is soft-deleted (deletedAt is set). */
export function isDeleted(
  record: { deletedAt: Date | null | undefined } | null | undefined
): boolean {
  if (!record) return false;
  return record.deletedAt != null;
}

/** True if the record is active (not soft-deleted). */
export function isActive(
  record: { deletedAt: Date | null | undefined } | null | undefined
): boolean {
  return !isDeleted(record);
}

/**
 * Merge an existing `where` clause with `deletedAt: null`. Used by the
 * helpers in `src/lib/auth/session.ts` and by every server action that
 * needs to enforce the active-only rule. The input is shallow-merged
 * so callers can add their own predicates.
 *
 *   withActive({ id, userId }) => { id, userId, deletedAt: null }
 *   withActive({ id, userId }, { deletedAt: null }) => { id, userId, deletedAt: null }  // idempotent
 */
export function withActive<T extends Record<string, unknown>>(where: T): T & { deletedAt: null } {
  return { ...where, deletedAt: null };
}
