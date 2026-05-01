"use client";
import { useState, useEffect } from "react";
import { isMainBusinessFromPayload } from "@/lib/main-business";

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [isMain, setIsMain] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", duration: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const fetchAll = async () => {
    const [svcRes, locRes, bizRes] = await Promise.all([
      fetch("/api/services"),
      fetch("/api/business/locations"),
      fetch("/api/business"),
    ]);
    const svcData = await svcRes.json();
    const locData = await locRes.json();
    const biz = await bizRes.json();
    if (Array.isArray(svcData)) setServices(svcData);
    if (Array.isArray(locData)) setLocations(locData);
    if (biz?.id) setIsMain(isMainBusinessFromPayload(biz));
  };

  useEffect(() => { fetchAll(); }, []);

  const branchLocations = locations.filter((loc) => loc.locationSlug && loc.locationSlug.trim() !== "" && loc.locationSlug !== "main");

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", price: "", duration: "" });
    setFormError("");
  };

  const startEdit = (s: any) => {
    setFormError("");
    setEditingId(s.id);
    setForm({
      name: s.name ?? "",
      price: s.price != null ? String(s.price) : "",
      duration: s.duration != null ? String(s.duration) : "",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleAdd = async () => {
    if (editingId) return;
    if (!form.name || !form.price || !form.duration) {
      setFormError("All fields are required");
      return;
    }
    setLoading(true);
    setFormError("");
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ name: "", price: "", duration: "" });
      fetchAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!form.name || !form.price || !form.duration) {
      setFormError("All fields are required");
      return;
    }
    setLoading(true);
    setFormError("");
    try {
      const res = await fetch("/api/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cancelEdit();
      fetchAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (editingId === id) cancelEdit();
    await fetch("/api/services", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  };

  const isServiceAtLocation = (svc: any, locId: string) => {
    const lp: { businessId: string; price: number | null }[] = svc.locationPricing || [];
    return lp.some((x) => x.businessId === locId);
  };

  const getOverride = (svc: any, locId: string) => {
    const lp = (svc.locationPricing || []).find((x: any) => x.businessId === locId);
    if (lp?.price == null) return "";
    return String(lp.price);
  };

  const toggleLocation = async (serviceId: string, locationId: string, checked: boolean) => {
    setError("");
    try {
      if (checked) {
        const res = await fetch("/api/services/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, businessId: locationId, price: null, active: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch("/api/services/assign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, businessId: locationId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const savePrice = async (serviceId: string, locationId: string, raw: string) => {
    const trimmed = raw.trim();
    const price =
      trimmed === "" ? null : Number.parseFloat(trimmed);
    if (trimmed !== "" && Number.isNaN(price)) {
      setError("Invalid price");
      return;
    }
    setError("");
    const res = await fetch("/api/services/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, businessId: locationId, price, active: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    fetchAll();
  };

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">
          ← Dashboard
        </a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">{isMain ? "Services" : "Assigned services"}</span>
      </nav>

      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">{isMain ? "Manage services" : "Assigned services"}</h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm mb-8">
          {isMain
            ? "Set catalog pricing and duration, then choose which locations offer each service. Leave override empty to use the base price."
            : "Read-only for this location. Prices shown are effective at this site (including overrides). Switch to your main business in the location menu to edit the catalog or assignments."}
        </p>

        {isMain && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-6 mb-8">
            <h2 className="font-semibold mb-4">{editingId ? "Edit service" : "Add new service"}</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Service name (e.g. Haircut)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              />
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-3 text-[var(--callendra-text-secondary)] text-sm">$</span>
                  <input
                    type="number"
                    placeholder="Base price"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl pl-8 pr-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
                  />
                </div>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    placeholder="Duration (min)"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                    className="w-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
                  />
                </div>
              </div>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={editingId ? handleUpdate : handleAdd}
                  disabled={loading}
                  className="ui-btn-primary py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 sm:flex-1"
                >
                  {loading ? (editingId ? "Saving…" : "Adding…") : editingId ? "Save changes" : "Add service"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={loading}
                    className="border border-[var(--callendra-border)] py-3 rounded-xl text-sm font-medium transition hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] disabled:opacity-50 sm:w-36"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex flex-col gap-3">
          {services.length === 0 ? (
            <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">✂️</div>
              <p className="text-[var(--callendra-text-secondary)] text-sm">No services yet</p>
            </div>
          ) : (
            services.map((s) => (
              <div key={s.id} className="border border-[var(--callendra-border)] rounded-2xl px-6 py-4 hover:border-[var(--callendra-border)] transition">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">
                      ${s.price} · {s.duration} min
                    </div>
                  </div>
                  {isMain && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="text-[var(--callendra-accent)] opacity-90 hover:opacity-100 transition text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                {isMain && branchLocations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--callendra-border)] space-y-3">
                    <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80">Offer at locations (optional price override)</p>
                    {branchLocations.map((loc) => {
                      const on = isServiceAtLocation(s, loc.id);
                      const draftKey = `${s.id}:${loc.id}`;
                      const draft =
                        priceDrafts[s.id]?.[loc.id] ??
                        (on ? getOverride(s, loc.id) : "");
                      return (
                        <div key={loc.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <label className="flex items-center gap-2 text-[var(--callendra-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => toggleLocation(s.id, loc.id, e.target.checked)}
                              className="rounded border-[var(--callendra-border)]"
                            />
                            {loc.name}
                          </label>
                          {on && (
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--callendra-text-secondary)] opacity-80 text-xs">$</span>
                              <input
                                type="text"
                                placeholder="override"
                                value={draft}
                                onChange={(e) => {
                                  setPriceDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], [loc.id]: e.target.value },
                                  }));
                                }}
                                onBlur={() => {
                                  const v =
                                    priceDrafts[s.id]?.[loc.id] ?? getOverride(s, loc.id);
                                  savePrice(s.id, loc.id, v).catch((e) => setError(e.message));
                                }}
                                className="w-24 bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-lg px-2 py-1 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
