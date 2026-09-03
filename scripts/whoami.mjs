import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const users = await p.user.findMany({ take: 5, select: { id: true, email: true, passwordChangedAt: true } });
console.log(JSON.stringify(users, null, 2));
await p.$disconnect();
