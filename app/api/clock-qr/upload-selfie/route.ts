import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/lib/db";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function bearerStaffDayToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    const staffDayToken = bearerStaffDayToken(req);
    if (!staffDayToken) {
      return NextResponse.json({ error: "Authorization Bearer token required" }, { status: 401 });
    }

    const staff = await prisma.staff.findFirst({
      where: { staffDayViewToken: staffDayToken, active: true },
      select: { id: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Invalid staff token" }, { status: 403 });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: "File upload is not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "callendra/timeclock-selfies",
            transformation: [{ width: 1200, height: 1200, crop: "limit" }],
          },
          (error, res) => {
            if (error) reject(error);
            else if (res?.secure_url) resolve(res as { secure_url: string });
            else reject(new Error("Upload failed"));
          }
        )
        .end(buffer);
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error("POST /api/clock-qr/upload-selfie", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
