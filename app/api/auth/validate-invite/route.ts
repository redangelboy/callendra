import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeInviteCode, validateInviteRow } from "@/lib/invite-code";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const MSG = "Invalid or expired invite code";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = typeof body.code === "string" ? body.code : "";
    const code = normalizeInviteCode(raw);
    if (!code) {
      return NextResponse.json({ valid: false, message: MSG });
    }

    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) {
      return NextResponse.json({ valid: false, message: MSG });
    }

    const reason = validateInviteRow(invite);
    if (reason) {
      return NextResponse.json({ valid: false, message: MSG });
    }

    return NextResponse.json({ valid: true });
  } catch (e) {
    console.error("validate-invite:", e);
    return NextResponse.json({ valid: false, message: MSG });
  }
}
