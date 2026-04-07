import type { PrismaClient } from "@prisma/client";
import { bookingPathForBusiness } from "@/lib/booking-path";

/**
 * Absolute URL (with /en prefix) for the public booking page for a Business row.
 */
export async function buildPublicBookingAbsUrl(
  prisma: PrismaClient,
  business: { id: string; ownerId: string; slug: string; parentSlug: string | null; locationSlug: string | null }
): Promise<string> {
  const canonical = (business.parentSlug ?? business.slug).trim();
  const peers = await prisma.business.findMany({
    where: { ownerId: business.ownerId, active: true },
  });
  const locationCount = peers.filter(
    (b) => (b.parentSlug ?? b.slug).trim() === canonical
  ).length;
  const path = bookingPathForBusiness(
    business.parentSlug,
    business.slug,
    business.locationSlug ?? "",
    locationCount
  );
  const base = (process.env.NEXT_PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/en${path}`;
}
