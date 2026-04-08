import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DateTime } from "luxon";
import { getSuperAdminFromRequest } from "@/lib/super-admin-auth";
import { BUSINESS_TIMEZONE, businessDayUtcRange } from "@/lib/business-timezone";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  const admin = await getSuperAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const todayStr = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
    const { start, end } = businessDayUtcRange(todayStr);

    const [totalBusinesses, appointmentsToday, activeInviteCodes, totalOwners] = await Promise.all([
      prisma.business.count(),
      prisma.appointment.count({
        where: {
          date: { gte: start, lte: end },
          status: { not: "cancelled" },
        },
      }),
      prisma.inviteCode.count({
        where: {
          active: true,
          usedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.owner.count(),
    ]);

    return NextResponse.json({
      totalBusinesses,
      appointmentsToday,
      activeInviteCodes,
      totalOwners,
    });
  } catch (e) {
    console.error("GET /api/admin/stats", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
