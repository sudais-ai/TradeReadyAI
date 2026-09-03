"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Phase 18: inline skeleton for the in-page refetch path. The route-level
 * `loading.tsx` (Step 3) covers the *initial* server fetch; this component
 * covers the client-side `isLoading` state when the user does an in-page
 * action that re-fetches /api/auth/sessions. Both apply to different
 * moments — first nav vs. client refetch.
 *
 * Composed from the shared `Skeleton` primitive. Renders placeholders only
 * (no fake session data) so the loading state cannot leak another user's
 * session info.
 */
function SessionsCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading sessions"
      className="space-y-3"
    >
      <span className="sr-only">Loading sessions…</span>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-border bg-white">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-28 bg-slate-100" />
                  </div>
                </div>
                <div className="hidden sm:block space-y-1.5">
                  <Skeleton className="h-3 w-24 bg-slate-100" />
                  <Skeleton className="h-3 w-32 bg-slate-100" />
                </div>
              </div>
              <div className="flex items-center gap-3 sm:ml-4">
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hour = d.getHours();
  const minute = d.getMinutes().toString().padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${month} ${day}, ${year} ${hour}:${minute} ${ampm}`;
}

interface Session {
  id: string;
  sessionToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expires: string;
}

interface SessionsResponse {
  sessions: Session[];
  notice?: string;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Phase 17: replace window.confirm() with an accessible inline modal.
  // The modal is keyboard-navigable (Escape cancels, Enter confirms),
  // focus is moved to the safe (Cancel) button on open, and the page's
  // main content is not blocked from screen readers via aria-modal.
  const [pendingRevoke, setPendingRevoke] = useState<{
    sessionId: string;
    browser: string;
  } | null>(null);
  const cancelRevokeRef = useRef<HTMLButtonElement | null>(null);
  // Inline success notice after a revoke completes.
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/sessions");

      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }

      const data: SessionsResponse = await response.json();
      setSessions(data.sessions);
      setNotice(data.notice ?? null);
    } catch {
      setError("Failed to load sessions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // Phase 17: the Revoke button now opens an accessible confirmation
  // modal instead of calling window.confirm(). The actual DELETE
  // happens in confirmRevoke() once the user clicks the modal's
  // "Revoke session" button.
  const requestRevoke = (session: Session) => {
    setError(null);
    setSuccessNotice(null);
    setPendingRevoke({
      sessionId: session.id,
      browser: getBrowserInfo(session.userAgent),
    });
  };

  const cancelRevoke = () => {
    if (revokingId !== null) return; // don't allow cancel mid-flight
    setPendingRevoke(null);
  };

  const confirmRevoke = async () => {
    if (!pendingRevoke) return;
    const { sessionId, browser } = pendingRevoke;
    setPendingRevoke(null);
    try {
      setRevokingId(sessionId);
      const response = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke session");
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSuccessNotice(`Revoked ${browser} session.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  // Phase 17: while the modal is open, focus the safe (Cancel) button
  // and let Escape dismiss it. This replaces the keyboard behavior of
  // window.confirm() with something screen-reader-friendly.
  useEffect(() => {
    if (!pendingRevoke) return;
    cancelRevokeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelRevoke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingRevoke]);

  const handleSignOutThisDevice = async () => {
    try {
      setIsSigningOut(true);
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { csrfToken } = await csrfRes.json();
      const formData = new URLSearchParams();
      formData.set("csrfToken", csrfToken);
      formData.set("callbackUrl", "/auth/signin");
      formData.set("json", "true");
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      // Phase 17: soft navigation. The signout endpoint cleared the
      // session cookie in the browser's cookie store on the response,
      // so the RSC for /auth/signin (which is a public page) doesn't
      // need a full reload to see the cleared state.
      router.push("/auth/signin");
    } catch {
      router.push("/auth/signin");
    } finally {
      setIsSigningOut(false);
    }
  };

  const getBrowserInfo = (userAgent: string | null) => {
    if (!userAgent) return "Unknown";
    if (userAgent.includes("Chrome")) return "Chrome";
    if (userAgent.includes("Firefox")) return "Firefox";
    if (userAgent.includes("Safari")) return "Safari";
    if (userAgent.includes("Edge")) return "Edge";
    return "Other";
  };

  const getOSInfo = (userAgent: string | null) => {
    if (!userAgent) return "Unknown";
    if (userAgent.includes("Windows")) return "Windows";
    if (userAgent.includes("Mac")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) return "iOS";
    return "Other";
  };

  return (
    <div className="pb-20">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Active Sessions" },
        ]}
      />

      <PageHeader
        title="Active Sessions"
        description="Manage your active sessions across all devices"
      />

      {notice && (
        <div
          role="status"
          className="mb-6 p-3 bg-primary-50 text-primary-800 text-sm rounded-md border border-primary-200"
        >
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-error-50 text-error-600 text-sm rounded-md" role="alert">
          {error}
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="mb-6 p-3 bg-success-50 text-success-700 text-sm rounded-md border border-success-200"
        >
          {successNotice}
        </div>
      )}

      {isLoading ? (
        <SessionsCardSkeleton count={3} />
      ) : sessions.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No persisted sessions to list"
            description="Your current device's session lives in a secure JWT cookie and is the only active session at the moment."
          />
          <Card className="border-border bg-white">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">This device</p>
                <p className="text-xs text-slate-500">
                  Your active session on this browser. Use the button to sign out.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-error-600 border-error-200 hover:bg-error-50"
                onClick={handleSignOutThisDevice}
                disabled={isSigningOut}
              >
                {isSigningOut ? "Signing out..." : "Sign out of this device"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id} className="border-border bg-white">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                        <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-display font-medium text-ink truncate max-w-xs">{getBrowserInfo(session.userAgent)}</p>
                        <p className="text-xs text-ink-soft">{getOSInfo(session.userAgent)}</p>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      <p>IP: {session.ipAddress || "Unknown"}</p>
                      <p>Created: {formatDateTime(session.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:ml-4">
                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                      <p>Expires: {formatDateTime(session.expires)}</p>
                      <Badge variant={new Date(session.expires) > new Date() ? "success" : "default"}>
                        {new Date(session.expires) > new Date() ? "Active" : "Expired"}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error-600 hover:bg-error-50"
                      onClick={() => requestRevoke(session)}
                      disabled={revokingId === session.id}
                    >
                      {revokingId === session.id ? "Revoking..." : "Revoke"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Phase 17: confirmation modal. Replaces window.confirm() with
          a keyboard-accessible, screen-reader-friendly dialog. Focus
          is on the safe (Cancel) button on open; Escape dismisses. */}
      {pendingRevoke && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="revoke-modal-title"
          aria-describedby="revoke-modal-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={cancelRevoke}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-border">
            <h2
              id="revoke-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              Revoke {pendingRevoke.browser} session?
            </h2>
            <p
              id="revoke-modal-desc"
              className="mt-2 text-sm text-slate-600"
            >
              The device will be signed out immediately and will need to
              sign in again to use TradeReady AI. This cannot be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                ref={cancelRevokeRef}
                variant="outline"
                size="sm"
                onClick={cancelRevoke}
                disabled={revokingId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmRevoke}
                disabled={revokingId !== null}
                isLoading={revokingId === pendingRevoke.sessionId}
              >
                {revokingId === pendingRevoke.sessionId
                  ? "Revoking..."
                  : "Revoke session"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
