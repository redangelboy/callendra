"use client";
import { useState, useEffect, useMemo } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useParams } from "next/navigation";
import { DateTime } from "luxon";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextBusinessDays(count: number): DateTime[] {
  const start = DateTime.now().setZone(BUSINESS_TIMEZONE).startOf("day");
  return Array.from({ length: count }, (_, i) => start.plus({ days: i }));
}

export default function BookPage() {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const params = useParams();
  const segments = useMemo(() => {
    const raw = params.slug as string | string[] | undefined;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }, [params.slug]);

  const parentSlug = segments[0] ?? "";
  const locationSlug = segments[1];

  const bookQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (parentSlug) qs.set("parentSlug", parentSlug);
    if (locationSlug) qs.set("locationSlug", locationSlug);
    return qs.toString();
  }, [parentSlug, locationSlug]);

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
  const [nowTick, setNowTick] = useState(Date.now());

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
    if (!parentSlug || !selectedStaff || !selectedService || !selectedDate) return;
    const qs = new URLSearchParams(bookQuery);
    qs.set("staffId", selectedStaff.id);
    qs.set("serviceId", selectedService.id);
    qs.set("date", selectedDate);
    fetch(`/api/book/availability?${qs}`)
      .then(r => r.json())
      .then(data => setSlots(data.slots || []));
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
    if (!form.clientName || !form.clientPhone) { setError("Name and phone are required"); return; }
    setLoading(true);
    setError("");
    try {
      let recaptchaToken = "";
      if (executeRecaptcha) {
        try { recaptchaToken = await executeRecaptcha("book_appointment"); } catch {}
      }
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentSlug,
          ...(locationSlug ? { locationSlug } : {}),
          staffId: selectedStaff.id,
          serviceId: selectedService.id,
          date: selectedDate,
          time: selectedTime,
          ...form,
          recaptchaToken,
        }),
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

  if (!parentSlug) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white">Invalid booking link</div>
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center text-red-400 max-w-md">{loadError}</div>
    </div>
  );

  if (!business) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white animate-pulse">Loading...</div>
    </div>
  );

  if (confirmed) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-white mb-2">Booking Confirmed!</h1>
        <p className="text-gray-400">Your appointment at {business.name} is confirmed.</p>
        <div className="mt-6 border border-white/10 rounded-2xl p-6 text-left max-w-sm mx-auto">
          <div className="text-sm text-gray-400 space-y-2">
            <div><span className="text-white font-medium">Service:</span> {selectedService?.name}</div>
            <div><span className="text-white font-medium">With:</span> {selectedStaff?.name}</div>
            <div><span className="text-white font-medium">Date:</span> {selectedDate}</div>
            <div><span className="text-white font-medium">Time:</span> {selectedTime}</div>
          </div>
        </div>
        <button onClick={() => { setConfirmed(false); setStep(1); setSelectedStaff(null); setSelectedService(null); setSelectedDate(""); setSelectedTime(""); }}
          className="mt-6 text-sm text-gray-400 hover:text-white transition">
          Book another appointment
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Book an appointment</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1,2,3,4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${step >= s ? "bg-white text-black" : "bg-white/10 text-gray-500"}`}>{s}</div>
              {s < 4 && <div className={`w-8 h-px ${step > s ? "bg-white" : "bg-white/20"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Staff */}
        {step === 1 && (
          <div>
            <h2 className="font-semibold mb-4">Choose your barber</h2>
            <div className="flex flex-col gap-3">
              {business.staff.map((s: any) => (
                <button key={s.id} onClick={() => { setSelectedStaff(s); setStep(2); }}
                  className="border border-white/10 rounded-2xl px-6 py-4 text-left hover:border-white/40 transition flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Service */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="text-gray-400 text-sm mb-4 hover:text-white transition">← Back</button>
          <h2 className="font-semibold mb-4">Choose a service</h2>
            <div className="flex flex-col gap-3">
              {business.services.map((s: any) => (
                <button key={s.id} onClick={() => { setSelectedService(s); setStep(3); }}
                  className="border border-white/10 rounded-2xl px-6 py-4 text-left hover:border-white/40 transition">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-gray-400 mt-1">${s.price} · {s.duration} min</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Select Date & Time */}
        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} className="text-gray-400 text-sm mb-4 hover:text-white transition">← Back</button>
            <h2 className="font-semibold mb-4">Choose date & time</h2>
            <p className="text-xs text-gray-500 mb-3">All times are US Central ({BUSINESS_TIMEZONE})</p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
              {getNextBusinessDays(30).map((dt) => {
                const dateStr = dt.toFormat("yyyy-LL-dd");
                const dow = dt.weekday === 7 ? 0 : dt.weekday;
                return (
                  <button key={dateStr} onClick={() => setSelectedDate(dateStr)}
                    className={`flex-shrink-0 w-14 rounded-xl py-3 text-center transition border ${selectedDate === dateStr ? "bg-white text-black border-white" : "border-white/10 hover:border-white/30"}`}>
                    <div className="text-xs">{DAYS[dow]}</div>
                    <div className="font-bold text-lg">{dt.day}</div>
                  </button>
                );
              })}
            </div>
            {selectedDate && (
              <>
                {displaySlots.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No available slots for this day</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {displaySlots.map((slot) => (
                      <button key={slot} onClick={() => { setSelectedTime(slot); setStep(4); }}
                        className={`border rounded-xl py-3 text-sm font-medium transition ${selectedTime === slot ? "bg-white text-black border-white" : "border-white/10 hover:border-white/30"}`}>
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4: Client Info */}
        {step === 4 && (
          <div>
            <button onClick={() => setStep(3)} className="text-gray-400 text-sm mb-4 hover:text-white transition">← Back</button>
            <h2 className="font-semibold mb-4">Your information</h2>
            <div className="border border-white/10 rounded-2xl p-4 mb-6 text-sm text-gray-400">
              <div>{selectedStaff?.name} · {selectedService?.name}</div>
              <div>{selectedDate} {selectedTime}</div>
            </div>
            <div className="flex flex-col gap-3">
              <input type="text" placeholder="Your name *" value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              <input type="tel" placeholder="Phone number *" value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              <input type="email" placeholder="Email (optional)" value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button onClick={handleBook} disabled={loading}
                className="bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition disabled:opacity-50 mt-2">
                {loading ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
