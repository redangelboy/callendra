import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: "postgresql://reservify_user:reservify123@localhost:5432/reservify"
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    return NextResponse.json(business);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const { name, phone, address, primaryColor, secondaryColor } = await req.json();
    const business = await prisma.business.update({
      where: { id: businessId },
      data: { name, phone, address, primaryColor, secondaryColor },
    });
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
    const { name, phone } = await req.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const existingSlug = await prisma.business.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;
    const business = await prisma.business.create({
      data: { name, slug: finalSlug, phone, plan: "starter", active: true, ownerId },
    });
    return NextResponse.json(business);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
