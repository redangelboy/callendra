"use client";

import { useEffect, useState } from "react";

type Stats = {
  totalBusinesses: number;
  appointmentsToday: number;
  activeInviteCodes: number;
  totalOwners: number;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/stats", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load stats");
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = stats
    ? [
        { label: "Total businesses", value: stats.totalBusinesses },
        { label: "Appointments today", value: stats.appointmentsToday },
        { label: "Active invite codes", value: stats.activeInviteCodes },
        { label: "Owners registered", value: stats.totalOwners },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-6">Dashboard</h1>
      {error && <p className="text-red-400 mb-4">{error}</p>}
      {!stats && !error && <p className="text-zinc-500">Loading…</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-6 shadow-sm"
          >
            <div className="text-sm text-zinc-500">{c.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-white">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
