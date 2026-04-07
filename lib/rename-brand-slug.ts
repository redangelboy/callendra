import { PrismaClient } from "@prisma/client";

/** Same rules as location slugs: lowercase, hyphens, a-z0-9 */
export function normalizeBrandSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextSlugForRow(newParent: string, locationSlug: string | null | undefined): string {
  const loc = (locationSlug ?? "").trim();
  if (loc === "" || loc === "main") {
    return newParent;
  }
  return `${newParent}-${loc}`;
}

/**
 * Renames the canonical booking URL segment for the whole brand (all Business rows
 * that share the same parent slug) and updates each row's `slug` and `parentSlug`.
 * Must be called only for the owner's main catalog row id.
 */
export async function renameBrandSlugForOwner(
  prisma: PrismaClient,
  params: { ownerId: string; mainBusinessId: string; newParent: string }
): Promise<{ oldParent: string; newParent: string; updatedIds: string[] }> {
  const { ownerId, mainBusinessId, newParent } = params;

  if (newParent.length < 2 || newParent.length > 80) {
    throw new Error("Brand URL slug must be between 2 and 80 characters");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newParent)) {
    throw new Error("Use only lowercase letters, numbers, and single hyphens between words");
  }

  const main = await prisma.business.findFirst({
    where: { id: mainBusinessId, ownerId, active: true },
  });
  if (!main) {
    throw new Error("Not found");
  }

  const oldParent = (main.parentSlug ?? main.slug).trim();
  if (oldParent === newParent) {
    return { oldParent, newParent, updatedIds: [] };
  }

  const owned = await prisma.business.findMany({
    where: { ownerId, active: true },
  });

  const peers = owned.filter((b) => {
    const key = (b.parentSlug ?? b.slug).trim();
    return key === oldParent;
  });

  if (peers.length === 0) {
    throw new Error("No brand locations found");
  }

  const peerIds = new Set(peers.map((p) => p.id));

  const planned = peers.map((row) => {
    const nextSlug = nextSlugForRow(newParent, row.locationSlug);
    return { id: row.id, nextSlug, parentSlug: newParent };
  });

  const nextSlugs = new Set(planned.map((p) => p.nextSlug));
  if (nextSlugs.size !== planned.length) {
    throw new Error("Internal conflict: duplicate URL slugs for this brand");
  }

  for (const p of planned) {
    const clash = await prisma.business.findFirst({
      where: {
        slug: p.nextSlug,
        id: { notIn: [...peerIds] },
        active: true,
      },
    });
    if (clash) {
      throw new Error(`That URL is already taken (${p.nextSlug}). Try a different brand slug.`);
    }
  }

  planned.sort((a, b) => b.nextSlug.length - a.nextSlug.length);

  await prisma.$transaction(async (tx) => {
    for (const p of planned) {
      await tx.business.update({
        where: { id: p.id },
        data: { slug: p.nextSlug, parentSlug: p.parentSlug },
      });
    }
  });

  return { oldParent, newParent, updatedIds: planned.map((p) => p.id) };
}
