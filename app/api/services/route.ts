import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner, isOwnerMainBusinessSession } from "@/lib/main-business";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      const services = await prisma.service.findMany({
        where: { businessId: mainId, active: true },
        orderBy: { name: "asc" },
        include: {
          serviceLocations: {
            where: { active: true },
            select: { businessId: true, price: true },
          },
        },
      });
      return NextResponse.json(
        services.map(({ serviceLocations: locs, ...s }) => ({
          ...s,
          locationPricing: locs.map((l) => ({
            businessId: l.businessId,
            price: l.price,
          })),
        }))
      );
    }

    const rows = await prisma.serviceLocation.findMany({
      where: { businessId: sessionBusinessId, active: true },
      include: { service: true },
      orderBy: { service: { name: "asc" } },
    });
    const services = rows
      .filter((r) => r.service.active)
      .map((r) => ({
        ...r.service,
        price: r.price ?? r.service.price,
        locationPriceOverride: r.price,
      }));
    return NextResponse.json(services);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId || !isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      return NextResponse.json({ error: "Services can only be created from the main business" }, { status: 403 });
    }

    const { name, price, duration } = await req.json();
    if (!name || !price || !duration) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        businessId: mainId,
        name,
        price: parseFloat(price),
        duration: parseInt(duration, 10),
        active: true,
      },
    });

    await prisma.serviceLocation.create({
      data: {
        serviceId: service.id,
        businessId: mainId,
        price: null,
        active: true,
      },
    });

    return NextResponse.json(service);
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
    if (!current || current.ownerId !== ownerId || !isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await req.json();
    const row = await prisma.service.findFirst({ where: { id, businessId: mainId } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.serviceLocation.updateMany({
      where: { serviceId: id },
      data: { active: false },
    });

    await prisma.service.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
