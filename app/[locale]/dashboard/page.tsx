"use client";
import { useState, useEffect, useRef } from "react";
import { bookingPathForBusiness } from "@/lib/booking-path";
import { isMainBusinessFromPayload } from "@/lib/main-business";

export default function DashboardPage() {
  const [session, setSession] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });
  const [bookingPath, setBookingPath] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [switchingLocation, setSwitchingLocation] = useState(false);
  const locationMenuRef = useRef<HTMLDivElement>(null);

  /** Prefer server `isMainBusiness` (matches canonical main row even when locationSlug was set to "main"). */
  function isMainBusinessPayload(biz: any) {
    if (!biz) return false;
    if (typeof biz.isMainBusiness === "boolean") return biz.isMainBusiness;
    const ls = biz.locationSlug;
    return ls == null || ls === "" || String(ls).trim() === "";
  }

  const fetchData = async () => {
    const [sessionRes, locsRes, bizRes] = await Promise.all([
      fetch("/api/auth/session"),
      fetch("/api/business/locations"),
      fetch("/api/business"),
    ]);
    const sessionData = await sessionRes.json();
    const locsData = await locsRes.json();
    const biz = await bizRes.json();

    if (sessionData.businessId) setSession(sessionData);
    if (Array.isArray(locsData)) setLocations(locsData);
    if (biz?.id) setBusiness(biz);

    if (biz?.id) {
      console.log("[dashboard] business.locationSlug =", biz.locationSlug, "| isMainBusiness =", biz.isMainBusiness);
    }

    const locList = Array.isArray(locsData) ? locsData : [];
    const multiLocation = locList.length > 1;
    const main = biz ? isMainBusinessFromPayload(biz) : false;

    if (multiLocation && main) {
      const cons = await fetch("/api/appointments/consolidated");
      const c = await cons.json();
      if (cons.ok && Array.isArray(c.appointments)) {
        setAppointments(c.appointments);
        setStats({ total: c.total ?? 0, thisWeek: c.thisWeek ?? 0 });
      } else {
        setAppointments([]);
        setStats({ total: 0, thisWeek: 0 });
      }
    } else {
      const aptsRes = await fetch("/api/appointments");
      const aptsData = await aptsRes.json();
      if (aptsData.appointments) {
        setAppointments(aptsData.appointments);
        setStats({ total: aptsData.total, thisWeek: aptsData.thisWeek });
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!locationMenuRef.current?.contains(e.target as Node)) {
        setLocationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!session?.businessId) return;
    Promise.all([fetch("/api/business"), fetch("/api/business/locations")])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([biz, locs]) => {
        if (!biz?.id) return;
        const list = Array.isArray(locs) ? locs : [];
        const parent = biz.parentSlug ?? biz.slug;
        const countForParent = list.filter(
          (l: any) => (l.parentSlug ?? l.slug) === parent
        ).length;
        setBookingPath(
          bookingPathForBusiness(biz.parentSlug, biz.slug, biz.locationSlug, countForParent)
        );
      });
  }, [session]);

  const handleSwitchLocation = async (businessId: string) => {
    if (businessId === session?.businessId) {
      setLocationMenuOpen(false);
      return;
    }
    setSwitchingLocation(true);
    try {
      const res = await fetch("/api/auth/switch-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not switch location");
      }
      window.location.reload();
    } catch (e) {
      console.error(e);
      setSwitchingLocation(false);
    }
  };

  const handleCancel = async (id: string) => {
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    fetchData();
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const bookingHref = bookingPath ? `/en${bookingPath}` : `/en/book/${session?.slug ?? ""}`;
  const isMain = isMainBusinessFromPayload(business);
  const multiLocation = locations.length > 1;
  const singleLocation = locations.length === 1;

  const revenueToday = appointments.reduce((sum, a) => sum + (a.service?.price || 0), 0);

  if (!session) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white animate-pulse">Loading...</div>
    </div>
  );

  if (!business) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white animate-pulse">Loading...</div>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const mainActionsMulti = [
    { label: "Manage staff", icon: "👤", href: "/en/dashboard/staff" },
    { label: "Manage services", icon: "✂️", href: "/en/dashboard/services" },
    { label: "Locations", icon: "🏪", href: "/en/dashboard/locations" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
    { label: "Consolidated reports", icon: "📊", href: "/en/dashboard/reports" },
  ];

  const locationActionsMulti = [
    { label: "Schedule", icon: "🕐", href: "/en/dashboard/schedule" },
    { label: "Today's bookings", icon: "📅", href: "#today" },
    { label: "Display screen", icon: "📺", href: `/en/display/${session.slug}` },
    { label: "Assigned staff", icon: "👥", href: "/en/dashboard/staff" },
    { label: "Assigned services", icon: "💈", href: "/en/dashboard/services" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
  ];

  /** Single business row: full catalog + operations in one place */
  const fullActionsSingle = [
    { label: "Manage staff", icon: "👤", href: "/en/dashboard/staff" },
    { label: "Manage services", icon: "✂️", href: "/en/dashboard/services" },
    { label: "Set schedule", icon: "🕐", href: "/en/dashboard/schedule" },
    { label: "Display screen", icon: "📺", href: `/en/display/${session.slug}` },
    { label: "Today's bookings", icon: "📅", href: "#today" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
    { label: "Locations", icon: "🏪", href: "/en/dashboard/locations" },
  ];

  const quickActions = singleLocation
    ? fullActionsSingle
    : isMain
      ? mainActionsMulti
      : locationActionsMulti;

  return (
    <main className="min-h-screen bg-black text-white">

      <nav className="border-b border-white/10 px-8 py-4 flex justify-between items-center">
        <span className="font-bold text-lg">Callendra</span>
        <div className="flex items-center gap-4">
          <div className="relative" ref={locationMenuRef}>
            <button
              type="button"
              disabled={switchingLocation}
              onClick={() => setLocationMenuOpen((o) => !o)}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white border border-white/10 rounded-lg px-3 py-2 transition disabled:opacity-50 bg-black"
              aria-expanded={locationMenuOpen}
              aria-haspopup="listbox"
            >
              <span>{session.businessName}</span>
              <span className="text-gray-500 text-xs" aria-hidden>▼</span>
            </button>
            {locationMenuOpen && locations.length > 0 && (
              <ul
                role="listbox"
                className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-white/10 bg-black py-1 shadow-lg"
              >
                {locations.map((loc) => {
                  const active = loc.id === session.businessId;
                  return (
                    <li key={loc.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        disabled={switchingLocation}
                        onClick={() => handleSwitchLocation(loc.id)}
                        className={`w-full px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "bg-white/10 text-white font-medium"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {loc.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => window.location.href = "/en/login")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-10">

        <div className="mb-10">
          <h1 className="text-3xl font-bold">{greeting} 👋</h1>
          <p className="text-gray-400 mt-1">
            {singleLocation
              ? `Here's what's happening with ${session.businessName} today.`
              : multiLocation && isMain
                ? "Overview of all your locations."
                : `Here's what's happening with ${session.businessName} today.`}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Today's appointments", value: appointments.length, icon: "📅" },
            { label: "This week", value: stats.thisWeek, icon: "📊" },
            { label: "Total appointments", value: stats.total, icon: "👥" },
            { label: "Revenue today", value: `$${revenueToday.toFixed(0)}`, icon: "💰" },
          ].map((stat) => (
            <div key={stat.label} className="border border-white/10 rounded-2xl p-5">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <a key={action.label} href={action.href}
                className="border border-white/10 rounded-2xl p-5 text-left hover:border-white/30 transition block">
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="text-sm font-medium">{action.label}</div>
              </a>
            ))}
          </div>
        </div>

        {multiLocation && isMain ? (
          <div className="border border-white/10 rounded-2xl p-8 mb-10">
            <h2 className="text-lg font-semibold mb-2">Consolidated view</h2>
            <p className="text-gray-400 text-sm mb-4">
              Schedule, display, and per-location bookings are managed when you switch to a location above.
            </p>
            <a href="/en/dashboard/reports" className="inline-block text-sm text-white border border-white/10 px-4 py-2 rounded-full hover:bg-white/5 transition">
              Open consolidated reports →
            </a>
          </div>
        ) : (
          <div id="today">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Today&apos;s appointments</h2>
              <a href={bookingHref} target="_blank"
                className="text-sm text-gray-400 hover:text-white transition border border-white/10 px-4 py-2 rounded-full">
                🔗 Booking link
              </a>
            </div>

            {appointments.length === 0 ? (
              <div className="border border-white/10 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-gray-400 text-sm">No appointments yet for today</p>
                <a href={bookingHref} target="_blank"
                  className="text-xs text-gray-600 hover:text-gray-400 transition mt-2 block">
                  Share your booking link to get started
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {appointments.map((apt) => (
                  <div key={apt.id} className="border border-white/10 rounded-2xl px-6 py-4 flex justify-between items-center hover:border-white/20 transition">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-mono font-bold text-green-400 w-16">
                        {formatTime(apt.date)}
                      </div>
                      <div>
                        <div className="font-semibold">{apt.clientName}</div>
                        <div className="text-sm text-gray-400">{apt.service?.name} · with {apt.staff?.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-green-400">${apt.service?.price}</span>
                      <button
                        onClick={() => handleCancel(apt.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition border border-white/10 px-3 py-1 rounded-full"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
