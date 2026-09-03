import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/session";
import { auth } from "@/lib/auth/route";
import { isSessionStale } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { getJobStats } from "@/lib/document-processing/persistent-queue";

/**
 * Phase 14 — /dashboard/queue
 *
 * Server component that surfaces the user's ProcessingJob queue
 * state. Uses the existing `getJobStats()` for the totals and
 * queries recent jobs scoped to the user's trade cases.
 *
 * The `getJobStats()` is global (single-tenant dev target — the
 * whole table is the operator's data) and the "Recent jobs" list
 * is scoped to `tradeCase: { userId }`.
 *
 * For the "stale" indicator, we re-derive the same condition the
 * persistent queue uses to mark RUNNING jobs as stale (lockedAt
 * older than the 5-minute timeout). The check is local to this
 * page; the canonical stale-recovery lives in `recoverStaleJobs()`.
 */
export const dynamic = "force-dynamic";

const STALE_LOCK_MS = 5 * 60 * 1000;
const RECENT_JOBS_LIMIT = 20;
const SAFE_ERROR_PREVIEW = 140;

function statusVariant(status: string): "default" | "success" | "warning" | "error" | "outline" {
  if (status === "COMPLETED") return "success";
  if (status === "RUNNING") return "warning";
  if (status === "SCHEDULED") return "outline";
  if (status === "FAILED") return "error";
  return "default";
}

function formatDate(input: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function sanitizeError(raw: string | null): string | null {
  if (!raw) return null;
  // The lastError column is a truncated string the worker set; it
  // could in theory contain stack trace fragments. We strip the
  // typical secret markers (anything that looks like a Bearer / Basic
  // token / password=) defensively, then trim to a short preview.
  const cleaned = raw
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._\-+/=]+/gi, "Basic [REDACTED]")
    .replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  if (cleaned.length <= SAFE_ERROR_PREVIEW) return cleaned;
  return cleaned.slice(0, SAFE_ERROR_PREVIEW) + "…";
}

export default async function QueuePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/dashboard/queue");
  }
  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/dashboard/queue&reason=stale");
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/signin?callbackUrl=/dashboard/queue");
  }

  // User-scoped stats. We do not use the global `getJobStats()` for
  // the per-user view because the queue is global; the per-user
  // numbers below are the right ones for this page. The header also
  // shows the global totals so the user can see the in-process queue
  // health (single-tenant dev target — both views are useful).
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS);
  
  const [userStats, globalStats, recentJobs] = await Promise.all([
    userScopedJobStats(userId),
    getJobStats(),
    prisma.processingJob.findMany({
      where: { tradeCase: { userId } },
      orderBy: { createdAt: "desc" },
      take: RECENT_JOBS_LIMIT,
      include: {
        document: { select: { id: true, name: true, deletedAt: true } },
        tradeCase: { select: { id: true, product: { select: { name: true } }, deletedAt: true } },
      },
    }),
  ]);

  const staleRunning = recentJobs.filter(
    (j) => j.status === "RUNNING" && j.lockedAt && j.lockedAt < staleCutoff,
  );

  return (
    <div className="pb-20">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Queue" },
        ]}
      />

      <PageHeader
        title="Processing Queue"
        description="A live view of your document processing jobs. Recent jobs are scoped to your trade cases."
      />

      <section className="mb-8">
        <h2 className="font-display text-lg font-bold text-ink mb-3">Your Queue</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Scheduled" value={userStats.scheduled} />
          <StatCard label="Running" value={userStats.running} highlight={userStats.running > 0} />
          <StatCard label="Completed" value={userStats.completed} />
          <StatCard label="Failed" value={userStats.failed} highlight={userStats.failed > 0} />
          <StatCard label="Cancelled" value={userStats.cancelled} />
          <StatCard label="Total" value={userStats.total} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-lg font-bold text-ink mb-2">System Totals</h2>
        <p className="text-xs text-muted mb-3">
          Aggregate counts across the entire processing queue. In a single-tenant dev target these match your totals.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Scheduled" value={globalStats.scheduled} />
          <StatCard label="Running" value={globalStats.running} />
          <StatCard label="Completed" value={globalStats.completed} />
          <StatCard label="Failed" value={globalStats.failed} />
          <StatCard label="Cancelled" value={globalStats.cancelled} />
          <StatCard label="Total" value={globalStats.total} />
        </div>
      </section>

      {staleRunning.length > 0 && (
        <Card className="mb-6 border-warning-200 bg-warning-50">
          <CardContent className="p-4 text-sm text-warning-700">
            <strong>{staleRunning.length}</strong> running job{staleRunning.length === 1 ? " is" : "s are"} older than 5 minutes and may be stuck. The persistent queue will recover them on the next restart.
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="font-display text-lg font-bold text-ink mb-3">Recent Jobs</h2>
        {recentJobs.length === 0 ? (
          <EmptyState
            title="No processing jobs yet"
            description="When you upload documents, processing jobs will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {recentJobs.map((j) => {
              const docDeleted = j.document?.deletedAt != null;
              const caseDeleted = j.tradeCase?.deletedAt != null;
              const safeError = sanitizeError(j.lastError);
              return (
                <li key={j.id}>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={statusVariant(j.status)} aria-label={`Status: ${j.status}`}>
                            {j.status}
                          </Badge>
                          <span className="text-sm text-slate-900 truncate">
                            {j.document?.name ?? "(document removed)"}
                            {docDeleted ? " (deleted)" : ""}
                          </span>
                          {j.tradeCase?.product?.name ? (
                            <span className="text-xs text-slate-500">
                              · {j.tradeCase.product.name}
                              {caseDeleted ? " (deleted)" : ""}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 shrink-0">
                          {j.completedAt
                            ? `Finished ${formatDate(j.completedAt.toISOString())}`
                            : j.startedAt
                              ? `Started ${formatDate(j.startedAt.toISOString())}`
                              : `Created ${formatDate(j.createdAt.toISOString())}`}
                        </div>
                      </div>
                      {safeError ? (
                        <p className="mt-2 text-xs text-error-600 font-mono break-words">
                          {safeError}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider font-medium text-muted mb-1">{label}</p>
        <p className={`text-2xl font-display font-bold ${highlight ? "text-amber" : "text-ink"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

async function userScopedJobStats(userId: string): Promise<{
  scheduled: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}> {
  const rows = await prisma.processingJob.groupBy({
    by: ["status"],
    where: { tradeCase: { userId } },
    _count: { _all: true },
  });
  const out = { scheduled: 0, running: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
  for (const r of rows) {
    const n = r._count._all;
    out.total += n;
    if (r.status === "SCHEDULED") out.scheduled = n;
    else if (r.status === "RUNNING") out.running = n;
    else if (r.status === "COMPLETED") out.completed = n;
    else if (r.status === "FAILED") out.failed = n;
    else if (r.status === "CANCELLED") out.cancelled = n;
  }
  return out;
}
