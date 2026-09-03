import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  const rateLimitResult = withRateLimit(request, "verifyEmail");

  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }

  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      );
    }

    // Find user with this verification token
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    // Phase 8: collapse the three failure modes (no such token, already
    // verified, expired) into a single response to prevent an attacker
    // from probing which emails have accounts. The first two checks run
    // first because they're cheap, but the response is identical.
    const invalidResponse = NextResponse.json(
      { error: "Invalid or expired verification link" },
      { status: 400 }
    );
    if (!user) return invalidResponse;
    if (user.emailVerified) return invalidResponse;
    if (
      !user.emailVerificationExpires ||
      user.emailVerificationExpires.getTime() <= Date.now()
    ) {
      return invalidResponse;
    }

    // Mark email as verified and clear token (single-use enforced)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    log.error("auth:verify-email", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
