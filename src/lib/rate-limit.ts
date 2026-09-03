import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/log";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: Record<string, { count: number; resetTime: number }> = {};

/**
 * Phase 12: trust-proxy gate.
 *
 * Resolves whether the rate limiter should honor `X-Forwarded-For` /
 * `X-Real-IP` (i.e. trust the immediate upstream proxy to have set
 * them correctly), based on the `TRUST_PROXY` env var.
 *
 * Accepted values:
 *   - "0"   — never trust. Use NextRequest's own `ip` (Next 16
 *             resolves this from the connecting socket). If the
 *             connecting IP is unavailable, fall back to "unknown".
 *             Production-safe default.
 *   - "1"   — always trust. Use the first hop in X-Forwarded-For.
 *             Dev mode convenience. Do NOT use in production — any
 *             caller can spoof the header.
 *   - "ip,ip,cidr" — trust only when the connecting IP (as Next
 *             reports it) is in the allow-list. The first element of
 *             X-Forwarded-For is then used as the bucketing key.
 *             Use this behind a known reverse proxy / load balancer.
 *
 * Default when unset:
 *   - dev  → "1"  (matches the prior behavior, no surprises)
 *   - prod → "0"  (fail-closed: if you want per-IP rate limiting in
 *                  production you MUST set TRUST_PROXY to your LB's
 *                  IP/CIDR.)
 *
 * Returning a tagged union lets callers fall back gracefully when
 * we explicitly distrust the header.
 */
export type TrustProxyResult =
  | { kind: "trust"; reason: "always" | "allow-list" }
  | { kind: "distrust"; reason: "policy" | "untrusted-source" };

interface TrustProxyCache {
  value: string | null;
  parsed: TrustProxyResult;
}

const TRUST_PROXY_CACHE: TrustProxyCache = ((): TrustProxyCache => {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === "") {
    // Default: dev trusts, prod does not.
    const isDev = process.env.NODE_ENV === "development";
    return {
      value: null,
      parsed: isDev
        ? { kind: "trust", reason: "always" }
        : { kind: "distrust", reason: "policy" },
    };
  }
  if (raw === "1") {
    return { value: raw, parsed: { kind: "trust", reason: "always" } };
  }
  if (raw === "0") {
    return { value: raw, parsed: { kind: "distrust", reason: "policy" } };
  }
  // Allow-list: list of IPs/CIDRs. We'll check membership at call time.
  return { value: raw, parsed: { kind: "trust", reason: "allow-list" } };
})();

function isInAllowList(ip: string, allowList: string): boolean {
  // Phase 12: minimal allow-list. We only do exact-match (no CIDR math)
  // because the documented callers (single-host dev or a single LB
  // in front of this app) pass a single IPv4/IPv6 address. Extending
  // to CIDR would require a dep — not worth it for the dev target.
  const set = new Set(allowList.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has(ip);
}

/**
 * Resolve whether `request` comes from a source we should trust for
 * X-Forwarded-For purposes.
 */
function resolveTrustProxy(request: NextRequest): TrustProxyResult {
  const cached = TRUST_PROXY_CACHE.parsed;
  if (cached.kind === "distrust") return cached;
  if (cached.reason === "always") return cached;

  // Allow-list path: we need the connecting IP. NextRequest exposes
  // `request.ip` (Next 15+); if it's not set we distrust the header
  // and fall through to "unknown" rather than spoof.
  const connectingIp = (request as NextRequest & { ip?: string }).ip;
  if (!connectingIp) {
    return { kind: "distrust", reason: "untrusted-source" };
  }
  if (isInAllowList(connectingIp, TRUST_PROXY_CACHE.value ?? "")) {
    return { kind: "trust", reason: "allow-list" };
  }
  return { kind: "distrust", reason: "policy" };
}

function resolveClientIp(request: NextRequest): string {
  const policy = resolveTrustProxy(request);
  if (policy.kind === "trust") {
    const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
    const xri = request.headers.get("x-real-ip")?.trim();
    if (xri) return xri;
    // trust the policy, but no header to honor
  }
  // Distrust (or trust-but-no-header): prefer Next's resolved IP, then
  // x-real-ip as a last-ditch (someone configured their LB without
  // X-Forwarded-For; we still need a stable key), then "unknown".
  const nextIp = (request as NextRequest & { ip?: string }).ip;
  if (nextIp) return nextIp;
  const fallbackXri = request.headers.get("x-real-ip")?.trim();
  if (fallbackXri && policy.kind === "trust") return fallbackXri;
  return "unknown";
}

export function rateLimit(
  request: NextRequest,
  options: {
    windowMs: number;
    maxRequests: number;
    keyPrefix?: string;
  }
): { success: boolean; remaining: number; resetTime: number } | NextResponse {
  const { windowMs, maxRequests, keyPrefix = "auth" } = options;

  const ip = resolveClientIp(request);

  const key = `${keyPrefix}:${ip}`;

  if (!store[key] || store[key].resetTime < Date.now()) {
    store[key] = {
      count: 0,
      resetTime: Date.now() + windowMs,
    };
  }

  store[key].count++;

  const remaining = Math.max(0, maxRequests - store[key].count);
  const resetTime = store[key].resetTime;

  if (store[key].count > maxRequests) {
    const retryAfter = Math.ceil((store[key].resetTime - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((store[key].resetTime - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": Math.ceil(store[key].resetTime / 1000).toString(),
        },
      }
    );
  }

  return {
    success: true,
    remaining: Math.max(0, maxRequests - store[key].count),
    resetTime: store[key].resetTime,
  };
}

export const AUTH_RATE_LIMITS = {
  signin: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  signup: { windowMs: 60 * 60 * 1000, maxRequests: 3 },
  forgotPassword: { windowMs: 60 * 60 * 1000, maxRequests: 3 },
  resetPassword: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  verifyEmail: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  // Phase 8: separate buckets for the account-update routes. The
  // signin/signup/etc buckets should not be drained by routine name
  // edits or password changes.
  accountName: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  accountPassword: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  signout: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  // The NextAuth core endpoints (csrf + session JSON reads). These must
  // remain reachable even when the signin bucket is exhausted, otherwise
  // a long-lived signin lockout also blocks /api/auth/csrf (the
  // browser must fetch a fresh token before retrying) AND the
  // sign-out button (so the user can never end the locked session).
  authCore: { windowMs: 60 * 1000, maxRequests: 60 },
} as const;

export function withRateLimit(
  request: Request,
  endpoint: keyof typeof AUTH_RATE_LIMITS
) {
  const config = AUTH_RATE_LIMITS[endpoint];
  return rateLimit(request as NextRequest, {
    ...config,
    keyPrefix: `auth:${endpoint}`,
  });
}

/**
 * Phase 14: clear the in-memory rate-limit store. Test-only; do not
 * call from production code paths. The verification script invokes
 * this to ensure back-to-back test runs are not 429'd by stale state
 * from a prior run. The route-level rate limits are per-IP and the
 * dev target uses 127.0.0.1, so without this helper a previous
 * test run's call would block the next run for the full window.
 */
export function _resetRateLimitStore(): void {
  for (const k of Object.keys(store)) delete store[k];
}