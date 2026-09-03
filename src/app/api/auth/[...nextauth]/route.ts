import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, AUTH_RATE_LIMITS } from "@/lib/rate-limit";
import { handlers } from "@/lib/auth/route";

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  // Phase 8 fix: rate-limit this handler per *action* (signin vs
  // signout vs OAuth callback) instead of collapsing every POST into
  // the "signin" bucket. Previously, a flurry of failed signins
  // (which legitimately trips the 5/15min bucket) would also block
  // the user's own signout for 15 minutes, leaving the session
  // cookie intact and the protected UI reachable. It would also block
  // the csrf endpoint (browser re-fetches a fresh token before each
  // signin attempt), making the lockout unrecoverable.
  const action = request.nextUrl.searchParams.get("action") ?? "";

  // Per-action rate-limit key so one bucket being exhausted never
  // blocks the others. csrf uses its own bucket so the endpoint
  // stays reachable while the signin bucket is locked.
  let bucket: keyof typeof AUTH_RATE_LIMITS;
  if (action === "signOut") bucket = "signout";
  else if (action === "signIn" || action === "callback") bucket = "signin";
  else bucket = "authCore"; // csrf and any other NextAuth POST

  const rateLimitResult = withRateLimit(request, bucket);

  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }

  // Continue to NextAuth handler
  return handlers.POST(request);
}