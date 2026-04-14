import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function canManageBreaks(session: Record<string, unknown>): boolean {
  if (session?.ownerId) return true;
  if (session?.staffUserId && session?.role === "ADMIN") return true;
  return false;
}

async function assertBusinessAccess(businessId: string, session: Record<string, unknown>) {
  if (session.ownerId) {
    const biz = await prisma.business.findFirst({
      where: { id: businessId, ownerId: session.ownerId as string },
    });
    if (!biz) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
  }
  if (session.staffUserId) {
    if (businessId !== session.businessId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionRaw = req.cookies.get("session")?.value;
    if (!sessionRaw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = JSON.parse(sessionRaw) as Record<string, unknown>;
    if (!canManageBreaks(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    const existing = await prisma.staffBreak.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const denied = await assertBusinessAccess(existing.businessId, session);
    if (denied) return denied;
    await prisma.staffBreak.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
