import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { auth } from "@/lib/auth/route";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: tradeCaseId, documentId } = await params;

  try {
    // Security: enforce signed-in session.
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "You must be signed in to view this file." }, { status: 401 });
    }
    const userId = session.user.id as string;

    // 1. Verify Document exists and belongs to Trade Case owned by this user.
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        tradeCaseId: tradeCaseId,
        tradeCase: { userId },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    // 2. Defense-in-depth: also verify Trade Case ownership directly.
    const tradeCase = await prisma.tradeCase.findFirst({
      where: { id: tradeCaseId, userId },
    });

    if (!tradeCase) {
      return NextResponse.json({ error: "Trade case not found." }, { status: 404 });
    }

    // 3. Verify Document has a stored physical file
    if (!document.fileRef) {
      return NextResponse.json({ error: "No physical file found for this document." }, { status: 404 });
    }

    // 4. Retrieve file from storage
    const fileBuffer = await storage.get(document.fileRef);
    if (!fileBuffer) {
      return NextResponse.json({ error: "Physical file is missing from storage." }, { status: 404 });
    }

    // 5. Serve the file with proper headers
    const headers = new Headers();
    if (document.mimeType) {
      headers.set("Content-Type", document.mimeType);
    }
    
    // Set safe Content-Disposition
    // Using inline for PDFs/images, attachment for others can be decided by the browser based on mime,
    // but typically we can just specify inline and provide the filename.
    const encodedName = encodeURIComponent(document.name);
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    
    if (document.size) {
      headers.set("Content-Length", document.size.toString());
    }

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error serving document file:", error);
    return NextResponse.json({ error: "Failed to retrieve document file." }, { status: 500 });
  }
}
