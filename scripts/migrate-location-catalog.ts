/**
 * One-time data migration after adding StaffAssignment / ServiceLocation.
 * Run: npx tsx scripts/migrate-location-catalog.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://callendra_user:callendra123@localhost:5432/callendra",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const owners = await prisma.owner.findMany({ select: { id: true } });

  for (const { id: ownerId } of owners) {
    const businesses = await prisma.business.findMany({
      where: { ownerId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (businesses.length === 0) continue;

    const main =
      businesses.find((b) => b.locationSlug === "") ?? businesses[0];
    const mainId = main.id;
    const nonMain = businesses.filter((b) => b.id !== mainId);

    for (const b of nonMain) {
      const staffList = await prisma.staff.findMany({ where: { businessId: b.id } });
      for (const s of staffList) {
        await prisma.staff.update({
          where: { id: s.id },
          data: { businessId: mainId },
        });
        await prisma.staffAssignment.upsert({
          where: {
            staffId_businessId: { staffId: s.id, businessId: b.id },
          },
          create: { staffId: s.id, businessId: b.id, active: true },
          update: { active: true },
        });
      }

      const svcList = await prisma.service.findMany({ where: { businessId: b.id } });
      for (const s of svcList) {
        await prisma.service.update({
          where: { id: s.id },
          data: { businessId: mainId },
        });
        await prisma.serviceLocation.upsert({
          where: {
            serviceId_businessId: { serviceId: s.id, businessId: b.id },
          },
          create: { serviceId: s.id, businessId: b.id, price: null, active: true },
          update: { active: true, price: null },
        });
      }
    }

    const mainStaff = await prisma.staff.findMany({ where: { businessId: mainId } });
    for (const s of mainStaff) {
      await prisma.staffAssignment.upsert({
        where: {
          staffId_businessId: { staffId: s.id, businessId: mainId },
        },
        create: { staffId: s.id, businessId: mainId, active: true },
        update: { active: true },
      });
    }

    const mainSvc = await prisma.service.findMany({ where: { businessId: mainId } });
    for (const s of mainSvc) {
      await prisma.serviceLocation.upsert({
        where: {
          serviceId_businessId: { serviceId: s.id, businessId: mainId },
        },
        create: { serviceId: s.id, businessId: mainId, price: null, active: true },
        update: { active: true, price: null },
      });
    }
  }

  console.log("migrate-location-catalog: done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
