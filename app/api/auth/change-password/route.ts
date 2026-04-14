import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export async function PATCH(req: NextRequest) {
  try {
    const sessionRaw = req.cookies.get("session")?.value;
    if (!sessionRaw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = JSON.parse(sessionRaw) as { ownerId?: string };
    if (!session.ownerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const owner = await prisma.owner.findUnique({
      where: { id: session.ownerId },
      select: { id: true, password: true },
    });
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const valid = await bcrypt.compare(currentPassword, owner.password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.owner.update({
      where: { id: owner.id },
      data: { password: hashed },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
