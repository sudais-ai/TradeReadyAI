// Phase 8 — same-origin guard for the custom auth API routes.
//
// NextAuth's built-in CSRF token protects `/api/auth/[...nextauth]` and
// `/api/auth/csrf`, but our own JSON routes (register, forgot-password,
// reset-password, verify-email, change-password, update-name, sessions)
// accept POSTs without any cross-origin check. A malicious page that
// the user visits could trigger any of these (forcing a password change
// to a known value, etc.).
//
// This helper rejects POSTs whose `Origin` header does not match the
// request's own origin. We allow requests with NO Origin header because
// that is the normal behavior of server-to-server calls (curl, fetch
// from a CLI, the test scripts). Browsers always send Origin on a
// cross-origin XHR/fetch; they will set it to the calling page's origin.
//
// Usage at the top of a route handler:
//
//     const blocked = assertSameOrigin(request);
//     if (blocked) return blocked;

import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(
  request: NextRequest
): NextResponse | null {
  // Only enforce on state-changing methods. GETs are safe to allow from
  // anywhere; OPTIONS is a CORS preflight, not a real action.
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // No Origin header → server-to-server, CLI, or test script. Allow.
    return null;
  }

  const expected = request.nextUrl.origin;
  if (origin === expected) {
    return null;
  }

  return NextResponse.json(
    { error: "Cross-origin request blocked" },
    {
      status: 403,
      headers: {
        "X-Origin-Blocked": "1",
        Vary: "Origin",
      },
    }
  );
}
