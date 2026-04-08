import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { ADMIN_SESSION_COOKIE, signSuperAdminToken, getSuperAdminFromRequest } from "@/lib/super-admin-auth";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const COOKIE_OPTS = {
  httpOnly: true,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    }

    const admin = await prisma.superAdmin.findUnique({ where: { email } });
    if (!admin) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signSuperAdminToken(email);
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_SESSION_COOKIE, token, COOKIE_OPTS);
    return res;
  } catch (e) {
    console.error("POST /api/admin/auth", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSuperAdminFromRequest(req);
    if (!session) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }
    return NextResponse.json({ valid: true, email: session.email });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}
