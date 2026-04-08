"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  createdAt: string;
  kind: "main" | "branch";
};

type Brand = {
  brandKey: string;
  label: string;
  locationsCount: number;
  rows: Row[];
};

type OwnerGroup = {
  ownerId: string;
  ownerEmail: string;
  brands: Brand[];
};

function filterGroups(groups: OwnerGroup[], query: string): OwnerGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((g) => {
      if (g.ownerEmail.toLowerCase().includes(q)) {
        return g;
      }

      const brands = g.brands
        .map((brand) => {
          if (brand.label.toLowerCase().includes(q) || brand.brandKey.toLowerCase().includes(q)) {
            return brand;
          }
          const rows = brand.rows.filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              r.slug.toLowerCase().includes(q) ||
              r.plan.toLowerCase().includes(q)
          );
          if (rows.length === 0) return null;
          return {
            ...brand,
            rows,
            locationsCount: rows.length,
          };
        })
        .filter((b): b is Brand => b != null);

      if (brands.length === 0) return null;
      return { ...g, brands };
    })
    .filter((g): g is OwnerGroup => g != null);
}

export default function AdminBusinessesPage() {
  const [groups, setGroups] = useState<OwnerGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filteredGroups = useMemo(() => filterGroups(groups, search), [groups, search]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/businesses", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    setGroups(data.groups || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setError("Could not load businesses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function toggleActive(row: Row) {
    const next = !row.active;
    const res = await fetch("/api/admin/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: row.id, active: next }),
    });
    if (!res.ok) {
      setError("Could not update business");
      return;
    }
    setError("");
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-2">Businesses</h1>
      <p className="text-sm text-zinc-500 mb-4">
        Grouped by owner; each brand shows its main row and branch locations.
      </p>
      <div className="mb-6">
        <label htmlFor="admin-biz-search" className="sr-only">
          Search businesses
        </label>
        <input
          id="admin-biz-search"
          type="search"
          placeholder="Search by owner email, brand, location name, slug, plan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-500"
          autoComplete="off"
        />
      </div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : filteredGroups.length === 0 ? (
        <p className="text-zinc-500">
          {groups.length === 0 ? "No businesses yet." : "No results match your search."}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {filteredGroups.map((g) => (
            <section
              key={g.ownerId}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden"
            >
              <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Owner</div>
                <div className="text-base font-semibold text-white">{g.ownerEmail}</div>
              </div>
              <div className="divide-y divide-zinc-800/80">
                {g.brands.map((brand) => (
                  <div key={brand.brandKey} className="p-4">
                    <div className="mb-3 flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-zinc-200">{brand.label}</span>
                      <span className="text-xs text-zinc-500">
                        {brand.locationsCount} location{brand.locationsCount === 1 ? "" : "s"} · slug{" "}
                        <code className="text-zinc-400">{brand.brandKey}</code>
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Location</th>
                            <th className="px-3 py-2 font-medium">Role</th>
                            <th className="px-3 py-2 font-medium">Plan</th>
                            <th className="px-3 py-2 font-medium">Created</th>
                            <th className="px-3 py-2 font-medium">Active</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {brand.rows.map((b) => (
                            <tr key={b.id} className="bg-zinc-950/20">
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-zinc-200">{b.name}</span>
                                <div className="text-[11px] text-zinc-600 font-mono mt-0.5">{b.slug}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={
                                    b.kind === "main"
                                      ? "rounded bg-emerald-950/80 px-2 py-0.5 text-xs text-emerald-400"
                                      : "rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                                  }
                                >
                                  {b.kind === "main" ? "Main / catalog" : "Branch"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-zinc-400">{b.plan}</td>
                              <td className="px-3 py-2.5 text-zinc-500">
                                {new Date(b.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={b.active}
                                  onClick={() => void toggleActive(b)}
                                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
                                    b.active ? "bg-emerald-600" : "bg-zinc-600"
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${
                                      b.active ? "translate-x-5" : "translate-x-0.5"
                                    }`}
                                  />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
