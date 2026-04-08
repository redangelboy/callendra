import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { suspendedLoginResponse } from "@/lib/suspended-login";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const staffUser = await prisma.staffUser.findUnique({
      where: { email },
      include: { business: true, staff: true },
    });

    if (!staffUser || !staffUser.active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, staffUser.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!staffUser.business.active) {
      return suspendedLoginResponse();
    }

    const response = NextResponse.json({
      success: true,
      user: { id: staffUser.id, name: staffUser.name, role: staffUser.role },
    });

    response.cookies.set("session", JSON.stringify({
      staffUserId: staffUser.id,
      businessId:  staffUser.businessId,
      businessName: staffUser.business.name,
      slug:        staffUser.business.slug,
      role:        staffUser.role,
      staffId:     staffUser.staffId,
      userType:    "staff",
    }), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
