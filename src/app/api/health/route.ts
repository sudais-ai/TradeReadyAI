/**
 * Liveness + DB-readiness probe (Phase 12) + operator signals (Phase 14).
 *
 * Phase 12: minimal operator surface for "is this process up and able to
 * talk to its database?". Deliberately cheap — no auth, no external
 * pings, no full-stack smoke test.
 *
 * Phase 14: extended with a `signals` block that surfaces four
 * operator-visible aggregate numbers:
 *   - queue:  counts by status + a stale RUNNING indicator
 *   - fts:    FTS5 row count vs DocumentChunk count (drift)
 *   - email:  dev/SMTP mode flag (no secrets)
 *   - audit:  total audit log row count
 *
 * The route is still read-only. No FTS rebuild, no queue mutation.
 *
 * Response contract:
 *   200 OK   — process is up AND the database answers SELECT 1 within
 *              `dbTimeoutMs`. The status field is "ok" if all signals
 *              are healthy, "degraded" if any signal is unhealthy.
 *   503      — process is up but the database probe failed (timeout
 *              or error). The status field is "degraded".
 *
 * The middleware short-circuits this path before the auth check (see
 * `src/middleware.ts` matcher) so unauthenticated probes work.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { ftsCount } from "@/lib/rag/keyword-retriever";
import { getJobStats, JOB_STATUS } from "@/lib/document-processing/persistent-queue";
import { isEmailDevMode } from "@/lib/email/service";

// Force dynamic — we never want this cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_TIMEOUT_MS = 2000;
const SIGNAL_TIMEOUT_MS = 1500;

interface Signal<T> {
  ok: boolean;
  value: T | null;
  error: string | null;
  timedOut: boolean;
}

interface HealthSignals {
  queue: Signal<{
    scheduled: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
    stale: number;
  }>;
  fts: Signal<{ ftsRowCount: number; chunkRowCount: number; drift: number }>;
  email: Signal<{ mode: "dev" | "smtp" }>;
  audit: Signal<{ count: number }>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function collectSignal<T>(label: string, fn: () => Promise<T>): Promise<Signal<T>> {
  const result: Signal<T> = { ok: false, value: null, error: null, timedOut: false };
  try {
    const value = await withTimeout(fn(), SIGNAL_TIMEOUT_MS, label);
    result.value = value;
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    if (result.error.includes("timed out")) result.timedOut = true;
  }
  return result;
}

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  const dbStartedAt = Date.now();

  let dbOk = false;
  let dbError: string | null = null;
  let dbTimedOut = false;

  try {
    // Race the probe against a timeout. prisma's $queryRaw returns a
    // promise that, on SQLite, blocks the event loop while the file
    // lock is held; the timeout race is still useful for the case
    // where the process is starved and the call never returns.
    const probe = prisma.$queryRaw`SELECT 1 as ok`;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        dbTimedOut = true;
        reject(new Error(`db probe timed out after ${DB_TIMEOUT_MS}ms`));
      }, DB_TIMEOUT_MS);
    });
    await Promise.race([probe, timeout]);
    dbOk = true;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  const dbLatencyMs = Date.now() - dbStartedAt;

  // Signals are collected only if the DB probe passed — there's no
  // point hitting FTS / queue / audit if the database is unreachable.
  let signals: HealthSignals | null = null;
  if (dbOk) {
    const STALE_LOCK_MS = 5 * 60 * 1000;
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS);
    const [queue, fts, email, audit] = await Promise.all([
      collectSignal("queue", async () => {
        const stats = await getJobStats();
        const stale = await prisma.processingJob.count({
          where: { status: JOB_STATUS.RUNNING, lockedAt: { lt: staleCutoff } },
        });
        return { ...stats, stale };
      }),
      collectSignal("fts", async () => {
        const [ftsRowCount, chunkRowCount] = await Promise.all([
          ftsCount(),
          prisma.documentChunk.count(),
        ]);
        return { ftsRowCount, chunkRowCount, drift: ftsRowCount - chunkRowCount };
      }),
      collectSignal("email", async () => ({
        mode: isEmailDevMode() ? ("dev" as const) : ("smtp" as const),
      })),
      collectSignal("audit", async () => ({ count: await prisma.auditLog.count() })),
    ]);
    signals = { queue, fts, email, audit };
  }

  // The overall "ok" is a strict conjunction: db probe must succeed
  // AND every signal that was collected must be ok. The 503 path is
  // reserved for "db probe failed" so a k8s liveness probe can detect
  // a wedged DB connection. A failed signal is a 200 with status
  // "degraded" — the process is up, the DB is up, but something is
  // out of sync (e.g. FTS drift). Operators can re-run the rebuild.
  const allSignalsOk = signals ? Object.values(signals).every((s) => s.ok) : false;
  const ftsHealthy = !signals || (signals.fts.ok && (signals.fts.value?.drift ?? 0) === 0);
  const healthy = dbOk && (signals == null || (allSignalsOk && ftsHealthy));
  const status = healthy ? 200 : 503;
  const statusText = healthy ? "ok" : "degraded";

  const body = {
    status: statusText,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
      timedOut: dbTimedOut,
      error: dbError,
    },
    env: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    },
    signals: signals
      ? {
          queue: {
            ok: signals.queue.ok,
            timedOut: signals.queue.timedOut,
            error: signals.queue.error,
            value: signals.queue.value,
          },
          fts: {
            ok: signals.fts.ok,
            timedOut: signals.fts.timedOut,
            error: signals.fts.error,
            value: signals.fts.value,
          },
          email: {
            ok: signals.email.ok,
            timedOut: signals.email.timedOut,
            error: signals.email.error,
            value: signals.email.value,
          },
          audit: {
            ok: signals.audit.ok,
            timedOut: signals.audit.timedOut,
            error: signals.audit.error,
            value: signals.audit.value,
          },
        }
      : null,
  };

  // We log the probe result only on the unhealthy path (or first
  // healthy hit after a prior unhealthy one) so we don't flood the
  // log on every poll.
  if (!healthy) {
    log.warn("health", "probe not healthy", {
      dbError,
      ftsHealthy,
      signals: signals
        ? {
            queueOk: signals.queue.ok,
            ftsOk: signals.fts.ok,
            emailOk: signals.email.ok,
            auditOk: signals.audit.ok,
          }
        : null,
    });
  }

  return NextResponse.json(body, { status });
}
