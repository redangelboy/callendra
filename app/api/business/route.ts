import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner } from "@/lib/main-business";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

function normalizeLocationSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

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

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session);
    const { businessId, ownerId } = parsed as { businessId: string; ownerId?: string };
    const body = await req.json();
    const { name, phone, address, primaryColor, secondaryColor, logo, retellPhoneNumber, notificationPhone } = body;
    const business = await prisma.business.update({
      where: { id: businessId },
      data: { name, phone, address, primaryColor, secondaryColor, logo, retellPhoneNumber: retellPhoneNumber || null },
    });
    if (ownerId && "notificationPhone" in body) {
      const current = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
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

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId } = JSON.parse(session);
    const body = await req.json();
    const { name, phone, parentSlug: bodyParent, locationSlug: bodyLoc } = body;

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!bodyParent?.trim() || !bodyLoc?.trim()) {
      return NextResponse.json(
        { error: "parentSlug and locationSlug are required when adding a location" },
        { status: 400 }
      );
    }

    const normalizedParent = bodyParent.trim();
    const normalizedLoc = normalizeLocationSlug(bodyLoc);
    if (!normalizedLoc) {
      return NextResponse.json({ error: "locationSlug must contain letters or numbers" }, { status: 400 });
    }

    const owned = await prisma.business.findMany({
      where: { ownerId, active: true },
    });

    const anchor = owned.find(
      (b) =>
        (b.parentSlug && b.parentSlug === normalizedParent) ||
        (!b.parentSlug && b.slug === normalizedParent)
    );

    if (!anchor) {
      return NextResponse.json(
        { error: "parentSlug does not match any of your businesses" },
        { status: 400 }
      );
    }

    const canonicalParent = anchor.parentSlug ?? anchor.slug;

    const brandPeers = owned.filter(
      (b) => (b.parentSlug ?? b.slug) === canonicalParent
    );

    if (brandPeers.some((b) => (b.locationSlug ?? "").trim() === normalizedLoc)) {
      return NextResponse.json(
        { error: "A location with this locationSlug already exists for this brand" },
        { status: 400 }
      );
    }

    if (brandPeers.length === 1 && brandPeers[0].locationSlug === "") {
      await prisma.business.update({
        where: { id: brandPeers[0].id },
        data: { parentSlug: canonicalParent, locationSlug: "main" },
      });
    }

    const baseSlug = `${canonicalParent}-${normalizedLoc}`;
    let finalSlug = baseSlug;
    const existingSlug = await prisma.business.findUnique({ where: { slug: finalSlug } });
    if (existingSlug) {
      finalSlug = `${baseSlug}-${Date.now()}`;
    }

    const business = await prisma.business.create({
      data: {
        name,
        slug: finalSlug,
        parentSlug: canonicalParent,
        locationSlug: normalizedLoc,
        phone: phone ?? null,
        plan: "starter",
        active: true,
        ownerId,
      },
    });
    return NextResponse.json(business);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
