import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/route";
import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";

/**
 * Active sessions are managed by a secure, signed JWT cookie in this
 * application. We deliberately do not persist per-device session records
 * (the Prisma `Session` table exists for future DB-session support but
 * is not written to today).
 *
 * To keep the UI honest, this endpoint returns a notice explaining the
 * model plus the count of DB-stored session records (currently always 0)
 * for transparency.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sessionToken: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expires: true,
      },
    });

    // Mask session tokens for security
    const sanitizedSessions = sessions.map((session) => ({
      ...session,
      sessionToken: session.sessionToken.substring(0, 8) + "...",
    }));

    // Phase 8: also surface the user's passwordChangedAt so the UI can
    // show "last password change" if it wants. The session claim is the
    // authoritative "what the JWT thinks"; the DB row is the truth.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordChangedAt: true },
    });

    return NextResponse.json({
      sessions: sanitizedSessions,
      passwordChangedAt: user?.passwordChangedAt ?? null,
      notice:
        "Your active session is managed by a secure JWT cookie. To sign out of this device, use the sign-out button in the account menu.",
    });
  } catch (error) {
    log.error("auth:sessions:list", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const sessionToDelete = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!sessionToDelete || sessionToDelete.userId !== session.user.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Delete the session
    await prisma.session.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    log.error("auth:sessions:revoke", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
