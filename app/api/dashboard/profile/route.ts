import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner } from "@/lib/main-business";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session);
    const { businessId } = parsed;
    const ownerIdFromSession = parsed.ownerId as string | undefined;
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ownerId = ownerIdFromSession ?? business.ownerId;
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    const isMainBusiness = mainId != null && business.id === mainId;
    let notificationPhone: string | null = null;
    if (ownerIdFromSession) {
      const o = await prisma.owner.findUnique({
        where: { id: ownerIdFromSession },
        select: { phone: true },
      });
      notificationPhone = o?.phone ?? null;
    }
    return NextResponse.json({
      ...business,
      isMainBusiness,
      ...(ownerIdFromSession ? { notificationPhone } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session);
    const { businessId, ownerId } = parsed as { businessId: string; ownerId?: string };
    const body = await req.json();
    const {
      name,
      phone,
      address,
      logo,
      retellPhoneNumber,
      notificationPhone,
    } = body;

    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        name,
        phone,
        address,
        logo,
        retellPhoneNumber: retellPhoneNumber || null,
      },
    });

    if (ownerId && "notificationPhone" in body) {
      const current = await prisma.business.findUnique({
        where: { id: businessId },
        select: { ownerId: true },
      });
      if (current?.ownerId === ownerId) {
        const phoneVal =
          notificationPhone != null && String(notificationPhone).trim()
            ? String(notificationPhone).trim()
            : null;
        await prisma.owner.update({ where: { id: ownerId }, data: { phone: phoneVal } });
      }
    }

    return NextResponse.json(business);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
