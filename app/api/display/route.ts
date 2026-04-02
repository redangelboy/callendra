import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocationCatalog } from "@/lib/location-catalog";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const row = await prisma.business.findUnique({
      where: { slug },
    });

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { staff } = await loadLocationCatalog(prisma, row.id);
    const business = { ...row, staff };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: "cancelled" }
      },
      include: { service: true, staff: true },
      orderBy: { date: "asc" }
    });

    return NextResponse.json({ business, appointments });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
