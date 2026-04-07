import { CallendraThemeStyle } from "@/components/callendra-theme-style";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/callendra-themes";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DisplayLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  let preset = DEFAULT_THEME_ID;
  try {
    const row = await prisma.business.findUnique({
      where: { slug },
      select: { themePreset: true },
    });
    if (row?.themePreset && isValidThemeId(row.themePreset)) {
      preset = row.themePreset;
    }
  } catch (e) {
    console.error("[display layout] themePreset load failed — run `npx prisma generate` and sync DB:", e);
  }
  return (
    <>
      <CallendraThemeStyle preset={preset} variant="override" />
      {/* Lock viewport height so only per-column lists scroll (kiosk / TV / tablet) */}
      <div className="flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-[var(--callendra-bg)]">
        {children}
      </div>
    </>
  );
}
