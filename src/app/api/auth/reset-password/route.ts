import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validatePassword } from "@/lib/auth/password";
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

  const rateLimitResult = withRateLimit(request, "resetPassword");
  
  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }
  
  try {
    const body = await request.json();
    const { token, password } = body;

    // Validate input
    if (!token) {
      return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);
    const changedAt = new Date();

    // Update user with new password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Phase 8: rotate passwordChangedAt so any active JWT sessions are
        // invalidated by the middleware's stale-session check.
        passwordChangedAt: changedAt,
      },
    });

    // Phase 12: notify the user. Fire-and-log. The password has
    // already been reset; the email is informational.
    if (user.email) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        null;
      const tpl = buildPasswordChangedEmail({
        recipientName: user.name ?? null,
        changedAt,
        ip,
        isReset: true,
      });
      const result = await sendEmail({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      if (!result.success) {
        log.warn("auth:reset-password", "password-changed email failed (non-fatal)", {
          userId: user.id,
          error: result.error,
        });
      }
    }

    // Phase 13: audit the password reset. Best-effort.
    await recordAuditEvent({
      userId: user.id,
      action: "PASSWORD_RESET",
      target: "User",
      targetId: user.id,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          null,
      userAgent: request.headers.get("user-agent"),
      metadata: { isReset: true },
    });

    return NextResponse.json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    log.error("auth:reset-password", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}