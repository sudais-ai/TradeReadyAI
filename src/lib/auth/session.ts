import { auth } from "@/lib/auth/route";
import { prisma } from "@/lib/db/prisma";

// ─── Test-only session stub ────────────────────────────────────────────────
// When running verification scripts (`verify-part15.ts`), this module-level
// variable can be set to simulate an authenticated user without going through
// NextAuth. In production it is always null and `auth()` is used.
let TEST_SESSION_USER_ID: string | null = null;
export function setSessionUserId(id: string | null) {
  TEST_SESSION_USER_ID = id;
}

/**
 * Server-side helper: returns the currently authenticated user id, or null.
 * Safe to call from server actions, route handlers, and RSC pages.
 *
 * Phase 8: also performs a staleness check against the live DB. If the
 * user has rotated their password since this JWT was issued, the call
 * returns null. The check is one indexed User.id read; the middleware
 * cannot do this because Prisma is not Edge-compatible.
 */
export async function getCurrentUserId(): Promise<string | null> {
  // In test/verification scripts we allow injecting a session.
  if (TEST_SESSION_USER_ID !== null) return TEST_SESSION_USER_ID;
  const session = await auth();
  if (!session?.user?.id) return null;
  const sessionUserId = session.user.id as string;
  // session.user.passwordChangedAt is a Unix ms number (set by the
  // session callback in src/lib/auth/config.ts). Wrap in a Date for
  // isSessionStale's comparison.
  const claimMs = session.user.passwordChangedAt ?? null;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(sessionUserId, claimDate)) {
    return null;
  }
  return sessionUserId;
}

/**
 * Returns a full user record for the current session, or null if not signed in
 * OR the session is stale (password rotated since this JWT was issued).
 * The id always comes from the trusted session — never from a client input.
 */
export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
  } catch {
    return null;
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Helper used by every server action that mutates or reads a TradeCase.
 * Returns the verified owner userId, or throws an UnauthorizedError / ForbiddenError.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedError("You must be signed in to perform this action.");
  }
  return userId;
}

/**
 * Returns the trade case id if the case exists AND belongs to the given user.
 * Throws UnauthorizedError if not signed in, ForbiddenError if not the owner.
 *
 * Phase 13: also filters out soft-deleted cases. A user who owns a
 * soft-deleted case cannot read, update, or enqueue work against it
 * through normal paths. (The dedicated `restoreTradeCase` action
 * filters by id + userId without the deletedAt predicate so a user
 * can recover their own trash.)
 */
export async function requireOwnedTradeCase(
  userId: string,
  tradeCaseId: string
): Promise<string> {
  if (!userId) throw new UnauthorizedError();
  if (!tradeCaseId) throw new ForbiddenError("Trade case not found.");

  const tradeCase = await prisma.tradeCase.findFirst({
    where: { id: tradeCaseId, userId, deletedAt: null },
    select: { id: true },
  });

  if (!tradeCase) {
    throw new ForbiddenError("You don't have access to this trade case.");
  }
  return tradeCase.id;
}

/**
 * Phase 8: returns true if the session's passwordChangedAt claim is older
 * than the user's current passwordChangedAt in the DB. Used by the
 * middleware to invalidate JWTs after a password change.
 *
 * Returns false (not stale) when:
 *   - the session has no passwordChangedAt claim (legacy tokens)
 *   - the user has no passwordChangedAt in the DB (legacy users, before backfill)
 *   - the claim matches the DB row
 *
 * Performs a single indexed lookup on User.id; safe to call on every
 * request. The middleware in `src/middleware.ts` is responsible for the
 * actual redirect.
 */
export async function isSessionStale(
  sessionUserId: string,
  claimPasswordChangedAt: Date | null | undefined
): Promise<boolean> {
  if (!sessionUserId) return false;
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { passwordChangedAt: true },
  });
  if (!user) return true; // user deleted — treat as stale

  const dbTs = user.passwordChangedAt ? user.passwordChangedAt.getTime() : null;
  const claimTs = claimPasswordChangedAt ? claimPasswordChangedAt.getTime() : null;

  console.log(`[isSessionStale] dbTs=${dbTs} claimTs=${claimTs} stale=${dbTs !== null && claimTs !== null && claimTs < dbTs}`);

  if (claimTs === null) return false;
  if (dbTs === null) return false;

  return claimTs < dbTs;
}
