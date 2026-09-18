import { PrismaClient } from "@prisma/client";
const candidates = ["", "root", "password", "123456", "root123", "admin", "Aq123456", "mysql", "12345678"];
for (const pw of candidates) {
  const url = `mysql://root:${encodeURIComponent(pw)}@127.0.0.1:3306/jood`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const n = await prisma.customerAccount.count();
    console.log(`PW="${pw||"(empty)"}" => OK, customer_accounts rows = ${n}`);
    await prisma.$disconnect();
    process.exit(0);
  } catch {
    await prisma.$disconnect();
  }
}
console.log("NONE matched");
process.exit(0);
