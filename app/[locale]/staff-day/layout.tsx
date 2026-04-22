import type { Metadata } from "next";
import { headers } from "next/headers";

/**
 * PWA / “Add to Home Screen”: manifest start_url must include ?token=…
 * (root layout only knew pathname; middleware sets x-pathsearch).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const h = await headers();
  const pathsearch = (h.get("x-pathsearch") ?? "").trim() || `/${locale}/staff-day`;
  const start = pathsearch.includes("/staff-day") ? pathsearch : `/${locale}/staff-day`;
  const manifest = `/manifest?startUrl=${encodeURIComponent(start)}`;

  const title =
    locale === "es" ? "Mi día (Staff) · Callendra" : "My schedule (Staff) · Callendra";
  const appleTitle = locale === "es" ? "Callendra Staff" : "Callendra Staff";

  return {
    manifest,
    title,
    applicationName: appleTitle,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: appleTitle,
    },
  };
}

export default function StaffDayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
