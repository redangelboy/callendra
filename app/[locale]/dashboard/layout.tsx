import { cookies } from "next/headers";
import { CallendraThemeStyle } from "@/components/callendra-theme-style";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/callendra-themes";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let preset = DEFAULT_THEME_ID;
  const raw = (await cookies()).get("session")?.value;
  if (raw) {
    try {
      const { businessId } = JSON.parse(raw) as { businessId: string };
      const b = await prisma.business.findUnique({
        where: { id: businessId },
        select: { themePreset: true },
      });
      if (b?.themePreset && isValidThemeId(b.themePreset)) preset = b.themePreset;
    } catch (e) {
      console.error("[dashboard layout] themePreset load failed — run `npx prisma generate` and sync DB:", e);
    }
  }
  return (
    <>
      <CallendraThemeStyle preset={preset} variant="override" />
      {children}
    </>
  );
}
