import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageBusiness, readSession } from "@/lib/session-auth";

async function denyUnlessBusinessAccess(
  session: NonNullable<ReturnType<typeof readSession>>,
  businessId: string
): Promise<NextResponse | null> {
  if (session.ownerId) {
    const biz = await prisma.business.findFirst({
      where: { id: businessId, ownerId: session.ownerId },
      select: { id: true },
    });
    if (!biz) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
  }
  if (session.staffUserId && session.role === "ADMIN" && session.businessId === businessId) {
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId")?.trim();
    const kioskToken = searchParams.get("token")?.trim();
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const session = readSession(req);
    let allowed = false;

    if (canManageBusiness(session) && session) {
      const denied = await denyUnlessBusinessAccess(session, businessId);
      if (denied) return denied;
      allowed = true;
    }

    if (!allowed && kioskToken) {
      const biz = await prisma.business.findFirst({
        where: { id: businessId, displayToken: kioskToken, active: true },
        select: { id: true },
      });
      if (biz) allowed = true;
    }

    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.clockQrToken.deleteMany({
      where: {
        businessId,
        expiresAt: { lt: cutoff },
      },
    });

    /** Seconds until this token expires (kiosk UI countdown should match). */
    const qrTtlSeconds = 10;
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + qrTtlSeconds * 1000);

    await prisma.clockQrToken.create({
      data: {
        businessId,
        token,
        expiresAt,
      },
    });

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("GET /api/clock-qr", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
