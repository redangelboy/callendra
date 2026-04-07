/**
 * Google Maps URL that tends to open the business place page (not a generic street search).
 * Address-only queries are often ambiguous (e.g. highway + suite → many results).
 * Name + full address together usually resolves to one place.
 */
export function googleMapsSearchUrl(
  businessName: string | null | undefined,
  address: string | null | undefined
): string | null {
  const name = businessName?.trim() || "";
  const addr = address?.trim() || "";
  const query = name && addr ? `${name}, ${addr}` : name || addr;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Accepts share links from Google Maps (maps.app.goo.gl, google.com/maps/place, etc.) */
export function isAllowedGoogleMapsPlaceUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "maps.app.goo.gl" || h === "goo.gl") return true;
    if (h.endsWith("google.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Prefer pasted Place URL; otherwise fall back to name+address search.
 */
export function resolveGoogleMapsDirectionsUrl(
  googleMapsPlaceUrl: string | null | undefined,
  businessName: string | null | undefined,
  address: string | null | undefined
): string | null {
  const place = googleMapsPlaceUrl?.trim();
  if (place && isAllowedGoogleMapsPlaceUrl(place)) {
    return place;
  }
  return googleMapsSearchUrl(businessName, address);
}
