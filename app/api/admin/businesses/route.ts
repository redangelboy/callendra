import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSuperAdminFromRequest } from "@/lib/super-admin-auth";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function brandKey(b: { slug: string; parentSlug: string | null }): string {
  const p = b.parentSlug?.trim();
  return p || b.slug;
}

/** Catalog / “main” row for a brand (same rules as dashboard helpers). */
function isMainCatalogRow(b: { slug: string; parentSlug: string | null; locationSlug: string }, brandKey: string): boolean {
  const ls = (b.locationSlug ?? "").trim();
  if (b.slug !== brandKey) return false;
  return ls === "" || ls === "main";
}

export async function GET(req: NextRequest) {
  const admin = await getSuperAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.business.findMany({
      include: {
        owner: { select: { email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const byOwner = new Map<string, typeof rows>();
    for (const b of rows) {
      const list = byOwner.get(b.ownerId);
      if (list) list.push(b);
      else byOwner.set(b.ownerId, [b]);
    }

    const groups: {
      ownerId: string;
      ownerEmail: string;
      brands: {
        brandKey: string;
        label: string;
        locationsCount: number;
        rows: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          active: boolean;
          createdAt: string;
          kind: "main" | "branch";
        }[];
      }[];
    }[] = [];

    for (const [ownerId, ownerRows] of byOwner) {
      const byBrand = new Map<string, typeof ownerRows>();
      for (const b of ownerRows) {
        const key = brandKey(b);
        const list = byBrand.get(key);
        if (list) list.push(b);
        else byBrand.set(key, [b]);
      }

      const brands: (typeof groups)[0]["brands"] = [];
      for (const [bk, brandRows] of byBrand) {
        const sorted = [...brandRows].sort((a, b) => {
          const am = isMainCatalogRow(a, bk) ? 0 : 1;
          const bm = isMainCatalogRow(b, bk) ? 0 : 1;
          if (am !== bm) return am - bm;
          return a.name.localeCompare(b.name);
        });
        const mainRow = sorted.find((r) => isMainCatalogRow(r, bk)) ?? sorted[0];
        brands.push({
          brandKey: bk,
          label: mainRow.name,
          locationsCount: brandRows.length,
          rows: sorted.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            plan: r.plan,
            active: r.active,
            createdAt: r.createdAt.toISOString(),
            kind: isMainCatalogRow(r, bk) ? ("main" as const) : ("branch" as const),
          })),
        });
      }
      brands.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

      const ownerEmail = ownerRows[0]!.owner.email;
      groups.push({ ownerId, ownerEmail, brands });
    }

    groups.sort((a, b) => {
      const maxA = Math.max(
        0,
        ...a.brands.flatMap((br) => br.rows.map((r) => new Date(r.createdAt).getTime()))
      );
      const maxB = Math.max(
        0,
        ...b.brands.flatMap((br) => br.rows.map((r) => new Date(r.createdAt).getTime()))
      );
      return maxB - maxA;
    });

    return NextResponse.json({ groups });
  } catch (e) {
    console.error("GET /api/admin/businesses", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await getSuperAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const active = typeof body.active === "boolean" ? body.active : undefined;
    if (!id || active === undefined) {
      return NextResponse.json({ error: "id and active required" }, { status: 400 });
    }

    await prisma.business.update({
      where: { id },
      data: { active },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("PATCH /api/admin/businesses", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
