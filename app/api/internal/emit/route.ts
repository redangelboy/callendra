import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { room, event, data } = await req.json();
    if ((global as any).io) {
      (global as any).io.to(room).emit(event, data);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "io not available" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "failed" });
  }
}
