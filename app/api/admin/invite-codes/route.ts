import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateUniqueInviteCode } from "@/lib/invite-code";
import { getSuperAdminFromRequest } from "@/lib/super-admin-auth";
import { sendInviteCodeEmail } from "@/lib/email/send-invite-code";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function statusForRow(row: {
  active: boolean;
  usedAt: Date | null;
  expiresAt: Date | null;
}): "used" | "expired" | "inactive" | "active" {
  if (!row.active) return "inactive";
  if (row.usedAt != null) return "used";
  const now = new Date();
  if (row.expiresAt != null && row.expiresAt <= now) return "expired";
  return "active";
}

export async function GET(req: NextRequest) {
  if (!(await getSuperAdminFromRequest(req))) return unauthorized();
  try {
    const rows = await prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
    });
    const codes = rows.map((r) => ({
      id: r.id,
      code: r.code,
      email: r.email,
      usedAt: r.usedAt?.toISOString() ?? null,
      usedBy: r.usedBy,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      active: r.active,
      status: statusForRow(r),
    }));
    return NextResponse.json({ codes });
  } catch (e) {
    console.error("GET /api/admin/invite-codes", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getSuperAdminFromRequest(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body.email;
    const expiresRaw = body.expiresAt;
    const email =
      typeof emailRaw === "string" && emailRaw.trim() ? emailRaw.trim() : null;
    let expiresAt: Date | null = null;
    if (typeof expiresRaw === "string" && expiresRaw.trim()) {
      const d = new Date(expiresRaw);
      if (!Number.isNaN(d.getTime())) expiresAt = d;
    }

    const code = await generateUniqueInviteCode(prisma);
    await prisma.inviteCode.create({
      data: {
        code,
        email,
        expiresAt,
        active: true,
      },
    });

    if (email) {
      try {
        console.log("Sending invite email to:", email);
        const result = await sendInviteCodeEmail(email, code);
        console.log("Invite email result:", result);
      } catch (err) {
        console.error("Invite email error:", err);
      }
    }

    return NextResponse.json({ code });
  } catch (e) {
    console.error("POST /api/admin/invite-codes", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await getSuperAdminFromRequest(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const active = typeof body.active === "boolean" ? body.active : undefined;
    if (!id || active === undefined) {
      return NextResponse.json({ error: "id and active required" }, { status: 400 });
    }

    await prisma.inviteCode.update({
      where: { id },
      data: { active },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("PATCH /api/admin/invite-codes", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
