import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { sendEmail, isEmailDevMode } from "@/lib/email/service";
import { buildVerificationEmail } from "@/lib/email/templates";
import { log, redactUrlQuery } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";
import crypto from "crypto";

const VERIFICATION_TTL_HOURS = 24;

function getAppBaseUrl(request: NextRequest): string {
  const fromEnv =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  try {
    const body = await request.json();
    const { name, email, password } = body;

    // Validate input
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate email verification token (single-use, 24h expiry)
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000
    );

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash,
        emailVerificationToken,
        emailVerificationExpires,
        passwordChangedAt: new Date(),
      },
    });

    // Send verification email (best-effort — signup succeeds even if email fails)
    const baseUrl = getAppBaseUrl(request);
    const verifyUrl = `${baseUrl}/auth/verify-email/${emailVerificationToken}`;

    const { subject, html, text } = buildVerificationEmail({
      verifyUrl,
      expiresInHours: VERIFICATION_TTL_HOURS,
      recipientName: user.name,
    });

    const emailResult = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
    });

    if (!emailResult.success) {
      log.error("auth:register", "verification email failed", {
        email: user.email,
        error: emailResult.error,
      });
    } else {
      log.info("auth:register", "verification link sent", {
        email: user.email,
        // Phase 8: never log the raw token.
        devLink: isEmailDevMode() ? redactUrlQuery(verifyUrl) : undefined,
      });
    }

    const dev = isEmailDevMode();
    const responseBody: Record<string, unknown> = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerified,
      },
    };
    if (dev) {
      // Dev surface: expose the verify link so end-to-end tests can complete
      // the flow without a real inbox. Never set in production.
      responseBody.dev = true;
      responseBody.devVerifyUrl = verifyUrl;
    }
    return NextResponse.json(responseBody);
  } catch (error) {
    log.error("auth:register", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
