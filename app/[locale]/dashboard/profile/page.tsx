"use client";
import { useState, useEffect } from "react";

export default function ProfilePage() {
  const [form, setForm] = useState({
    name: "", phone: "", address: "", primaryColor: "#000000", secondaryColor: "#ffffff"
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", phone: "" });

  useEffect(() => {
    fetch("/api/business")
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setForm({
            name: data.name || "",
            phone: data.phone || "",
            address: data.address || "",
            primaryColor: data.primaryColor || "#000000",
            secondaryColor: data.secondaryColor || "#ffffff",
          });
          setSlug(data.slug || "");
        }
      });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.name) return;
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLocation),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddLocation(false);
      setNewLocation({ name: "", phone: "" });
      alert("New location created! Login again to switch to it.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="border-b border-white/10 px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</a>
        <span className="text-white font-semibold">Business Profile</span>
      </nav>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">Business Profile</h1>
        <p className="text-gray-400 text-sm mb-8">Update your business information.</p>
        <div className="border border-white/10 rounded-2xl p-5 mb-8 flex justify-between items-center">
          <div>
            <div className="text-sm font-medium">Your booking link</div>
            <div className="text-xs text-gray-400 mt-1">Share this with your clients</div>
          </div>
          <a href={`/en/book/${slug}`} target="_blank" className="text-sm text-green-400 hover:text-green-300 transition font-mono">
            /book/{slug}
          </a>
        </div>
        <div className="border border-white/10 rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <h2 className="font-semibold">Basic information</h2>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Business name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="123 Main St, Dallas TX"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm text-gray-400">Primary color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                <span className="text-sm font-mono text-gray-400">{form.primaryColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm text-gray-400">Secondary color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.secondaryColor} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                <span className="text-sm font-mono text-gray-400">{form.secondaryColor}</span>
              </div>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-green-400 text-sm">✓ Saved successfully</p>}
          <button onClick={handleSave} disabled={loading}
            className="bg-wte text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition disabled:opacity-50">
            {loading ? "Saving..." : "Save changes"}
          </button>
        </div>
        <div className="border border-white/10 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold">Locations</h2>
            <button onClick={() => setShowAddLocation(!showAddLocation)}
              className="text-sm text-gray-400 hover:text-white transition">
              + Add location
            </button>
          </div>
          <p className="text-gray-600 text-xs mb-4">Add multiple locations under the same account.</p>
          {showAddLocation && (
            <div className="flex flex-col gap-3 mt-4 border-t border-white/10 pt-4">
              <input type="text" placeholder="Location name" value={newLocation.name}
                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              <input type="tel" placeholder="Phone (optional)" value={newLocation.phone}
                onChange={(e) => setNewLocation({ ...newLocation, phone: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              <button onClick={handleAddLocation}
                className="bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">
                Create location
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
