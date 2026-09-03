import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isSessionStale } from "@/lib/auth/session";
import { auth } from "@/lib/auth/route";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ActivityFeed, type ActivityRow } from "@/components/dashboard/ActivityFeed";
import { MetricCard } from "@/components/ui/MetricCard";
import { isEmailDevMode } from "@/lib/email/service";
import { getJobStats } from "@/lib/document-processing/persistent-queue";
import { ftsCount } from "@/lib/rag/keyword-retriever";

/**
 * Phase 14 — /dashboard/activity
 *
 * Server component that:
 *  1. Authenticates the user (Phase 8 stale-session check).
 *  2. Reads the first page of the user's own AuditLog rows from the
 *     database directly (not via the /api/audit HTTP boundary, so the
 *     initial render is a single Prisma query and ships zero secret
 *     material to the client).
 *  3. Renders the ActivityFeed client component, which handles
 *     "Load more" via the same /api/audit cursor pattern.
 *
 * The page is user-scoped by construction: every Prisma query is
 * `where: { userId: current }` and there is no `?userId=` query
 * parameter.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/dashboard/activity");
  }
  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/dashboard/activity&reason=stale");
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/signin?callbackUrl=/dashboard/activity");
  }

  // Read the search params for an initial filter so the URL is the
  // source of truth. We accept only known values (validated server-side).
  const params = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[] | undefined
  >;
  const action = pickSingle(params.action);
  const target = pickSingle(params.target);
  const from = pickSingle(params.from);
  const to = pickSingle(params.to);

  const initialRows = await loadActivityRows({
    userId,
    action,
    target,
    from,
    to,
    limit: PAGE_SIZE + 1,
  });

  const hasMore = initialRows.length > PAGE_SIZE;
  const page = hasMore ? initialRows.slice(0, PAGE_SIZE) : initialRows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt : null;

  // Sidebar-style metadata for the activity page header.
  // Phase 15: fold the two tradeCase / document counts into the
  // same Promise.all so the JSX below doesn't await them serially
  // after the initial render. All 7 calls now dispatch in parallel;
  // SQLite serializes them, but only one round-trip at a time is
  // better than seven interleaved awaits.
  const [stats, ftsRowCount, chunkCount, emailDevMode, auditCount, tradeCaseCount, documentCount] = await Promise.all([
    getJobStats().catch(() => null),
    ftsCount().catch(() => 0),
    prisma.documentChunk.count().catch(() => 0),
    Promise.resolve(isEmailDevMode()),
    prisma.auditLog.count({ where: { userId } }),
    prisma.tradeCase.count({ where: { userId, deletedAt: null } }),
    prisma.document.count({
      where: { tradeCase: { userId, deletedAt: null }, deletedAt: null },
    }),
  ]);

  return (
    <div className="pb-20">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Activity" },
        ]}
      />

      <PageHeader
        title="Activity"
        description={`A log of recent actions on your account and trade cases. Showing the most recent ${page.length} of ${auditCount} entries.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <MetricCard label="Trade Cases" value={tradeCaseCount} />
        <MetricCard label="Documents" value={documentCount} />
        <MetricCard
          label="Queue"
          value={stats ? stats.scheduled + stats.running : 0}
        />
        <MetricCard
          label="Search Index"
          value={ftsRowCount === chunkCount ? "Healthy" : "Drift"}
        />
      </div>

      <ActivityFeed
        initialRows={page as ActivityRow[]}
        initialNextCursor={nextCursor}
        initialAction={action}
        initialTarget={target}
        initialFrom={from}
        initialTo={to}
        pageSize={PAGE_SIZE}
        emailDevMode={emailDevMode}
      />
    </div>
  );
}

function pickSingle(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface LoadParams {
  userId: string;
  action: string | null;
  target: string | null;
  from: string | null;
  to: string | null;
  limit: number;
  cursor?: string | null;
}

async function loadActivityRows({
  userId,
  action,
  target,
  from,
  to,
  limit,
  cursor,
}: LoadParams): Promise<
  Array<{
    id: string;
    action: string;
    target: string;
    targetId: string | null;
    metadata: unknown;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
  }>
> {
  // Same filter validation as the API route. Keep these in sync.
  const KNOWN_ACTIONS = new Set<string>([
    "TRADE_CASE_CREATED",
    "TRADE_CASE_UPDATED",
    "TRADE_CASE_DELETED",
    "TRADE_CASE_RESTORED",
    "DOCUMENT_CREATED",
    "DOCUMENT_DELETED",
    "DOCUMENT_RESTORED",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET",
    "DOCUMENT_PROCESSING_COMPLETED",
    "DOCUMENT_PROCESSING_FAILED",
    "STALE_JOB_RECOVERED",
  ]);
  const KNOWN_TARGETS = new Set<string>(["User", "TradeCase", "Document", "ProcessingJob"]);

  const where: {
    userId: string;
    action?: string;
    target?: string;
    createdAt?: { lt?: Date; gte?: Date };
  } = { userId };
  if (action && KNOWN_ACTIONS.has(action)) where.action = action;
  if (target && KNOWN_TARGETS.has(target)) where.target = target;

  const createdAtWhere: { lt?: Date; gte?: Date } = {};
  if (cursor) {
    const cd = new Date(cursor);
    if (!Number.isNaN(cd.getTime())) createdAtWhere.lt = cd;
  }
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAtWhere.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // Compose with cursor: whichever is earlier becomes the upper bound.
      const existing = createdAtWhere.lt?.getTime() ?? Number.POSITIVE_INFINITY;
      const upper = Math.min(existing, d.getTime());
      if (Number.isFinite(upper)) createdAtWhere.lt = new Date(upper);
    }
  }
  if (Object.keys(createdAtWhere).length > 0) where.createdAt = createdAtWhere;

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
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

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    target: r.target,
    targetId: r.targetId,
    metadata: r.metadata ? safeParse(r.metadata) : null,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
  }));
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
