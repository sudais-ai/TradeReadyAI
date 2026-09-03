"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export interface ActivityRow {
  id: string;
  action: string;
  target: string;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ActivityFeedProps {
  initialRows: ActivityRow[];
  initialNextCursor: string | null;
  initialAction: string | null;
  initialTarget: string | null;
  initialFrom: string | null;
  initialTo: string | null;
  pageSize: number;
  emailDevMode: boolean;
}

const ACTIONS = [
  "",
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
];

const TARGETS = ["", "User", "TradeCase", "Document", "ProcessingJob"];

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

function humanizeTarget(target: string): string {
  if (target === "TradeCase") return "Trade case";
  if (target === "ProcessingJob") return "Processing job";
  return target;
}

function actionVariant(action: string): "default" | "success" | "warning" | "error" | "outline" {
  if (action.endsWith("_DELETED") || action === "DOCUMENT_PROCESSING_FAILED") return "error";
  if (
    action.endsWith("_CREATED") ||
    action.endsWith("_RESTORED") ||
    action === "DOCUMENT_PROCESSING_COMPLETED" ||
    action === "PASSWORD_CHANGED" ||
    action === "PASSWORD_RESET"
  ) {
    return "success";
  }
  if (action === "STALE_JOB_RECOVERED") return "warning";
  return "outline";
}

function safeTargetHref(target: string, targetId: string | null): string | null {
  if (!targetId) return null;
  if (target === "TradeCase") return `/cases/${targetId}`;
  if (target === "Document") return null; // Document route is /cases/[id]/documents/[id]
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function formatDate(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function formatDateOnly(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function dayKey(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toDateString();
}

function dayLabel(input: string, today: Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return formatDateOnly(input);
}

export function ActivityFeed({
  initialRows,
  initialNextCursor,
  initialAction,
  initialTarget,
  initialFrom,
  initialTo,
  pageSize,
  emailDevMode,
}: ActivityFeedProps) {
  const [rows, setRows] = useState<ActivityRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<string>(initialAction ?? "");
  const [target, setTarget] = useState<string>(initialTarget ?? "");
  const [from, setFrom] = useState<string>(initialFrom ?? "");
  const [to, setTo] = useState<string>(initialTo ?? "");
  const router = useRouter();

  const applyFilters = useCallback(
    (next: { action?: string; target?: string; from?: string; to?: string }) => {
      const params = new URLSearchParams();
      const a = next.action ?? action;
      const t = next.target ?? target;
      const f = next.from ?? from;
      const tt = next.to ?? to;
      if (a) params.set("action", a);
      if (t) params.set("target", t);
      if (f) params.set("from", f);
      if (tt) params.set("to", tt);
      // Phase 16: use Next.js soft navigation (router.push) instead of
      // window.location.assign. The previous hard reload discarded the
      // entire client bundle on every filter change. router.push keeps
      // React state alive and lets Next.js refresh only the RSC payload
      // for the new query string.
      router.push(`/dashboard/activity${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [action, target, from, to, router],
  );

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("cursor", cursor);
      params.set("limit", String(pageSize));
      if (action) params.set("action", action);
      if (target) params.set("target", target);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/audit?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        // Phase 16: soft navigation to the signin page rather than a
        // full reload. The middleware will already have invalidated the
        // session cookie by the time this branch is hit.
        router.push("/auth/signin?callbackUrl=/dashboard/activity");
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data: { rows: ActivityRow[]; nextCursor: string | null } = await res.json();
      setRows((prev) => [...prev, ...data.rows]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setIsLoading(false);
    }
  }, [cursor, action, target, from, to, pageSize, router]);

  useEffect(() => {
    // Sync local state when the page is navigated with new server-side filters.
    setAction(initialAction ?? "");
    setTarget(initialTarget ?? "");
    setFrom(initialFrom ?? "");
    setTo(initialTo ?? "");
    setRows(initialRows);
    setCursor(initialNextCursor);
  }, [initialAction, initialTarget, initialFrom, initialTo, initialRows, initialNextCursor]);

  const today = new Date();
  const grouped: Array<{ label: string; rows: ActivityRow[] }> = [];
  for (const r of rows) {
    const label = dayLabel(r.createdAt, today);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else grouped.push({ label, rows: [r] });
  }

  return (
    <div>
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="Action">
              <select
                aria-label="Filter by action"
                value={action}
                onChange={(e) => applyFilters({ action: e.target.value })}
                className={selectCls}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a ? humanizeAction(a) : "All actions"}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Target">
              <select
                aria-label="Filter by target"
                value={target}
                onChange={(e) => applyFilters({ target: e.target.value })}
                className={selectCls}
              >
                {TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t ? humanizeTarget(t) : "All targets"}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="From">
              <input
                aria-label="Filter from date"
                type="date"
                value={from ? from.slice(0, 10) : ""}
                onChange={(e) =>
                  applyFilters({
                    from: e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : "",
                  })
                }
                className={inputCls}
              />
            </FilterField>
            <FilterField label="To">
              <input
                aria-label="Filter to date"
                type="date"
                value={to ? to.slice(0, 10) : ""}
                onChange={(e) =>
                  applyFilters({
                    to: e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : "",
                  })
                }
                className={inputCls}
              />
            </FilterField>
            <FilterField label=" ">
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyFilters({ action: "", target: "", from: "", to: "" })}
                className="w-full"
              >
                Clear filters
              </Button>
            </FilterField>
          </div>
          {emailDevMode && (
            <p className="mt-3 text-xs text-slate-500">
              Dev email mode is active. The address shown for system events is the local dev fallback.
            </p>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Your action log will appear here as you create, update, and restore trade cases and documents."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.label}>
              <h2 className="text-sm font-semibold text-slate-700 mb-2">{g.label}</h2>
              <ul className="space-y-2">
                {g.rows.map((r) => (
                  <ActivityRowItem key={r.id} row={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-error-600" role="alert">
          {error}
        </p>
      )}

      {cursor && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

const selectCls =
  "block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500";
const inputCls =
  "block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label.trim().length > 0 ? <span>{label}</span> : null}
      {children}
    </label>
  );
}

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const targetHref = safeTargetHref(row.target, row.targetId);
  const metaIsObject = isObject(row.metadata);
  return (
    <li>
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant={actionVariant(row.action)} aria-label={`Action: ${row.action}`}>
                {humanizeAction(row.action)}
              </Badge>
              <span className="text-sm text-slate-700">
                on {humanizeTarget(row.target)}
                {row.targetId ? (
                  targetHref ? (
                    <>
                      {" "}
                      <Link
                        href={targetHref}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        {row.targetId.slice(0, 8)}
                      </Link>
                    </>
                  ) : (
                    <>
                      {" "}
                      <span className="font-mono text-xs text-slate-500" title={row.targetId}>
                        {row.targetId.slice(0, 8)}
                      </span>
                    </>
                  )
                ) : null}
              </span>
            </div>
            <div className="text-xs text-slate-500 shrink-0">
              <time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>
              {row.ip ? <span className="ml-2 text-slate-400">· {row.ip}</span> : null}
            </div>
          </div>
          {metaIsObject ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Show metadata
              </summary>
              <pre
                className={cn(
                  "mt-2 max-h-48 overflow-auto rounded-md bg-slate-50 p-2 text-[11px] text-slate-700",
                  "font-mono whitespace-pre-wrap break-words",
                )}
              >
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            </details>
          ) : row.metadata != null ? (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-mono break-all">{String(row.metadata)}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}
