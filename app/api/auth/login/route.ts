import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { getMainBusinessIdForOwner } from "@/lib/main-business";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const owner = await prisma.owner.findUnique({
      where: { email },
    });

    if (!owner) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, owner.password);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const mainId = await getMainBusinessIdForOwner(prisma, owner.id);
    if (!mainId) {
      return NextResponse.json({ error: "No business found" }, { status: 400 });
    }

    const business = await prisma.business.findUnique({
      where: { id: mainId },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const response = NextResponse.json({
      success: true,
      owner: { id: owner.id, name: owner.name, email: owner.email },
      business: { id: business.id, name: business.name, slug: business.slug },
    });

    response.cookies.set("session", JSON.stringify({
      ownerId: owner.id,
      businessId: business.id,
      businessName: business.name,
      slug: business.slug,
    }), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
