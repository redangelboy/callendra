"use client";
import { useState, useEffect, useMemo } from "react";
import { bookingPathForBusiness } from "@/lib/booking-path";

function countPeersForParent(locations: any[], loc: any) {
  const parent = loc.parentSlug ?? loc.slug;
  return locations.filter((l) => (l.parentSlug ?? l.slug) === parent).length;
}

function normalizeLocationSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocationSlug, setNewLocationSlug] = useState("");
  const [parentSlug, setParentSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [originalSlugSaved, setOriginalSlugSaved] = useState("");
  const [slugEditedByUser, setSlugEditedByUser] = useState(false);

  const fetchLocations = async () => {
    const res = await fetch("/api/business/locations");
    const data = await res.json();
    if (Array.isArray(data)) {
      setLocations(data);
      if (data.length > 0) {
        const p = data[0].parentSlug ?? data[0].slug;
        setParentSlug((prev) => (prev ? prev : p));
      }
    }
  };

  useEffect(() => { fetchLocations(); }, []);

  const defaultParent = useMemo(() => {
    if (locations.length === 0) return "";
    return locations[0].parentSlug ?? locations[0].slug ?? "";
  }, [locations]);

  const handleAdd = async () => {
    if (!newName.trim() || !newLocationSlug.trim()) return;
    const p = parentSlug.trim() || defaultParent;
    if (!p) {
      setError("Brand parent slug is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          phone: newPhone,
          parentSlug: p,
          locationSlug: newLocationSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAdd(false);
      setNewName("");
      setNewPhone("");
      setNewLocationSlug("");
      fetchLocations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const normalizedOrig = normalizeLocationSlug(originalSlugSaved);
      const normalizedCur = normalizeLocationSlug(editing.locationSlug ?? "");
      const locationSlugUpdate =
        slugEditedByUser && normalizedCur !== normalizedOrig;
      if (locationSlugUpdate && !normalizedCur) {
        throw new Error("URL slug must contain letters or numbers");
      }
      const res = await fetch("/api/business/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: editing.name,
          phone: editing.phone,
          address: editing.address,
          retellPhoneNumber: editing.retellPhoneNumber,
          ...(locationSlugUpdate ? { locationSlug: editing.locationSlug, locationSlugUpdate: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(null);
      setSlugEditedByUser(false);
      fetchLocations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    try {
      const res = await fetch("/api/business/locations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchLocations();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">← Dashboard</a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">Locations</span>
      </nav>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Locations</h1>
            <p className="text-[var(--callendra-text-secondary)] text-sm mt-1">Manage your business locations.</p>
          </div>
          <button onClick={() => {
            setShowAdd((v) => {
              const next = !v;
              if (next && defaultParent) setParentSlug(defaultParent);
              return next;
            });
          }}
            className="ui-btn-primary px-4 py-2 rounded-full text-sm font-semibold transition">
            + Add location
          </button>
        </div>
        {showAdd && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-6 mb-6 flex flex-col gap-3">
            <h2 className="font-semibold">New location</h2>
            <input type="text" placeholder="Brand parent slug *" value={parentSlug || defaultParent}
              onChange={(e) => setParentSlug(e.target.value)}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            <input type="text" placeholder="Location slug (e.g. plano) *" value={newLocationSlug}
              onChange={(e) => setNewLocationSlug(e.target.value)}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            <input type="text" placeholder="Location name *" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            <input type="tel" placeholder="Phone (optional)" value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={handleAdd} disabled={loading}
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                {loading ? "Creating..." : "Create"}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {locations.length === 0 ? (
            <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🏪</div>
            <p className="text-[var(--callendra-text-secondary)] text-sm">No locations yet</p>
            </div>
          ) : (
            locations.map((loc) => {
              const n = countPeersForParent(locations, loc);
              const path = bookingPathForBusiness(loc.parentSlug, loc.slug, loc.locationSlug, n);
              return (
              <div key={loc.id} className="border border-[var(--callendra-border)] rounded-2xl p-6">
                {editing?.id === loc.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--callendra-text-secondary)]">Location name</label>
                      <input type="text" value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--callendra-text-secondary)]">URL slug (location segment)</label>
                      <input
                        type="text"
                        value={editing.locationSlug ?? ""}
                        onChange={(e) => {
                          setSlugEditedByUser(true);
                          setEditing({ ...editing, locationSlug: e.target.value });
                        }}
                        placeholder="e.g. plano"
                        className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition font-mono"
                      />
                      {normalizeLocationSlug(editing.locationSlug ?? "") !== normalizeLocationSlug(originalSlugSaved) && (
                        <p className="text-xs text-amber-400/90">
                          Changing the URL slug will break existing booking links.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--callendra-text-secondary)]">Phone</label>
                      <input type="tel" value={editing.phone || ""}
                        onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                        placeholder="+1234567890"
                        className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--callendra-text-secondary)]">Address</label>
                      <input type="text" value={editing.address || ""}
                        onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                        placeholder="123 Main St, City, TX"
                        className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--callendra-text-secondary)]">🤖 AI Agent Phone Number (Retell)</label>
                      <input type="text" value={editing.retellPhoneNumber || ""}
                        onChange={(e) => setEditing({ ...editing, retellPhoneNumber: e.target.value })}
                        placeholder="+19453072113"
                        className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleUpdate(loc.id)} disabled={loading}
                        className="flex-1 ui-btn-primary py-2 rounded-xl text-sm font-semibold">
                        Save
                      </button>
                      <button onClick={() => {
                        setEditing(null);
                        setSlugEditedByUser(false);
                      }}
                        className="flex-1 border border-[var(--callendra-border)] py-2 rounded-xl text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg">{loc.name}</div>
                      {loc.phone && <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">📞 {loc.phone}</div>}
                      {loc.address && <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">📍 {loc.address}</div>}
                      {loc.retellPhoneNumber && <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">🤖 AI Agent: {loc.retellPhoneNumber}</div>}
                      <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-2 font-mono">{path}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        setOriginalSlugSaved(loc.locationSlug ?? "");
                        setSlugEditedByUser(false);
                        setEditing({ ...loc, locationSlug: loc.locationSlug ?? "" });
                      }}
                        className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 border border-[var(--callendra-border)] px-3 py-1 rounded-full transition">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(loc.id)}
                        className="text-sm text-[var(--callendra-text-secondary)] hover:text-red-400 border border-[var(--callendra-border)] px-3 py-1 rounded-full transition">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
