import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
try {
  const users = await prisma.customerAccount.findMany({ take: 1, select: { email: true } });
  const admins = await prisma.adminAccount.findMany({ take: 1, select: { email: true, role: true } });
  console.log("CONNECT OK on port 3306");
  console.log("customers:", JSON.stringify(users.map(u => u.email)));
  console.log("admins:", JSON.stringify(admins.map(a => `${a.email} (${a.role})`)));
} catch (e) {
  console.log("FAILED. MESSAGE:", JSON.stringify(e.message));
  console.log("CODE:", e.code);
}
process.exit(0);
