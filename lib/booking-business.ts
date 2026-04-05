import { Prisma, PrismaClient } from "@prisma/client";

export type ResolveBookParams = {
  slug?: string | null;
  parentSlug?: string | null;
  locationSlug?: string | null;
};

/**
 * Resolves a Business row for public booking (location): legacy slug or parentSlug + optional location segment.
 */
export async function resolveBusinessForBooking(
  prisma: PrismaClient,
  params: ResolveBookParams
) {
  const { slug, parentSlug, locationSlug } = params;

  const find = (where: Prisma.BusinessWhereInput) =>
    prisma.business.findFirst({ where: { ...where, active: true } });

  if (slug) {
    return find({ slug });
  }

  if (!parentSlug) return null;

  const byParent = await prisma.business.findMany({
    where: { parentSlug, active: true },
    orderBy: { createdAt: "asc" },
  });

  if (byParent.length === 0) {
    return find({ slug: parentSlug });
  }

  if (byParent.length === 1) {
    return find({ id: byParent[0].id });
  }

  const loc = (locationSlug ?? "").trim();

  /**
   * Sin segmento en la URL (/book/marca): usar la sede principal de esa marca.
   * Incluye filas con locationSlug vacío o "main" (migración de una sola sede).
   */
  if (!loc) {
    const mainish = byParent.filter((b) => {
      const ls = (b.locationSlug ?? "").trim();
      return ls === "" || ls === "main";
    });
    if (mainish.length === 1) {
      return find({ id: mainish[0].id });
    }
    return null;
  }

  const match = byParent.find((b) => (b.locationSlug ?? "").trim() === loc);
  if (!match) return null;

  return find({ id: match.id });
}
