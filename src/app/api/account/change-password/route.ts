import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/route";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { withRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";
import { buildPasswordChangedEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { recordAuditEvent } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  const rateLimitResult = withRateLimit(request, "accountPassword");
  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Password login is not available for this account" },
        { status: 400 }
      );
    }

    const currentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    const changedAt = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Phase 8: rotate passwordChangedAt so any active JWT sessions are
        // invalidated by the middleware's stale-session check.
        passwordChangedAt: changedAt,
      },
    });

    // Phase 12: notify the user. Fire-and-log — we never want an
    // email outage to roll back a successful password change. The
    // change is already committed; the worst case is the user doesn't
    // get the heads-up.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    if (user.email) {
      const tpl = buildPasswordChangedEmail({
        recipientName: user.name ?? null,
        changedAt,
        ip,
        isReset: false,
      });
      const result = await sendEmail({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      if (!result.success) {
        log.warn("auth:change-password", "password-changed email failed (non-fatal)", {
          userId: user.id,
          error: result.error,
        });
      }
    }

    // Phase 13: audit the password change. Best-effort.
    await recordAuditEvent({
      userId: user.id,
      action: "PASSWORD_CHANGED",
      target: "User",
      targetId: user.id,
      ip: ip ?? null,
      userAgent: request.headers.get("user-agent"),
      metadata: { isReset: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("auth:change-password", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
