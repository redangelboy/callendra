import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const { businessName, email, password, ownerName, phone } = await req.json();

    if (!businessName || !email || !password || !ownerName) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const existing = await prisma.owner.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const slug = businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const existingSlug = await prisma.business.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({
        data: { email, password: hashedPassword, name: ownerName },
      });
      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: finalSlug,
          parentSlug: finalSlug,
          locationSlug: "",
          phone: phone || null,
          plan: "starter",
          active: true,
          ownerId: owner.id,
        },
      });
      return { owner, business };
    });

    const response = NextResponse.json({
      success: true,
      businessId: result.business.id,
      slug: result.business.slug,
    });

    response.cookies.set("session", JSON.stringify({
      ownerId: result.owner.id,
      businessId: result.business.id,
      businessName: result.business.name,
      slug: result.business.slug,
    }), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;

  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
