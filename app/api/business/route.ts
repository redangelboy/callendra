import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import { getMainBusinessIdForOwner } from "@/lib/main-business";
import { isValidThemeId } from "@/lib/callendra-themes";

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
    const parsed = JSON.parse(session) as { businessId?: string; ownerId?: string };
    const businessId = parsed.businessId;
    const ownerIdFromSession = parsed.ownerId;
    if (!businessId || typeof businessId !== "string") {
      return NextResponse.json(
        { error: "Invalid session: missing businessId. Sign out and sign in again." },
        { status: 401 }
      );
    }
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

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function PUT(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session) as { businessId?: string; ownerId?: string };
    const { businessId, ownerId } = parsed;
    if (!ownerId || typeof ownerId !== "string") {
      return NextResponse.json({ error: "Only business owners can manage the display token" }, { status: 403 });
    }
    if (!businessId || typeof businessId !== "string") {
      return NextResponse.json(
        { error: "Invalid session: missing businessId. Sign out and sign in again." },
        { status: 401 }
      );
    }
    const body = await req.json();
    if (body?.action !== "regenerateDisplayToken") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const row = await prisma.business.findUnique({ where: { id: businessId } });
    if (!row || row.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const displayToken = randomBytes(32).toString("hex");
    await prisma.business.update({
      where: { id: businessId },
      data: { displayToken },
    });
    return NextResponse.json({ displayToken });
  } catch (error) {
    console.error("PUT /api/business", error);
    const message = error instanceof Error ? error.message : "Server error";
    const expose =
      process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";
    return NextResponse.json(
      { error: expose ? message : "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session);
    const { businessId, ownerId } = parsed as { businessId: string; ownerId?: string };
    const body = await req.json();
    const { name, phone, address, logo, retellPhoneNumber, notificationPhone, themePreset } = body;

    const themeUpdate =
      themePreset !== undefined && isValidThemeId(String(themePreset))
        ? String(themePreset)
        : undefined;

    const data: Prisma.BusinessUpdateInput = {};

    if ("name" in body && name !== undefined && name !== null) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Business name cannot be empty" }, { status: 400 });
      }
      data.name = trimmed;
    }
    if ("phone" in body) data.phone = strOrNull(phone);
    if ("address" in body) data.address = strOrNull(address);
    if ("logo" in body) data.logo = strOrNull(logo);
    if ("retellPhoneNumber" in body) data.retellPhoneNumber = strOrNull(retellPhoneNumber);
    if (themeUpdate !== undefined) data.themePreset = themeUpdate;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const business = await prisma.business.update({
      where: { id: businessId },
      data,
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
    console.error("PATCH /api/business", error);
    const message = error instanceof Error ? error.message : "Server error";
    const expose =
      process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";
    return NextResponse.json(
      { error: expose ? message : "Server error" },
      { status: 500 }
    );
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
