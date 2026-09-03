import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({ where: { chunks: { none: {} } } });
  console.log(docs.map(d => d.id + ': ' + d.name));
}

main().catch(console.error).finally(() => prisma.$disconnect());