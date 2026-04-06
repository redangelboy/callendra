"use client";
import { useState, useEffect } from "react";
import { isMainBusinessFromPayload } from "@/lib/main-business";

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [isMain, setIsMain] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });
  const [editLoading, setEditLoading] = useState(false);

  const fetchAll = async () => {
    const [staffRes, locRes, bizRes] = await Promise.all([
      fetch("/api/staff"),
      fetch("/api/business/locations"),
      fetch("/api/business"),
    ]);
    const staffData = await staffRes.json();
    const locData = await locRes.json();
    const biz = await bizRes.json();
    if (Array.isArray(staffData)) setStaff(staffData);
    if (Array.isArray(locData)) setLocations(locData);
    if (biz?.id) setIsMain(isMainBusinessFromPayload(biz));
  };

  useEffect(() => { fetchAll(); }, []);

  const branchLocations = locations.filter((loc) => {
    const ls = loc.locationSlug;
    if (ls == null) return false;
    const t = String(ls).trim();
    return t !== "" && t !== "main";
  });

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setName("");
      fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  };

  const handleEdit = async () => {
    if (!editingStaff) return;
    setEditLoading(true);
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingStaff.id, name: editForm.name, phone: editForm.phone, email: editForm.email }),
      });
      if (res.ok) { setEditingStaff(null); fetchAll(); }
    } finally {
      setEditLoading(false);
    }
  };

  const toggleLocation = async (staffId: string, locationId: string, checked: boolean) => {
    setError("");
    try {
      if (checked) {
        const res = await fetch("/api/staff/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId, businessId: locationId, active: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch("/api/staff/assign", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId, businessId: locationId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      fetchAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePhotoUpload = async (staffId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(staffId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: staffId, photo: data.url }),
      });
      fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">← Dashboard</a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">{isMain ? "Staff" : "Assigned staff"}</span>
      </nav>

      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">{isMain ? "Manage staff" : "Assigned staff"}</h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm mb-8">
          {isMain
            ? "Staff are shared across locations. Assign each person to the locations where they work."
            : "Read-only list for this location."}
        </p>

        {isMain && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-6 mb-8">
            <h2 className="font-semibold mb-4">Add new staff member</h2>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Staff member name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1 bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              />
              <button onClick={handleAdd} disabled={loading}
                className="ui-btn-primary px-6 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                {loading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex flex-col gap-3">
          {staff.length === 0 ? (
            <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">👤</div>
              <p className="text-[var(--callendra-text-secondary)] text-sm">No staff members yet</p>
            </div>
          ) : (
            staff.map((s) => (
              <div key={s.id} className="border border-[var(--callendra-border)] rounded-2xl px-6 py-4 hover:border-[var(--callendra-border)] transition">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer relative group">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] flex items-center justify-center">
                        {s.photo ? (
                          <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold">{s.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      {isMain && (
                        <>
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span className="text-[var(--callendra-text-primary)] text-xs">{uploadingId === s.id ? "..." : "📷"}</span>
                          </div>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(e) => handlePhotoUpload(s.id, e)}
                            disabled={uploadingId === s.id} />
                        </>
                      )}
                    </label>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      {s.phone && <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-0.5">{s.phone}</div>}
                      {s.email && <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80">{s.email}</div>}
                    </div>
                  </div>
                  {isMain && (
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => { setEditingStaff(s); setEditForm({ name: s.name, phone: s.phone || "", email: s.email || "" }); }}
                        className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(s.id)}
                        className="text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition text-sm">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                {isMain && branchLocations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--callendra-border)]">
                    <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mb-2">Locations</p>
                    <div className="flex flex-wrap gap-3">
                      {branchLocations.map((loc) => {
                        const ids: string[] = s.assignedLocationIds || [];
                        const checked = ids.includes(loc.id);
                        return (
                          <label key={loc.id} className="flex items-center gap-2 text-sm text-[var(--callendra-text-secondary)] cursor-pointer">
                            <input
                              type="checkbox"
                        checked={checked}
                              onChange={(e) => toggleLocation(s.id, loc.id, e.target.checked)}
                              className="rounded border-[var(--callendra-border)]"
                            />
                            {loc.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_65%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Edit staff member</h2>
            <div className="space-y-3">
              <input
                placeholder="Name *"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
              <input
                placeholder="Phone (optional)"
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
              <input
                placeholder="Email (optional)"
                value={editForm.email}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleEdit} disabled={editLoading}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition disabled:opacity-50">
                {editLoading ? "Saving..." : "Save changes"}
              </button>
              <button onClick={() => setEditingStaff(null)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
