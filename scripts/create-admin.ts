/**
 * Create the first Super Admin (or additional admins).
 * Usage: npx tsx scripts/create-admin.ts <email> <password>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://callendra_user:callendra123@localhost:5432/callendra",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email> <password>");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const row = await prisma.superAdmin.upsert({
    where: { email },
    create: { email, password: hashed },
    update: { password: hashed },
  });

  console.log("SuperAdmin OK:", row.email, row.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
