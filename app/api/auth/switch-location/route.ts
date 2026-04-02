import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ownerId } = JSON.parse(sessionCookie);
    const { businessId } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, ownerId, active: true },
    });

    if (!business) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set(
      "session",
      JSON.stringify({
        ownerId,
        businessId: business.id,
        businessName: business.name,
        slug: business.slug,
      }),
      {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      }
    );

    return response;
  } catch (error) {
    console.error("switch-location error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
