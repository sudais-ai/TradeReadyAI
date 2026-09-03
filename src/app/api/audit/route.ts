import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { AUDIT_ACTIONS, AUDIT_TARGETS } from "@/lib/audit/log";

/**
 * Phase 13: GET /api/audit
 * Phase 14: extended with action, target, from, to filters.
 *
 * Returns the audit log rows for the current user, paginated, newest
 * first. The endpoint is server-side scoped to `userId = current` —
 * a user can only see their own audit log. There is no admin role
 * and no cross-user read.
 *
 * Query parameters:
 *   - limit:  default 50, max 200
 *   - cursor: createdAt of the last row on the previous page (cursor pagination)
 *   - action: optional, must be a known AUDIT_ACTIONS value
 *   - target: optional, must be a known AUDIT_TARGETS value
 *   - from:   optional, ISO timestamp, inclusive lower bound on createdAt
 *   - to:     optional, ISO timestamp, exclusive upper bound on createdAt
 *
 * All filters are AND-ed with the userId scope. A malicious caller
 * cannot bypass ownership: even if `?userId=` is supplied, the WHERE
 * is hard-coded to the current user's id. `?userId=` is silently
 * ignored (logged at debug for visibility).
 *
 * Response: { rows: AuditLogRow[], nextCursor: string | null }
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));
  const cursor = url.searchParams.get("cursor");

  // ── Filter validation ─────────────────────────────────────────────
  // We validate the action/target against the known constants so a
  // caller cannot inject a giant string and force a Prisma WHERE that
  // breaks index use. The known values are the AUDIT_ACTIONS and
  // AUDIT_TARGETS sets exported by the audit helper.
  const KNOWN_ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));
  const KNOWN_TARGETS = new Set<string>(Object.values(AUDIT_TARGETS));

  const rawAction = url.searchParams.get("action");
  const rawTarget = url.searchParams.get("target");
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");

  const actionFilter =
    rawAction && KNOWN_ACTIONS.has(rawAction) ? rawAction : null;
  const targetFilter =
    rawTarget && KNOWN_TARGETS.has(rawTarget) ? rawTarget : null;

  // Log-but-ignore unknown action/target so a UI that passes a stale
  // value during a code rollout doesn't silently appear to filter.
  if (rawAction && !actionFilter) {
    log.warn("audit:list", "ignored unknown action filter", {
      userId,
      rawAction: rawAction.slice(0, 64),
    });
  }
  if (rawTarget && !targetFilter) {
    log.warn("audit:list", "ignored unknown target filter", {
      userId,
      rawTarget: rawTarget.slice(0, 64),
    });
  }

  // Date filters. We accept ISO-8601 only. Invalid input is logged and
  // ignored — we never let a malformed date crash the route.
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (rawFrom) {
    const d = new Date(rawFrom);
    if (Number.isNaN(d.getTime())) {
      log.warn("audit:list", "ignored malformed from filter", {
        userId,
        rawFrom: rawFrom.slice(0, 64),
      });
    } else {
      fromDate = d;
    }
  }
  if (rawTo) {
    const d = new Date(rawTo);
    if (Number.isNaN(d.getTime())) {
      log.warn("audit:list", "ignored malformed to filter", {
        userId,
        rawTo: rawTo.slice(0, 64),
      });
    } else {
      toDate = d;
    }
  }

  // Detect and log a malicious ?userId= attempt. The variable is
  // intentionally never read by the WHERE clause.
  const attemptedUserId = url.searchParams.get("userId");
  if (attemptedUserId && attemptedUserId !== userId) {
    log.warn("audit:list", "attempted cross-user audit read blocked", {
      currentUserId: userId,
      attemptedUserId: attemptedUserId.slice(0, 64),
    });
  }

  try {
    // Build the WHERE. The userId scope is always set; the optional
    // filters AND on top. Date filters compose with the cursor (the
    // cursor is expressed as createdAt < cursorDate).
    const where: {
      userId: string;
      createdAt?: { lt?: Date; gte?: Date; lt2?: Date };
      action?: string;
      target?: string;
    } = { userId };

    const createdAtConditions: { lt?: Date; gte?: Date; lt2?: Date } = {};
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        createdAtConditions.lt = cursorDate;
      }
    }
    if (fromDate) {
      createdAtConditions.gte = fromDate;
    }
    if (toDate) {
      createdAtConditions.lt2 = toDate;
    }
    if (Object.keys(createdAtConditions).length > 0) {
      // Prisma's where.createdAt only takes one operator at a time, so
      // we re-compose: if both cursor and `to` are present, the cursor
      // takes the `< cursorDate` slot and `to` becomes `< toDate` via a
      // compound `lt` is impossible. We instead build a single
      // createdAt with a `<` upper bound (whichever is smaller of
      // cursor and to) and a `gte` lower bound.
      // For our purposes: cursor pagination is "rows older than X",
      // date filter `to` is "rows before Y". They compose as
      // `lt: min(cursorDate, toDate)`. We compute it here.
      const cursorMs =
        createdAtConditions.lt?.getTime() ?? Number.POSITIVE_INFINITY;
      const toMs = toDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const upperMs = Math.min(cursorMs, toMs);
      const dateWhere: { lt?: Date; gte?: Date } = {};
      if (Number.isFinite(upperMs)) dateWhere.lt = new Date(upperMs);
      if (createdAtConditions.gte) dateWhere.gte = createdAtConditions.gte;
      where.createdAt = dateWhere;
    }
    if (actionFilter) where.action = actionFilter;
    if (targetFilter) where.target = targetFilter;

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // +1 to detect a next page
      select: {
        id: true,
        action: true,
        target: true,
        targetId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

    return NextResponse.json({
      rows: page.map((r) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        targetId: r.targetId,
        metadata: r.metadata ? safeParse(r.metadata) : null,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor,
    });
  } catch (err) {
    log.error("audit:list", "failed to list audit log", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
