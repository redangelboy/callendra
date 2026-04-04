"use client";
import { useState, useEffect } from "react";
import { bookingPathForBusiness } from "@/lib/booking-path";

export default function ProfilePage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    notificationPhone: "",
    address: "",
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    logo: "",
    retellPhoneNumber: "",
  });
  const [showNotificationPhone, setShowNotificationPhone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [isMainBusiness, setIsMainBusiness] = useState(false);
  const [hasLocations, setHasLocations] = useState(false);
  const [bookingPath, setBookingPath] = useState("");
  const [mainLocationLinks, setMainLocationLinks] = useState<{ id: string; name: string; path: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await fetch("/api/business");
      const data = await a.json();
      if (!data.id || cancelled) return;

      const hasNotif = "notificationPhone" in data;
      setShowNotificationPhone(hasNotif);
      setForm({
        name: data.name || "",
        phone: data.phone || "",
        notificationPhone: hasNotif ? data.notificationPhone || "" : "",
        address: data.address || "",
        primaryColor: data.primaryColor || "#000000",
        secondaryColor: data.secondaryColor || "#ffffff",
        logo: data.logo || "",
        retellPhoneNumber: data.retellPhoneNumber || "",
      });
      setSlug(data.slug || "");

      const isMain = !!data.isMainBusiness;
      setIsMainBusiness(isMain);

      const locRes = await fetch("/api/business/locations");
      const locs = await locRes.json();
      if (cancelled) return;
      const list = Array.isArray(locs) ? locs : [];
      const locationCount = list.filter((l: any) => l.parentSlug === data.slug).length;
      const hasBranchLocations = locationCount > 0;
      setHasLocations(hasBranchLocations);

      if (!isMain) {
        const countForParent = list.filter(
          (l: any) => (l.parentSlug ?? l.slug) === (data.parentSlug ?? data.slug)
        ).length;
        setMainLocationLinks([]);
        setBookingPath(
          bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent)
        );
        return;
      }

      const brandLocs = list.filter(
        (l: any) => (l.parentSlug ?? l.slug) === data.slug
      );
      const countForParent = brandLocs.length;

      if (hasBranchLocations) {
        const linksOnly = brandLocs
          .filter((l: any) => {
            const ls = (l.locationSlug ?? "").trim();
            return ls !== "" && ls !== "main";
          })
          .map((l: any) => {
            const parentSlug = l.parentSlug ?? l.slug;
            const locationSlug = (l.locationSlug ?? "").trim() || "main";
            return {
              id: l.id,
              name: l.name || "Location",
              path: `/book/${parentSlug}/${locationSlug}`,
            };
          });
        setMainLocationLinks(linksOnly);
        if (linksOnly.length === 0) {
          setBookingPath(
            bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent)
          );
        } else {
          setBookingPath("");
        }
      } else {
        setMainLocationLinks([]);
        setBookingPath(
          bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent)
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm((prev) => ({ ...prev, logo: data.url }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

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

  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="border-b border-white/10 px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</a>
        <span className="text-white font-semibold">Business Profile</span>
      </nav>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">Business Profile</h1>
        <p className="text-gray-400 text-sm mb-8">Update your business information.</p>
        <div className="border border-white/10 rounded-2xl p-5 mb-8">
          {isMainBusiness && hasLocations && mainLocationLinks.length > 0 ? (
            <>
              <div className="mb-4">
                <div className="text-sm font-medium">Your booking links</div>
                <div className="text-xs text-gray-400 mt-1">Share these with your clients</div>
              </div>
              <ul className="flex flex-col divide-y divide-white/10">
                {mainLocationLinks.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm text-white">{row.name}</span>
                    <a
                      href={`/en${row.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-400 hover:text-green-300 transition font-mono break-all sm:text-right"
                    >
                      {row.path}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Your booking link</div>
                <div className="text-xs text-gray-400 mt-1">Share this with your clients</div>
              </div>
              <a
                href={bookingPath ? `/en${bookingPath}` : `/en/book/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-400 hover:text-green-300 transition font-mono break-all sm:text-right"
              >
                {bookingPath || `/book/${slug}`}
              </a>
            </div>
          )}
        </div>
        <div className="border border-white/10 rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <h2 className="font-semibold">Logo</h2>
          <div className="flex items-center gap-6">
            {form.logo ? (
              <img src={form.logo} alt="Logo" className="w-20 h-20 rounded-2xl object-contain border border-white/10" />
            ) : (
              <div className="w-20 h-20 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-gray-500 text-xs">No logo</div>
            )}
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer bg-white/10 hover:bg-white/20 transition px-4 py-2 rounded-xl text-sm font-medium">
                {uploading ? "Uploading..." : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
              </label>
              <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
            </div>
          </div>
        </div>
        <div className="border border-white/10 rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <h2 className="font-semibold">Basic information</h2>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Business name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Business phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          {showNotificationPhone && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">Notification phone (optional)</label>
              <input
                type="tel"
                value={form.notificationPhone}
                onChange={(e) => setForm({ ...form, notificationPhone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
              />
              <p className="text-xs text-gray-500">SMS for cancel requests and alerts. Falls back to business phone if empty.</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="123 Main St, Dallas TX"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          {(!isMainBusiness || !hasLocations) && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">AI Agent Phone Number</label>
              <input type="tel" value={form.retellPhoneNumber} onChange={(e) => setForm({ ...form, retellPhoneNumber: e.target.value })}
                placeholder="+19453072113"
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              <p className="text-xs text-gray-500">Phone number assigned by Retell AI for this location</p>
            </div>
          )}
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
            className="bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition disabled:opacity-50">
            {loading ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </main>
  );
}
