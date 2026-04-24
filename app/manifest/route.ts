import { NextRequest, NextResponse } from "next/server";

const BASE_MANIFEST = {
  name: "Callendra",
  short_name: "Callendra",
  display: "standalone" as const,
  scope: "/",
  background_color: "#0a1628",
  theme_color: "#2563eb",
  orientation: "any" as const,
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

function safeStartUrl(raw: string | null): string {
  if (raw == null || raw === "") return "/";
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  if (decoded.length > 2048) return "/";
  return decoded;
}

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("startUrl");
  const start_url = safeStartUrl(param);

  const isStaffDay = start_url.includes("/staff-day");
  const isTimeClock = start_url.includes("/timeclock/");
  const body = {
    ...BASE_MANIFEST,
    start_url,
    /** Lets each saved shortcut open its own token URL; avoids clobbering installs. */
    id: start_url,
    ...(isStaffDay
      ? {
          name: "Callendra · Staff",
          short_name: "Staff",
        }
      : {}),
    ...(isTimeClock
      ? {
          name: "Callendra · Time Clock",
          short_name: "Time Clock",
        }
      : {}),
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
