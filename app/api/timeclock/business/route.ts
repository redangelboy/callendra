import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const businessId = new URL(req.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, parentSlug: true, active: true },
    });
    if (!business || !business.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let parentName: string | null = null;
    if (business.parentSlug) {
      const parent = await prisma.business.findFirst({
        where: { slug: business.parentSlug, active: true },
        select: { name: true },
      });
      parentName = parent?.name ?? null;
    }
    return NextResponse.json({
      id: business.id,
      name: parentName || business.name,
      location: parentName ? business.name : null,
    });
  } catch (error) {
    console.error("GET /api/timeclock/business", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

