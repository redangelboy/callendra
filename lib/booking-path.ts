/** Public booking URL path (no locale prefix). */
export function bookingPathForBusiness(
  parentSlug: string | null | undefined,
  slug: string,
  locationSlug: string | null | undefined,
  locationCount: number
): string {
  const parent = parentSlug?.trim() || slug;
  if (locationCount <= 1) return `/book/${parent}`;
  const loc = (locationSlug ?? "").trim() || "main";
  return `/book/${parent}/${loc}`;
}

/** Walk-in / iPad kiosk path (same segments as booking, distinto prefijo). */
export function walkInPathForBusiness(
  parentSlug: string | null | undefined,
  slug: string,
  locationSlug: string | null | undefined,
  locationCount: number
): string {
  const parent = parentSlug?.trim() || slug;
  if (locationCount <= 1) return `/walk-in/${parent}`;
  const loc = (locationSlug ?? "").trim() || "main";
  return `/walk-in/${parent}/${loc}`;
}
