import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner } from "@/lib/main-business";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

async function assertOwnerLocation(ownerId: string, businessId: string) {
  return prisma.business.findFirst({
    where: { id: businessId, ownerId, active: true },
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
      serviceId,
      businessId: locationId,
      price,
      active = true,
    } = await req.json();

    if (!serviceId || !locationId) {
      return NextResponse.json({ error: "serviceId and businessId are required" }, { status: 400 });
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId: mainId },
    });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const loc = await assertOwnerLocation(ownerId, locationId);
    if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    const priceVal =
      price === undefined || price === null || price === ""
        ? null
        : typeof price === "number"
          ? price
          : parseFloat(String(price));

    const row = await prisma.serviceLocation.upsert({
      where: {
        serviceId_businessId: { serviceId, businessId: locationId },
      },
      create: {
        serviceId,
        businessId: locationId,
        price: priceVal,
        active,
      },
      update: { price: priceVal, active },
    });

    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { serviceId, businessId: locationId } = await req.json();
    if (!serviceId || !locationId) {
      return NextResponse.json({ error: "serviceId and businessId are required" }, { status: 400 });
    }

    await prisma.serviceLocation.updateMany({
      where: { serviceId, businessId: locationId },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
