"use client";

import { useState, useEffect, useMemo } from "react";
import { DateTime } from "luxon";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { StaffAvatar } from "@/components/staff-avatar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextBusinessDays(count: number): DateTime[] {
  const start = DateTime.now().setZone(BUSINESS_TIMEZONE).startOf("day");
  return Array.from({ length: count }, (_, i) => start.plus({ days: i }));
}

function availabilityBaseQuery(business: {
  slug: string;
  parentSlug?: string | null;
  locationSlug?: string | null;
}) {
  const qs = new URLSearchParams();
  qs.set("parentSlug", (business.parentSlug ?? business.slug ?? "").trim());
  const loc = (business.locationSlug ?? "").trim();
  if (loc) qs.set("locationSlug", loc);
  return qs;
}

type StaffRow = { id: string; name: string; photo?: string | null };
type ServiceRow = { id: string; name: string; price: number; duration: number };

export function DashboardNewAppointmentModal({
  open,
  onClose,
  business,
  staffList,
  serviceList,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  business: { slug: string; parentSlug?: string | null; locationSlug?: string | null } | null;
  staffList: StaffRow[];
  serviceList: ServiceRow[];
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedStaff, setSelectedStaff] = useState<StaffRow | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [form, setForm] = useState({ clientName: "", clientPhone: "", clientEmail: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedStaff(null);
      setSelectedService(null);
      setSelectedDate("");
      setSelectedTime("");
      setSlots([]);
      setForm({ clientName: "", clientPhone: "", clientEmail: "" });
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !business || !selectedStaff || !selectedService || !selectedDate) {
      setSlots([]);
      return;
    }
    const qs = availabilityBaseQuery(business);
    qs.set("staffId", selectedStaff.id);
    qs.set("serviceId", selectedService.id);
    qs.set("date", selectedDate);
    fetch(`/api/book/availability?${qs}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []));
  }, [open, business, selectedStaff, selectedService, selectedDate]);

  useEffect(() => {
    if (!open || step !== 3) return;
    const todayBiz = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
    if (selectedDate !== todayBiz) return;
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [open, step, selectedDate]);

  const displaySlots = useMemo(() => {
    if (!selectedDate) return [];
    const todayBiz = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
    if (selectedDate !== todayBiz) return slots;
    const now = Date.now();
    return slots.filter((slot) => {
      const parts = slot.split(":");
      const h = Number(parts[0]);
      const min = Number(parts[1]);
      if (Number.isNaN(h) || Number.isNaN(min)) return true;
      const [y, mo, d] = selectedDate.split("-").map(Number);
      const slotTime = DateTime.fromObject(
        { year: y, month: mo, day: d, hour: h, minute: min },
        { zone: BUSINESS_TIMEZONE }
      );
      return slotTime.toMillis() > now;
    });
  }, [slots, selectedDate, nowTick]);

  const handleCreate = async () => {
    if (!selectedStaff || !selectedService || !selectedDate || !selectedTime) {
      setError("Complete staff, service, date and time");
      return;
    }
    if (!form.clientName.trim()) {
      setError("Client name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.clientName.trim(),
          clientPhone: form.clientPhone.trim() || "",
          clientEmail: form.clientEmail.trim() || undefined,
          staffId: selectedStaff.id,
          serviceId: selectedService.id,
          date: selectedDate,
          time: selectedTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not create appointment");
      }
      onCreated();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  if (!open || !business) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-black/40 backdrop-blur-md">
      <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start gap-4 mb-4">
          <h2 className="text-lg font-semibold">New appointment</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--callendra-text-secondary)] text-sm hover:opacity-90"
          >
            Close
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  step >= s
                    ? "ui-btn-primary"
                    : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] text-[var(--callendra-text-secondary)] opacity-80"
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`w-8 h-px ${
                    step > s ? "bg-[var(--callendra-accent)]" : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_15%,var(--callendra-bg))]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <h3 className="font-semibold mb-3">Choose staff</h3>
            {staffList.length === 0 ? (
              <p className="text-sm text-[var(--callendra-text-secondary)] py-4 text-center">
                No staff assigned to this location.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {staffList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaff(s);
                    setStep(2);
                  }}
                  className="border border-[var(--callendra-border)] rounded-2xl px-4 py-3 text-left hover:border-[var(--callendra-accent)] transition flex items-center gap-4"
                >
                  <StaffAvatar name={s.name} photo={s.photo} size="book" />
                  <span className="font-medium text-[var(--callendra-text-primary)]">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && selectedStaff && (
          <div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90"
            >
              ← Back
            </button>
            <h3 className="font-semibold mb-3">Choose service</h3>
            {serviceList.length === 0 ? (
              <p className="text-sm text-[var(--callendra-text-secondary)] py-4 text-center">
                No services at this location.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {serviceList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedService(s);
                    setStep(3);
                  }}
                  className="border border-[var(--callendra-border)] rounded-2xl px-4 py-3 text-left hover:border-[var(--callendra-accent)] transition"
                >
                  <div className="font-medium text-[var(--callendra-text-primary)]">{s.name}</div>
                  <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">
                    ${s.price} · {s.duration ?? 30} min
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && selectedStaff && selectedService && (
          <div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90"
            >
              ← Back
            </button>
            <h3 className="font-semibold mb-2">Date & time</h3>
            <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mb-3">
              Times are US Central ({BUSINESS_TIMEZONE}). Only slots within staff schedule are shown.
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {getNextBusinessDays(30).map((dt) => {
                const dateStr = dt.toFormat("yyyy-LL-dd");
                const dow = dt.weekday === 7 ? 0 : dt.weekday;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setSelectedTime("");
                    }}
                    className={`flex-shrink-0 w-14 rounded-xl py-3 text-center transition border ${
                      selectedDate === dateStr
                        ? "ui-btn-primary border-[var(--callendra-border)]"
                        : "border-[var(--callendra-border)] hover:border-[var(--callendra-accent)]"
                    }`}
                  >
                    <div className="text-xs">{DAYS[dow]}</div>
                    <div className="font-bold text-lg">{dt.day}</div>
                  </button>
                );
              })}
            </div>
            {selectedDate && (
              <>
                {displaySlots.length === 0 ? (
                  <p className="text-[var(--callendra-text-secondary)] text-sm text-center py-4">
                    No available slots for this day
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {displaySlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setSelectedTime(slot);
                          setStep(4);
                        }}
                        className={`border rounded-xl py-3 text-sm font-medium transition ${
                          selectedTime === slot
                            ? "ui-btn-primary border-[var(--callendra-border)]"
                            : "border-[var(--callendra-border)] hover:border-[var(--callendra-accent)]"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 4 && selectedStaff && selectedService && (
          <div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90"
            >
              ← Back
            </button>
            <h3 className="font-semibold mb-3">Client details</h3>
            <div className="border border-[var(--callendra-border)] rounded-2xl p-4 mb-4 flex items-start gap-4 text-sm text-[var(--callendra-text-secondary)]">
              <StaffAvatar name={selectedStaff.name} photo={selectedStaff.photo} size="book" />
              <div className="min-w-0">
                <div className="text-[var(--callendra-text-primary)]">
                  {selectedStaff.name} · {selectedService.name}
                </div>
                <div>
                  {selectedDate} {selectedTime}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Client name *"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] text-[var(--callendra-text-primary)]"
              />
              <input
                type="tel"
                placeholder="Phone (optional, for SMS confirmation)"
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] text-[var(--callendra-text-primary)]"
              />
              <input
                type="email"
                placeholder="Email (optional, for confirmation)"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] text-[var(--callendra-text-primary)]"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="button"
                disabled={loading}
                onClick={handleCreate}
                className="ui-btn-primary py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50"
              >
                {loading ? "Saving…" : "Create appointment"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
