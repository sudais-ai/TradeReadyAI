import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const u = await p.user.findFirst({ where: { email: "demo@tradeready.ai" }, select: { id: true, email: true, passwordChangedAt: true } });
console.log("demo:", u);
const u2 = await p.user.findFirst({ where: { email: "forgot-test@example.com" }, select: { id: true, email: true, passwordHash: true, passwordChangedAt: true } });
console.log("forgot-test (with hash):", { ...u2, passwordHash: u2?.passwordHash ? "***" : null });
await p.$disconnect();
