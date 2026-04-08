import type { Business } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export type OwnerLoginBusinessOutcome =
  | { status: "no_business" }
  | { status: "suspended" }
  | { status: "ok"; business: Pick<Business, "id" | "name" | "slug"> };

/**
 * Owner login: distinguish no businesses vs all inactive vs has an active row.
 */
export async function getOwnerLoginBusinessResult(
  prisma: PrismaClient,
  ownerId: string
): Promise<OwnerLoginBusinessOutcome> {
  const anyBusiness = await prisma.business.findFirst({
    where: { ownerId },
    select: { id: true },
  });
  if (!anyBusiness) return { status: "no_business" };

  const business = await prisma.business.findFirst({
    where: { ownerId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true },
  });
  if (!business) return { status: "suspended" };
  return { status: "ok", business };
}

/**
 * Oldest active business for an owner (canonical session target when multiple rows exist).
 * Returns null if none active or owner has no businesses.
 */
export async function getMainBusinessIdForOwner(prisma: PrismaClient, ownerId: string) {
  const business = await prisma.business.findFirst({
    where: { ownerId, active: true },
    orderBy: { createdAt: "asc" },
  });
  return business?.id ?? null;
}

export function isMainBusiness(b: { locationSlug: string | null | undefined }) {
  const ls = (b.locationSlug ?? "").trim();
  return ls === "" || ls === "main";
}

/** Session targets the owner's catalog business row (same id as getMainBusinessIdForOwner), not empty-slug-only. */
export function isOwnerMainBusinessSession(sessionBusinessId: string, mainBusinessId: string) {
  return sessionBusinessId === mainBusinessId;
}

/**
 * Client-side: prefer `isMainBusiness` from GET /api/business (canonical main row, including when locationSlug is "main").
 * Fallback for legacy payloads: empty / null locationSlug only.
 */
export function isMainBusinessFromPayload(biz: any): boolean {
  if (!biz) return false;
  if (typeof biz.isMainBusiness === "boolean") return biz.isMainBusiness;
  const ls = String(biz.locationSlug ?? "").trim();
  return ls === "" || ls === "main";
}
