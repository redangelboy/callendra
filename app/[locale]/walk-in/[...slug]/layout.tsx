import { CallendraThemeStyle } from "@/components/callendra-theme-style";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/callendra-themes";
import { prisma } from "@/lib/db";
import { resolveBusinessForBooking } from "@/lib/booking-business";

export const dynamic = "force-dynamic";

export default async function WalkInLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { slug } = await params;
  const parentSlug = slug?.[0] ?? "";
  const locationSlug = slug?.[1];
  let preset = DEFAULT_THEME_ID;
  if (parentSlug) {
    try {
      const business = await resolveBusinessForBooking(prisma, {
        parentSlug,
        locationSlug: locationSlug ?? undefined,
      });
      if (business?.themePreset && isValidThemeId(business.themePreset)) {
        preset = business.themePreset;
      }
    } catch (e) {
      console.error("[walk-in layout] themePreset load failed:", e);
    }
  }
  return (
    <>
      <CallendraThemeStyle preset={preset} variant="override" />
      <div className="flex min-h-[100dvh] h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[var(--callendra-bg)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        {children}
      </div>
    </>
  );
}
