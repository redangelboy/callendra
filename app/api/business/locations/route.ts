import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function normalizeLocationSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function getSession(req: NextRequest) {
  const cookie = req.cookies.get("session")?.value;
  return cookie ? JSON.parse(cookie) : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, staffUserId, businessId } = session;

    let locations;
    if (ownerId) {
      locations = await prisma.business.findMany({
        where: { ownerId, active: true },
        orderBy: { createdAt: "asc" }
      });
    } else if (staffUserId) {
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      locations = biz ? [biz] : [];
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(locations);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session?.ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId } = session;
    const body = await req.json();
    const { id, name, phone, address, retellPhoneNumber, locationSlug: bodyLoc, locationSlugUpdate } = body;
    const business = await prisma.business.findFirst({ where: { id, ownerId } });
    if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: {
      name: string;
      phone?: string | null;
      address?: string | null;
      retellPhoneNumber?: string | null;
      locationSlug?: string;
      slug?: string;
    } = {
      name,
      phone: phone ?? null,
      address: address ?? null,
      retellPhoneNumber: retellPhoneNumber || null,
    };

    if (locationSlugUpdate === true) {
      const normalizedLoc = normalizeLocationSlug(typeof bodyLoc === "string" ? bodyLoc : "");
      if (!normalizedLoc) {
        return NextResponse.json({ error: "locationSlug must contain letters or numbers" }, { status: 400 });
      }

      const owned = await prisma.business.findMany({
        where: { ownerId, active: true },
      });
      const canonicalParent = business.parentSlug ?? business.slug;
      const brandPeers = owned.filter(
        (b) => (b.parentSlug ?? b.slug) === canonicalParent && b.id !== business.id
      );
      if (brandPeers.some((b) => normalizeLocationSlug(b.locationSlug ?? "") === normalizedLoc)) {
        return NextResponse.json(
          { error: "A location with this URL slug already exists for this brand" },
          { status: 400 }
        );
      }

      const baseSlug = `${canonicalParent}-${normalizedLoc}`;
      let finalSlug = baseSlug;
      const existing = await prisma.business.findUnique({ where: { slug: finalSlug } });
      if (existing && existing.id !== business.id) {
        finalSlug = `${baseSlug}-${Date.now()}`;
      }

      data.locationSlug = normalizedLoc;
      data.slug = finalSlug;
    }

    const updated = await prisma.business.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session?.ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId } = session;
    const { id } = await req.json();
    const businesses = await prisma.business.findMany({ where: { ownerId, active: true } });
    if (businesses.length <= 1) {
      return NextResponse.json({ error: "Cannot delete your only location" }, { status: 400 });
    }
    await prisma.business.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
