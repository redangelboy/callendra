"use client";
import { useState, useEffect } from "react";

export default function ReportsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/appointments/consolidated")
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 403) throw new Error("Switch to your main business (location switcher) to view consolidated reports.");
        if (!r.ok) throw new Error(data.error || "Failed to load");
        setRows(data.appointments || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // Agrupar por sucursal
  const grouped: Record<string, any[]> = {};
  rows.forEach((apt) => {
    const name = apt.business?.name ?? "Unknown";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(apt);
  });

  const grandTotal = rows.reduce((sum, apt) => sum + (apt.service?.price ?? 0), 0);

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">← Dashboard</a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">Consolidated reports</span>
      </nav>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">Today across all locations</h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm mb-8">Appointments scheduled for today at every active location.</p>

        {loading && <p className="text-[var(--callendra-text-secondary)] opacity-80 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center text-[var(--callendra-text-secondary)] text-sm">No appointments today.</div>
        )}

        {!loading && rows.length > 0 && (
          <div className="flex flex-col gap-8">
            {Object.entries(grouped).map(([locationName, apts]) => {
              const locationTotal = apts.reduce((sum, apt) => sum + (apt.service?.price ?? 0), 0);
              return (
                <div key={locationName}>
                  {/* Header sucursal */}
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-semibold text-[var(--callendra-text-secondary)] uppercase tracking-wider">{locationName}</h2>
                    <span className="text-xs text-[var(--callendra-text-secondary)] opacity-80">{apts.length} appointment{apts.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Tabla */}
                  <div className="border border-[var(--callendra-border)] rounded-2xl overflow-hidden">
                    {/* Header cols */}
                    <div className="grid grid-cols-12 px-5 py-2 border-b border-[var(--callendra-border)] text-xs text-[var(--callendra-text-secondary)] opacity-80 uppercase tracking-wider">
                      <span className="col-span-2">Time</span>
                      <span className="col-span-3">Client</span>
                      <span className="col-span-4">Service</span>
                      <span className="col-span-2">Barber</span>
                      <span className="col-span-1 text-right">$</span>
                    </div>

                    {apts.map((apt, i) => (
                      <div key={apt.id}
                        className={`grid grid-cols-12 px-5 py-3 text-sm items-center ${i !== apts.length - 1 ? "border-b border-[var(--callendra-border)]" : ""}`}>
                        <span className="col-span-2 font-mono text-[var(--callendra-accent)] text-xs">{formatTime(apt.date)}</span>
                        <span className="col-span-3 font-medium truncate">{apt.clientName}</span>
                        <span className="col-span-4 text-[var(--callendra-text-secondary)] truncate">{apt.service?.name ?? "—"}</span>
                        <span className="col-span-2 text-[var(--callendra-text-secondary)] truncate">{apt.staff?.name ?? "—"}</span>
                        <span className="col-span-1 text-right text-[var(--callendra-accent)]">${apt.service?.price ?? 0}</span>
                      </div>
                    ))}

                    {/* Subtotal sucursal */}
                    <div className="grid grid-cols-12 px-5 py-3 border-t border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] text-sm font-semibold">
                      <span className="col-span-11 text-[var(--callendra-text-secondary)]">Subtotal — {locationName}</span>
                      <span className="col-span-1 text-right text-[var(--callendra-text-primary)]">${locationTotal}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Gran total */}
            <div className="border border-[var(--callendra-border)] rounded-2xl px-5 py-4 flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-[var(--callendra-text-primary)]">Grand total</div>
                <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80">{rows.length} appointments across {Object.keys(grouped).length} location{Object.keys(grouped).length !== 1 ? "s" : ""}</div>
              </div>
              <div className="text-2xl font-bold text-[var(--callendra-accent)]">${grandTotal}</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
