import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId } = JSON.parse(session) as { ownerId?: string };
    if (!ownerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      select: { name: true, phone: true },
    });
    if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(owner);
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId } = JSON.parse(session) as { ownerId?: string };
    if (!ownerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const name = body.name;
    const phone = body.phone;

    const data: { name?: string; phone?: string | null } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if ("phone" in body) {
      data.phone =
        phone != null && String(phone).trim() ? String(phone).trim() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const owner = await prisma.owner.update({
      where: { id: ownerId },
      data,
      select: { name: true, phone: true },
    });

    return NextResponse.json(owner);
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
