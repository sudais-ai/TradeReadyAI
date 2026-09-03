import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/route";
import { prisma } from "@/lib/db/prisma";
import { withRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(request: NextRequest) {
  // Phase 8: same-origin guard.
  const originBlocked = assertSameOrigin(request);
  if (originBlocked) return originBlocked;

  const rateLimitResult = withRateLimit(request, "accountName");
  if (rateLimitResult instanceof NextResponse) {
    return rateLimitResult;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (typeof name !== "string") {
      return NextResponse.json({ error: "Name must be a string" }, { status: 400 });
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    if (trimmed.length > 100) {
      return NextResponse.json({ error: "Name is too long" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: trimmed },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("auth:update-name", "unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
