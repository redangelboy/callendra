"use client";
import { useState, useEffect } from "react";

export default function DashboardPage() {
  const [session, setSession] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });

  const fetchData = async () => {
    const [sessionRes, aptsRes] = await Promise.all([
      fetch("/api/auth/session"),
      fetch("/api/appointments"),
    ]);
    const sessionData = await sessionRes.json();
    const aptsData = await aptsRes.json();
    if (sessionData.businessId) setSession(sessionData);
    if (aptsData.appointments) {
      setAppointments(aptsData.appointments);
      setStats({ total: aptsData.total, thisWeek: aptsData.thisWeek });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  if (!session) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white animate-pulse">Loading...</div>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="border-b border-white/10 px-8 py-4 flex justify-between items-center">
        <span className="font-bold text-lg">Reservify</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{session.businessName}</span>
          <button
            onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => window.location.href = "/en/login")}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-10">

        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold">{greeting} 👋</h1>
          <p className="text-gray-400 mt-1">Here's what's happening with {session.businessName} today.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Today's appointments", value: appointments.length, icon: "📅" },
            { label: "This week", value: stats.thisWeek, icon: "📊" },
            { label: "Total appointments", value: stats.total, icon: "👥" },
            { label: "Revenue today", value: `$${appointments.reduce((sum, a) => sum + (a.service?.price || 0), 0)}`, icon: "💰" },
          ].map((stat) => (
            <div key={stat.label} className="border border-white/10 rounded-2xl p-5">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Add staff", icon: "👤", href: "/en/dashboard/staff" },
              { label: "Add service", icon: "✂️", href: "/en/dashboard/services" },
              { label: "Set schedule", icon: "🕐", href: "/en/dashboard/schedule" },
              { label: "Display screen", icon: "📺", href: `/en/display/${session.slug}` },
              { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
            ].map((action) => (
              <a key={action.label} href={action.href}
                className="border border-white/10 rounded-2xl p-5 text-left hover:border-white/30 transition block">
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="text-sm font-medium">{action.label}</div>
              </a>
            ))}
          </div>
        </div>

        {/* Today's appointments */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Today's appointments</h2>
            <a href={`/en/book/${session.slug}`} target="_blank"
              className="text-sm text-gray-400 hover:text-white transition border border-white/10 px-4 py-2 rounded-full">
              🔗 Booking link
            </a>
          </div>

          {appointments.length === 0 ? (
            <div className="border border-white/10 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-gray-400 text-sm">No appointments yet for today</p>
              <a href={`/en/book/${session.slug}`} target="_blank"
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

      </div>
    </main>
  );
}