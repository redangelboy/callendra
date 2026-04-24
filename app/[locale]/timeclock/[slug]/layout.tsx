import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const path = `/${locale}/timeclock/${slug}`;
  return {
    manifest: `/manifest?startUrl=${encodeURIComponent(path)}`,
  };
}

export default function TimeclockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

