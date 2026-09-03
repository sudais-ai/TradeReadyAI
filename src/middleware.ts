import { auth } from "@/lib/auth/route";
import { NextResponse } from "next/server";

/**
 * Validate a `callbackUrl` query parameter to prevent open-redirect attacks.
 *
 * Accepts only same-origin relative paths. Rejects:
 *   - protocol-relative URLs (`//evil.com/path`)
 *   - absolute URLs (`https://evil.com`)
 *   - backslash-prefixed paths (`\\evil.com` or `/\\evil.com`)
 *   - javascript: URIs
 *   - empty / null values
 *
 * On any rejection, falls back to /dashboard.
 */
function safeCallbackUrl(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  // Must start with exactly one `/` and NOT `//`
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  // Reject backslash variants (some browsers normalize `\` to `/`)
  if (value.includes("\\")) return "/dashboard";
  // Defensive: reject any URL that contains a colon before the first `/`
  if (value.includes(":")) return "/dashboard";
  return value;
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const isAuthPage = pathname.startsWith("/auth");
  const isApiAuthRoute = pathname.startsWith("/api/auth");

  // Safety net: short-circuit for static assets served from /public.
  // The matcher already excludes these paths, but a defense-in-depth
  // early-return guards against future matcher regressions silently
  // blocking the home/auth background videos.
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/assets/") ||
    pathname === "/bg-video.mp4" ||
    /\.(?:mp4|webm|ogg|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Allow API auth routes (NextAuth, register, forgot-password, etc.)
  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  // If the user is already signed in, bounce them off the auth pages.
  // /auth/error stays accessible because it's the destination for failed
  // sign-ins and the user may not be authenticated at that point.
  if (isAuthPage && isLoggedIn && pathname !== "/auth/error") {
    const callbackUrl = safeCallbackUrl(
      req.nextUrl.searchParams.get("callbackUrl")
    );
    return NextResponse.redirect(new URL(callbackUrl, req.nextUrl.origin));
  }

  const isRootPage = pathname === "/";

  // Allow unauthenticated access to auth pages and the landing page.
  if (isAuthPage || (isRootPage && !isLoggedIn)) {
    return NextResponse.next();
  }

  // Redirect logged-in users from the landing page to their dashboard.
  if (isRootPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Redirect unauthenticated users to sign in for all other protected routes.
  if (!isLoggedIn) {
    const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Phase 8 stale-session check lives in src/lib/auth/session.ts
  // (isSessionStale). It cannot run in Edge middleware because Prisma is
  // not Edge-compatible. Instead, every server action / route handler /
  // RSC page that needs the current user must call requireAuth() or
  // getCurrentUserId(), both of which now perform the staleness check
  // against the live DB.

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - assets (project public/assets directory — videos, etc.)
     * - video files served from the public root
     * - svg / image / font assets served from the public root
     * - api/health (Phase 12: liveness probe, must be auth-free)
     */
    // Phase 12: api/health is excluded so the liveness probe works
    // without auth (load balancers, uptime monitors, k8s probes all
    // call this without a session).
    "/((?!_next/static|_next/image|favicon.ico|api/health|assets|bg-video\\.mp4|.*\\.(?:mp4|webm|ogg|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)).*)",
  ],
};
