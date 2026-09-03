import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import { withRateLimit } from "@/lib/rate-limit";
import { sendEmail, isEmailDevMode } from "@/lib/email/service";
import { buildPasswordResetEmail } from "@/lib/email/templates";
import { log, redactUrlQuery } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";

const TOKEN_TTL_MINUTES = 60;

function getAppBaseUrl(request: NextRequest): string {
  // Prefer an explicit env override (works in production behind a proxy).
  const fromEnv =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // Fall back to the request origin so the reset link always points at the
  // host the user is currently using (handles LAN dev access automatically).
  const origin = request.nextUrl.origin;
  return origin.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  const rateLimitResult = withRateLimit(request, "forgotPassword");

  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }

  try {
    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const dev = isEmailDevMode();
    let devResetUrl: string | null = null;

    // Always return success to prevent email enumeration, but only generate
    // a token and send the email if the user actually exists.
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: expires,
        },
      });

      const baseUrl = getAppBaseUrl(request);
      const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

      const { subject, html, text } = buildPasswordResetEmail({
        resetUrl,
        expiresInMinutes: TOKEN_TTL_MINUTES,
        recipientName: user.name,
      });

      const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
      });

      if (!result.success) {
        log.error("auth:forgot-password", "email send failed", {
          email: user.email,
          error: result.error,
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordResetToken: null, passwordResetExpires: null },
        });
      } else {
        log.info("auth:forgot-password", "reset link sent", {
          email: user.email,
          // Phase 8: never log the raw token.
          devLink: dev ? redactUrlQuery(resetUrl) : undefined,
        });
      }

      if (dev) devResetUrl = resetUrl;
    }

    // In dev mode we return the reset link directly so the end-to-end flow
    // can be verified without a real SMTP server or mailbox.
    if (dev) {
      return NextResponse.json({
        success: true,
        message: "If an account exists with that email, you'll receive a password reset link shortly.",
        dev: true,
        devResetUrl,
      });
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with that email, you'll receive a password reset link shortly.",
    });
  } catch (error) {
    log.error("auth:forgot-password", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
