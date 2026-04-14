import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { staffBreakDateFromYmd } from "@/lib/staff-break-date";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function canManageBreaks(session: Record<string, unknown>): boolean {
  if (session?.ownerId) return true;
  if (session?.staffUserId && session?.role === "ADMIN") return true;
  return false;
}

function canViewBreaks(session: Record<string, unknown>): boolean {
  return !!(session?.ownerId || session?.staffUserId);
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

export async function GET(req: NextRequest) {
  try {
    const sessionRaw = req.cookies.get("session")?.value;
    if (!sessionRaw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = JSON.parse(sessionRaw) as Record<string, unknown>;
    if (!canViewBreaks(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const date = searchParams.get("date")?.trim();
    if (!businessId || !date || !/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) {
      return NextResponse.json({ error: "businessId and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const denied = await assertBusinessAccess(businessId, session);
    if (denied) return denied;
    const dayKey = staffBreakDateFromYmd(date);
    const breaks = await prisma.staffBreak.findMany({
      where: { businessId, date: dayKey },
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json({ breaks });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionRaw = req.cookies.get("session")?.value;
    if (!sessionRaw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = JSON.parse(sessionRaw) as Record<string, unknown>;
    if (!canManageBreaks(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const staffId = body.staffId as string | undefined;
    const businessId = body.businessId as string | undefined;
    const date = body.date as string | undefined;
    const startTime = body.startTime as string | undefined;
    const duration = body.duration;
    const label = body.label;
    if (!staffId || !businessId || !date || !startTime || duration == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const denied = await assertBusinessAccess(businessId, session);
    if (denied) return denied;
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(String(date).trim())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 24 * 60) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }
    const timeOk = /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(startTime).trim());
    if (!timeOk) {
      return NextResponse.json({ error: "Invalid startTime" }, { status: 400 });
    }
    const assigned = await prisma.staffAssignment.findFirst({
      where: { businessId, staffId, active: true },
    });
    if (!assigned) {
      return NextResponse.json({ error: "Staff is not assigned to this location" }, { status: 400 });
    }
    const dayKey = staffBreakDateFromYmd(String(date).trim());
    const created = await prisma.staffBreak.create({
      data: {
        staffId,
        businessId,
        date: dayKey,
        startTime: String(startTime).trim(),
        duration: Math.floor(dur),
        label: typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : "Break",
      },
      include: { staff: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ break: created });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
