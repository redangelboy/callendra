import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { normalizeInviteCode, validateInviteRow } from "@/lib/invite-code";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const INVITE_MSG = "Invalid or expired invite code";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessName,
      email,
      password,
      ownerName,
      phone,
      inviteCode: rawInvite,
    } = body;

    const inviteCode = typeof rawInvite === "string" ? normalizeInviteCode(rawInvite) : "";

    if (!businessName || !email || !password || !ownerName) {
      return NextResponse.json(
        { success: false, message: "All fields are required", error: "All fields are required" },
        { status: 400 }
      );
    }

    if (!inviteCode) {
      return NextResponse.json(
        { success: false, message: INVITE_MSG, error: INVITE_MSG },
        { status: 400 }
      );
    }

    const existing = await prisma.owner.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 400 }
      );
    }

    const slug = businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const existingSlug = await prisma.business.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const hashedPassword = await bcrypt.hash(password, 10);

    const ownerPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!invite) {
        throw Object.assign(new Error(INVITE_MSG), { name: "InviteError" });
      }
      const invalid = validateInviteRow(invite);
      if (invalid) {
        throw Object.assign(new Error(INVITE_MSG), { name: "InviteError" });
      }

      const owner = await tx.owner.create({
        data: {
          email,
          password: hashedPassword,
          name: ownerName,
          phone: ownerPhone,
        },
      });
      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: finalSlug,
          parentSlug: finalSlug,
          locationSlug: "",
          phone: ownerPhone,
          plan: "starter",
          active: true,
          ownerId: owner.id,
        },
      });

      const marked = await tx.inviteCode.updateMany({
        where: { id: invite.id, usedAt: null },
        data: {
          usedAt: new Date(),
          usedBy: email,
        },
      });
      if (marked.count !== 1) {
        throw Object.assign(new Error(INVITE_MSG), { name: "InviteError" });
      }

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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "InviteError") {
      return NextResponse.json(
        { success: false, message: INVITE_MSG, error: INVITE_MSG },
        { status: 400 }
      );
    }
    console.error("Register error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
