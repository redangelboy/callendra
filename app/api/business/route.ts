import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import { getMainBusinessIdForOwner } from "@/lib/main-business";
import { normalizeBrandSlug, renameBrandSlugForOwner } from "@/lib/rename-brand-slug";
import { isAllowedGoogleMapsPlaceUrl } from "@/lib/google-maps-link";
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
    let ownerEmail: string | undefined;
    if (ownerIdFromSession) {
      const o = await prisma.owner.findUnique({
        where: { id: ownerIdFromSession },
        select: { phone: true, email: true },
      });
      notificationPhone = o?.phone ?? null;
      if (ownerIdFromSession === business.ownerId) {
        ownerEmail = o?.email;
      }
    }
    return NextResponse.json({
      ...business,
      isMainBusiness,
      ...(ownerIdFromSession ? { notificationPhone } : {}),
      ...(ownerEmail !== undefined ? { ownerEmail } : {}),
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
    const action = body?.action;
    if (action !== "regenerateDisplayToken" && action !== "regenerateWalkInToken") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const row = await prisma.business.findUnique({ where: { id: businessId } });
    if (!row || row.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "regenerateDisplayToken") {
      const displayToken = randomBytes(32).toString("hex");
      await prisma.business.update({
        where: { id: businessId },
        data: { displayToken },
      });
      return NextResponse.json({ displayToken });
    }

    const walkInToken = randomBytes(32).toString("hex");
    await prisma.business.update({
      where: { id: businessId },
      data: { walkInToken },
    });
    return NextResponse.json({ walkInToken });
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

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 7,
  path: "/" as const,
};

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = JSON.parse(session);
    const { businessId, ownerId } = parsed as { businessId: string; ownerId?: string };
    const body = await req.json();
    const { name, phone, address, logo, retellPhoneNumber, notificationPhone, themePreset, googleMapsPlaceUrl, ownerEmail } =
      body;

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
    if ("googleMapsPlaceUrl" in body) {
      const v = strOrNull(googleMapsPlaceUrl);
      if (v && !isAllowedGoogleMapsPlaceUrl(v)) {
        return NextResponse.json(
          {
            error:
              "Invalid Google Maps link. Open your business on Google Maps → Share → copy link (maps.google.com or maps.app.goo.gl).",
          },
          { status: 400 }
        );
      }
      data.googleMapsPlaceUrl = v;
    }
    if ("logo" in body) data.logo = strOrNull(logo);
    if ("retellPhoneNumber" in body) data.retellPhoneNumber = strOrNull(retellPhoneNumber);
    if (themeUpdate !== undefined) data.themePreset = themeUpdate;

    let didRenameBrand = false;
    let didUpdateOwnerEmail = false;

    if ("ownerEmail" in body && ownerId) {
      const row = await prisma.business.findUnique({
        where: { id: businessId },
        select: { ownerId: true, locationSlug: true },
      });
      if (!row || row.ownerId !== ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      const ls = (row.locationSlug ?? "").trim();
      if (ls !== "" && ls !== "main") {
        return NextResponse.json(
          { error: "Owner email can only be updated from the main business profile" },
          { status: 403 }
        );
      }
      const trimmed = typeof ownerEmail === "string" ? ownerEmail.trim() : "";
      if (!trimmed) {
        return NextResponse.json({ error: "Owner email cannot be empty" }, { status: 400 });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      const taken = await prisma.owner.findFirst({
        where: { email: trimmed, NOT: { id: ownerId } },
      });
      if (taken) {
        return NextResponse.json({ error: "That email is already in use" }, { status: 400 });
      }
      await prisma.owner.update({ where: { id: ownerId }, data: { email: trimmed } });
      didUpdateOwnerEmail = true;
    }
    if ("brandSlug" in body && body.brandSlug !== undefined && body.brandSlug !== null) {
      if (!ownerId) {
        return NextResponse.json({ error: "Only the business owner can change the booking URL" }, { status: 403 });
      }
      if (body.confirmBrandSlugChange !== true) {
        return NextResponse.json(
          { error: "Confirm that you understand old booking links will stop working" },
          { status: 400 }
        );
      }
      const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
      if (!mainId || businessId !== mainId) {
        return NextResponse.json(
          { error: "Booking URL can only be changed from the main brand profile" },
          { status: 403 }
        );
      }
      const normalized = normalizeBrandSlug(String(body.brandSlug));
      if (!normalized) {
        return NextResponse.json({ error: "Brand URL slug cannot be empty" }, { status: 400 });
      }
      try {
        await renameBrandSlugForOwner(prisma, {
          ownerId,
          mainBusinessId: mainId,
          newParent: normalized,
        });
        didRenameBrand = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not update URL";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    const hasDataUpdates = Object.keys(data).length > 0;
    if (!hasDataUpdates && !didRenameBrand && !didUpdateOwnerEmail) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (hasDataUpdates) {
      await prisma.business.update({
        where: { id: businessId },
        data,
      });
    }

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

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const response = NextResponse.json(business);
    if (ownerId && session) {
      try {
        const s = JSON.parse(session) as Record<string, unknown>;
        response.cookies.set(
          "session",
          JSON.stringify({
            ...s,
            slug: business.slug,
            businessName: business.name,
          }),
          SESSION_COOKIE_OPTIONS
        );
      } catch {
        /* ignore cookie refresh */
      }
    }
    return response;
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
