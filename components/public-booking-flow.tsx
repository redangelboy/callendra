"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useParams, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { StaffAvatar } from "@/components/staff-avatar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextBusinessDays(count: number): DateTime[] {
  const start = DateTime.now().setZone(BUSINESS_TIMEZONE).startOf("day");
  return Array.from({ length: count }, (_, i) => start.plus({ days: i }));
}

function useEmbedMode(): boolean {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const e = searchParams.get("embed");
    const w = searchParams.get("widget");
    return e === "1" || e === "true" || w === "1" || w === "true";
  }, [searchParams]);
}

function useEmbedHeightPostMessage(enabled: boolean) {
  const send = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      window.parent?.postMessage({ type: "callendra-booking-resize", height: h }, "*");
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    send();
    const ro = new ResizeObserver(() => send());
    ro.observe(document.documentElement);
    window.addEventListener("load", send);
    const t1 = window.setTimeout(send, 100);
    const t2 = window.setTimeout(send, 600);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", send);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enabled, send]);
}

const viewportShell =
  "flex h-[100dvh] max-h-[100dvh] min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--callendra-bg)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]";

export type PublicBookingFlowProps = {
  /** Secret from `?token=` — kiosk / iPad walk-in mode (no reCAPTCHA, no IP rate limit). */
  walkInToken?: string | null;
};

