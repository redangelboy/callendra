"use client";

import { useEffect, useState } from "react";

type CatalogSvc = { id: string; name: string; duration: number; price: number };

export function DashboardAppointmentExtraModal({
  open,
  appointment,
  onClose,
  onSaved,
}: {
  open: boolean;
  appointment: { id: string; businessId: string; clientName?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [services, setServices] = useState<CatalogSvc[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [customLabel, setCustomLabel] = useState("Extra service");
  const [customPrice, setCustomPrice] = useState("15");
  const [customDuration, setCustomDuration] = useState("15");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !appointment?.businessId) return;
    setError("");
    setMode("catalog");
    setServiceId("");
    setCustomLabel("Extra service");
    setCustomPrice("15");
    setCustomDuration("15");
    void (async () => {
      const res = await fetch(
        `/api/appointments/extras?businessId=${encodeURIComponent(appointment.businessId)}`
      );
      const d = (await res.json()) as { services?: CatalogSvc[] };
      if (res.ok && Array.isArray(d.services)) {
        setServices(d.services);
        if (d.services[0]) setServiceId(d.services[0].id);
      } else {
        setServices([]);
      }
    })();
  }, [open, appointment?.businessId]);

  if (!open || !appointment) return null;

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const body =
        mode === "catalog"
          ? { appointmentId: appointment.id, mode: "catalog" as const, serviceId }
          : {
              appointmentId: appointment.id,
              mode: "custom" as const,
              label: customLabel.trim() || "Extra service",
              price: parseFloat(customPrice),
              durationMin: parseInt(customDuration, 10),
            };
      const res = await fetch("/api/appointments/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add extra");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold text-[var(--callendra-text-primary)]">Add service extra</h3>
        <p className="text-sm text-[var(--callendra-text-secondary)] mt-1">
          Extends this visit for <span className="font-medium text-[var(--callendra-text-primary)]">{appointment.clientName}</span> if
          the barber has no overlapping booking or break.
        </p>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setMode("catalog")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              mode === "catalog"
                ? "ui-btn-primary border-[var(--callendra-border)]"
                : "border-[var(--callendra-border)] text-[var(--callendra-text-secondary)]"
            }`}
          >
            From menu
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              mode === "custom"
                ? "ui-btn-primary border-[var(--callendra-border)]"
                : "border-[var(--callendra-border)] text-[var(--callendra-text-secondary)]"
            }`}
          >
            Custom
          </button>
        </div>

        {mode === "catalog" ? (
          <label className="block mt-4 text-xs text-[var(--callendra-text-secondary)]">
            Service
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
            >
              {services.length === 0 ? (
                <option value="">No services at this location</option>
              ) : (
                services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (${s.price} · {s.duration} min)
                  </option>
                ))
              )}
            </select>
          </label>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-xs text-[var(--callendra-text-secondary)]">
              Label
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--callendra-text-secondary)]">
              Price (USD)
              <input
                type="number"
                min={0}
                step={0.01}
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--callendra-text-secondary)]">
              Extra minutes
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
            </label>
          </div>
        )}

        {error ? <p className="text-red-400 text-sm mt-3">{error}</p> : null}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-[var(--callendra-border)] text-[var(--callendra-text-secondary)]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading || (mode === "catalog" && (!serviceId || services.length === 0))}
            onClick={() => void submit()}
            className="px-4 py-2 rounded-lg text-sm font-medium ui-btn-primary disabled:opacity-50"
          >
            {loading ? "Saving…" : "Add to appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}
