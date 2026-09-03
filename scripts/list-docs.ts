import { prisma } from "../src/lib/db/prisma";

async function main() {
  const docs = await prisma.document.findMany({
    select: { id: true, name: true, processingStatus: true, fileRef: true, mimeType: true },
  });
  console.log("All documents in DB:", JSON.stringify(docs, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