export function PublicBookingFlow({ walkInToken = null }: PublicBookingFlowProps) {
  const isWalkIn = !!walkInToken?.trim();
  const isEmbed = useEmbedMode();
  useEmbedHeightPostMessage(isEmbed);
  const searchParams = useSearchParams();

  const { executeRecaptcha } = useGoogleReCaptcha();
  const params = useParams();
  const segments = useMemo(() => {
    const raw = params.slug as string | string[] | undefined;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }, [params.slug]);

  const parentSlug = segments[0] ?? "";
  const locationSlug = segments[1];
  const preselectedStaffId = searchParams.get("staffId")?.trim() ?? "";

  const bookQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (parentSlug) qs.set("parentSlug", parentSlug);
    if (locationSlug) qs.set("locationSlug", locationSlug);
    if (walkInToken?.trim()) qs.set("token", walkInToken.trim());
    return qs.toString();
  }, [parentSlug, locationSlug, walkInToken]);

  const [business, setBusiness] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [form, setForm] = useState({ clientName: "", clientPhone: "", clientEmail: "" });
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [nextModalOpen, setNextModalOpen] = useState(false);
  const [nextSearchingServiceId, setNextSearchingServiceId] = useState<string | null>(null);
  const [nextResult, setNextResult] = useState<null | {
    staffId: string;
    staffName: string;
    date: string;
    time: string;
    serviceId: string;
  }>(null);
  const [nextError, setNextError] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  /** Walk-in kiosk: seconds until auto-return to step 1 (null = not counting). */
  const [walkInAutoResetSeconds, setWalkInAutoResetSeconds] = useState<number | null>(null);

  const resetBookingFlowToStart = useCallback(() => {
    setConfirmed(false);
    setStep(1);
    setSelectedStaff(null);
    setSelectedService(null);
    setSelectedDate("");
    setSelectedTime("");
    setForm({ clientName: "", clientPhone: "", clientEmail: "" });
    setError("");
    setWalkInAutoResetSeconds(null);
  }, []);

  useEffect(() => {
    if (!confirmed || !isWalkIn) {
      setWalkInAutoResetSeconds(null);
      return;
    }
    let remaining = 10;
    setWalkInAutoResetSeconds(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(id);
        setWalkInAutoResetSeconds(null);
        resetBookingFlowToStart();
      } else {
        setWalkInAutoResetSeconds(remaining);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [confirmed, isWalkIn, resetBookingFlowToStart]);

  const contentMaxW = "w-full max-w-lg sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl";
  const slotGridClass = "grid min-w-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2";

  const staffCount = business?.staff?.length ?? 0;
  const lgStaffGridClass =
    staffCount <= 1
      ? "lg:grid-cols-1"
      : staffCount === 2
        ? "lg:grid-cols-2"
        : staffCount === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-4";

  const serviceCount = business?.services?.length ?? 0;
  const lgServiceGridClass =
    serviceCount <= 1
      ? "lg:grid-cols-1"
      : serviceCount === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-3";

  useEffect(() => {
    if (!parentSlug) return;
    setLoadError(null);
    fetch(`/api/book?${bookQuery}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setLoadError(data.error || "Not found");
          setBusiness(null);
          return;
        }
        setBusiness(data);
      });
  }, [bookQuery, parentSlug]);

  useEffect(() => {
    if (!preselectedStaffId || !business || selectedStaff) return;
    const match = (business.staff ?? []).find((s: any) => s.id === preselectedStaffId);
    if (!match) return;
    setSelectedStaff(match);
    setStep(2);
  }, [preselectedStaffId, business, selectedStaff]);

  useEffect(() => {
    if (!parentSlug || !selectedStaff || !selectedService || !selectedDate) return;
    const qs = new URLSearchParams(bookQuery);
    qs.set("staffId", selectedStaff.id);
    qs.set("serviceId", selectedService.id);
    qs.set("date", selectedDate);
    fetch(`/api/book/availability?${qs}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []));
  }, [bookQuery, parentSlug, selectedStaff, selectedService, selectedDate]);

  useEffect(() => {
    if (step !== 3) return;
    const todayBiz = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
    if (selectedDate !== todayBiz) return;
    const tickInterval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(tickInterval);
  }, [step, selectedDate]);

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

  const handleBook = async () => {
    if (!form.clientName.trim()) {
      setError("Name is required");
      return;
    }
    if (!isWalkIn && !form.clientPhone.trim()) {
      setError("Phone is required for online booking");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let recaptchaToken = "";
      if (!isWalkIn && executeRecaptcha) {
        try {
          recaptchaToken = await executeRecaptcha("book_appointment");
        } catch {
          /* optional */
        }
      }
      const body: Record<string, unknown> = {
        parentSlug,
        ...(locationSlug ? { locationSlug } : {}),
        staffId: selectedStaff.id,
        serviceId: selectedService.id,
        date: selectedDate,
        time: selectedTime,
        ...form,
        recaptchaToken,
      };
      if (isWalkIn && walkInToken) body.walkInToken = walkInToken.trim();

      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmed(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextAvailableSearch = async (service: any) => {
    if (!service?.id) return;
    setNextError("");
    setNextResult(null);
    setNextSearchingServiceId(service.id);
    try {
      const qs = new URLSearchParams(bookQuery);
      qs.set("serviceId", service.id);
      const res = await fetch(`/api/book/next-available?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find availability");
      if (!data.available) {
        setNextError("No availability in the next 7 days");
        return;
      }
      const result = {
        staffId: String(data.staffId),
        staffName: String(data.staffName ?? ""),
        date: String(data.date),
        time: String(data.time),
        serviceId: String(service.id),
      };
      const todayBiz = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
      if (result.date === todayBiz) {
        const staff = business?.staff?.find((s: any) => s.id === result.staffId);
        if (!staff) throw new Error("Staff not available");
        setSelectedStaff(staff);
        setSelectedService(service);
        setSelectedDate(result.date);
        setSelectedTime(result.time);
        setStep(4);
        setNextModalOpen(false);
        return;
      }
      setNextResult(result);
    } catch (e: unknown) {
      setNextError(e instanceof Error ? e.message : "Error");
    } finally {
      setNextSearchingServiceId(null);
    }
  };

  const confirmNextAvailableResult = () => {
    if (!nextResult) return;
    const staff = business?.staff?.find((s: any) => s.id === nextResult.staffId);
    const service = business?.services?.find((s: any) => s.id === nextResult.serviceId);
    if (!staff || !service) {
      setNextError("Could not apply next available selection.");
      return;
    }
    setSelectedStaff(staff);
    setSelectedService(service);
    setSelectedDate(nextResult.date);
    setSelectedTime(nextResult.time);
    setStep(4);
    setNextModalOpen(false);
  };

  const tagline = isWalkIn ? "Walk-in — book your appointment" : "Book an appointment";

  if (!parentSlug)
    return (
      <div className={`${viewportShell} items-center justify-center`}>
        <div className="text-[var(--callendra-text-primary)]">Invalid booking link</div>
      </div>
    );

  if (loadError)
    return (
      <div className={`${viewportShell} items-center justify-center px-4`}>
        <div className="text-center text-red-400 max-w-md overflow-y-auto">{loadError}</div>
      </div>
    );

  if (!business)
    return (
      <div className={`${viewportShell} items-center justify-center`}>
        <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
      </div>
    );

  if (confirmed)
    return (
      <div className={`${viewportShell}`}>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-contain px-4 py-6">
          <div className={`m-auto w-full text-center ${isEmbed ? "max-w-lg" : "max-w-sm"}`}>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-[var(--callendra-text-primary)] mb-2">Booking Confirmed!</h1>
            <p className="text-[var(--callendra-text-secondary)]">Your appointment at {business.name} is confirmed.</p>
            {isWalkIn && walkInAutoResetSeconds != null ? (
              <p className="text-xs text-[var(--callendra-text-secondary)] mt-3 tabular-nums">
                Next guest in <span className="font-semibold text-[var(--callendra-text-primary)]">{walkInAutoResetSeconds}</span>s
                — or tap below to start now
              </p>
            ) : null}
            <div className="mt-6 border border-[var(--callendra-border)] rounded-2xl p-6 text-left max-w-sm mx-auto">
              <div className="flex items-start gap-4 mb-4">
                {selectedStaff && (
                  <StaffAvatar name={selectedStaff.name} photo={selectedStaff.photo} size="book" />
                )}
                <div className="text-sm text-[var(--callendra-text-secondary)] space-y-2 flex-1 min-w-0">
                  <div>
                    <span className="text-[var(--callendra-text-primary)] font-medium">Service:</span>{" "}
                    {selectedService?.name}
                  </div>
                  <div>
                    <span className="text-[var(--callendra-text-primary)] font-medium">With:</span>{" "}
                    {selectedStaff?.name}
                  </div>
                  <div>
                    <span className="text-[var(--callendra-text-primary)] font-medium">Date:</span> {selectedDate}
                  </div>
                  <div>
                    <span className="text-[var(--callendra-text-primary)] font-medium">Time:</span> {selectedTime}
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={resetBookingFlowToStart}
              className="mt-6 text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 transition"
            >
              Book another appointment
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <main className={viewportShell}>
      <div className={`shrink-0 px-4 pt-3 sm:pt-4 ${contentMaxW} mx-auto`}>
        <div className="text-center mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">{business.name}</h1>
          <p className="text-[var(--callendra-text-secondary)] text-sm mt-1">{tagline}</p>
        </div>
        <div className="flex items-center justify-center gap-2 mb-4 sm:mb-5">
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
                    step > s
                      ? "bg-[var(--callendra-accent)]"
                      : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_15%,var(--callendra-bg))]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={`flex flex-1 min-h-0 flex-col ${contentMaxW} mx-auto px-4 pb-3`}>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 [scrollbar-width:thin] [scrollbar-color:var(--callendra-border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--callendra-text-primary)_30%,transparent)]">
          {step === 1 && (
            <div>
              <h2 className="font-semibold mb-3">Choose your barber</h2>
              <div
                className={`grid min-w-0 gap-3 grid-cols-1 ${staffCount > 1 ? "sm:grid-cols-2" : ""} ${lgStaffGridClass}`}
              >
                {business.staff.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStaff(s);
                      setStep(2);
                    }}
                    className="border border-[var(--callendra-border)] rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-left hover:border-[var(--callendra-accent)] transition flex items-center gap-4 min-h-0 min-w-0 h-full"
                  >
                    <StaffAvatar name={s.name} photo={s.photo} size="book" />
                    <span className="font-medium">{s.name}</span>
                  </button>
                ))}
              </div>
              {!isWalkIn ? (
                <div className="mt-4 pt-4 border-t border-[var(--callendra-border)]">
                  <button
                    type="button"
                    onClick={() => {
                      setNextError("");
                      setNextResult(null);
                      setNextModalOpen(true);
                    }}
                    className="w-full border border-dashed border-[var(--callendra-accent)]/60 rounded-2xl px-4 py-3 text-left hover:border-[var(--callendra-accent)] transition"
                  >
                    <div className="font-semibold text-[var(--callendra-accent)]">⚡ Next Available</div>
                    <div className="text-xs text-[var(--callendra-text-secondary)] mt-1">
                      Let us find the first open slot for you
                    </div>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90 transition"
              >
                ← Back
              </button>
              <h2 className="font-semibold mb-3">Choose a service</h2>
              <div
                className={`grid min-w-0 gap-3 grid-cols-1 ${serviceCount > 1 ? "sm:grid-cols-2" : ""} ${lgServiceGridClass}`}
              >
                {business.services.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedService(s);
                      setStep(3);
                    }}
                    className="border border-[var(--callendra-border)] rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-left hover:border-[var(--callendra-accent)] transition min-h-0 min-w-0 h-full"
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-[var(--callendra-text-secondary)] mt-1">
                      ${s.price} · {s.duration} min
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <button
                onClick={() => setStep(2)}
                className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90 transition"
              >
                ← Back
              </button>
              <h2 className="font-semibold mb-3">Choose date & time</h2>
              <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mb-3">
                All times are US Central ({BUSINESS_TIMEZONE})
              </p>
              <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2 mb-4">
                {getNextBusinessDays(30).map((dt) => {
                  const dateStr = dt.toFormat("yyyy-LL-dd");
                  const dow = dt.weekday === 7 ? 0 : dt.weekday;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`w-full min-w-0 rounded-xl py-3 text-center transition border ${
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
                    <div className={slotGridClass}>
                      {displaySlots.map((slot) => (
                        <button
                          key={slot}
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

          {step === 4 && (
            <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setStep(3)}
                className="text-[var(--callendra-text-secondary)] text-sm mb-3 hover:opacity-90 transition"
              >
                ← Back
              </button>
              <h2 className="font-semibold mb-3">Your information</h2>
              <div className="border border-[var(--callendra-border)] rounded-2xl p-4 mb-4 text-sm text-[var(--callendra-text-secondary)] flex items-start gap-4">
                {selectedStaff && (
                  <StaffAvatar name={selectedStaff.name} photo={selectedStaff.photo} size="book" />
                )}
                <div className="min-w-0">
                  <div>
                    {selectedStaff?.name} · {selectedService?.name}
                  </div>
                  <div>
                    {selectedDate} {selectedTime}
                  </div>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Your name *"
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition min-w-0"
                />
                <input
                  type="tel"
                  placeholder={isWalkIn ? "Phone (optional)" : "Phone number *"}
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition min-w-0"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={form.clientEmail}
                  onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                  className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition min-w-0 sm:col-span-2"
                />
                {error && <p className="text-red-400 text-sm sm:col-span-2">{error}</p>}
                <button
                  onClick={handleBook}
                  disabled={loading}
                  className="ui-btn-primary py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50 mt-1 sm:col-span-2"
                >
                  {loading ? "Booking..." : "Confirm Booking"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {nextModalOpen && !isWalkIn && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Find next available</h3>
              <button
                type="button"
                onClick={() => setNextModalOpen(false)}
                className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90"
              >
                Close
              </button>
            </div>

            {!nextResult ? (
              <>
                <p className="text-xs text-[var(--callendra-text-secondary)] mb-3">
                  Choose a service and we will find the first open slot in the next 7 days.
                </p>
                <div className="flex flex-col gap-2">
                  {(business?.services ?? []).map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!!nextSearchingServiceId}
                      onClick={() => void handleNextAvailableSearch(s)}
                      className="border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-left hover:border-[var(--callendra-accent)] transition disabled:opacity-60"
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--callendra-text-secondary)] mt-1">
                        ${s.price} · {s.duration} min
                      </div>
                      {nextSearchingServiceId === s.id ? (
                        <div className="text-xs text-[var(--callendra-accent)] mt-1 animate-pulse">
                          Searching...
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {nextError ? <p className="text-sm text-red-400 mt-3">{nextError}</p> : null}
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--callendra-text-secondary)] mb-4">
                  Next available:{" "}
                  <span className="text-[var(--callendra-text-primary)] font-medium">{nextResult.staffName}</span> on{" "}
                  <span className="text-[var(--callendra-text-primary)] font-medium">{nextResult.date}</span> at{" "}
                  <span className="text-[var(--callendra-accent)] font-semibold">{nextResult.time}</span> - Book this?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmNextAvailableResult}
                    className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold"
                  >
                    Book this
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextResult(null)}
                    className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm"
                  >
                    Try another service
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
