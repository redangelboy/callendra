import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: "postgresql://reservify_user:reservify123@localhost:5432/reservify"
});
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const { email, password, businessId } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const owner = await prisma.owner.findUnique({
      where: { email },
      include: { businesses: true },
    });

    if (!owner) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, owner.password);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Si tiene varias sucursales y no especificó cuál, devolver lista
    if (owner.businesses.length > 1 && !businessId) {
      return NextResponse.json({
        requireBusinessSelect: true,
        businesses: owner.businesses.map(b => ({ id: b.id, name: b.name, slug: b.slug })),
        ownerId: owner.id,
      });
    }

    // Seleccionar la sucursal
    const business = businessId
      ? owner.businesses.find(b => b.id === businessId)
      : owner.businesses[0];

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
