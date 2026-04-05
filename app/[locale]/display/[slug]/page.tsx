"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { StaffAvatar } from "@/components/staff-avatar";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function initSocket(slug: string, onEvent: () => void) {
  const win = window as any;
  if (win._callendrSocket) {
    win._callendrSocket.disconnect();
    win._callendrSocket = null;
  }
  const connect = () => {
    const socket = win.io(win.location.origin, { transports: ["websocket", "polling"] });
    win._callendrSocket = socket;
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("join-display", slug);
      console.log("Joined room: display-" + slug);
    });
    socket.on("new-appointment", () => {
      console.log("New appointment received!");
      onEvent();
    });
  };
  if (win.io) {
    connect();
  } else {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.onload = connect;
    document.head.appendChild(script);
  }
}

export default function DisplayPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [business, setBusiness] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());

  const fetchAppointments = async () => {
    const res = await fetch(`/api/display?slug=${slug}`);
    const data = await res.json();
    if (data.business) setBusiness(data.business);
    if (Array.isArray(data.appointments)) setAppointments(data.appointments);
  };

  useEffect(() => {
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    initSocket(slug, fetchAppointments);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [slug]);

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const formatClock = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const staff = business?.staff || [];
  const byStaff = staff.map((s: any) => ({
    ...s,
    appointments: appointments
      .filter((a: any) => {
        if (a.staffId !== s.id) return false;
        const start = new Date(a.date);
        const duration = a.service?.duration || 30;
        const end = new Date(start.getTime() + duration * 60 * 1000);
        return end > now;
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }));

  if (!business) return (
    <div className="min-h-screen bg-[var(--callendra-bg)] flex items-center justify-center">
      <div className="text-[var(--callendra-text-primary)] text-xl animate-pulse">Loading display...</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] p-6">
      <div className="flex justify-between items-center mb-8 border-b border-[var(--callendra-border)] pb-6">
        <div className="flex items-center gap-4">
          {business.logo && (
            <img src={business.logo} alt="Logo" className="w-32 h-32 rounded-full object-contain border-2 border-[var(--callendra-border)]" />
          )}
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              {business.parentSlug && business.locationSlug ? `${business.parentName || business.name}` : business.name}
              {business.parentSlug && business.locationSlug && business.name ? ` - ${business.name}` : ""}
            </h1>
            <p className="text-[var(--callendra-text-secondary)] mt-1">{DAYS[now.getDay()]}, {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-mono font-bold text-[var(--callendra-accent)]">{formatClock(now)}</div>
          <div className="text-[var(--callendra-text-secondary)] text-sm mt-1">{appointments.length} appointments today</div>
        </div>
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(staff.length, 4)}, 1fr)` }}>
        {byStaff.map((s: any) => (
          <div key={s.id} className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] rounded-2xl overflow-hidden border border-[var(--callendra-border)]">
            <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-5 py-4 flex items-center gap-4">
              <StaffAvatar name={s.name} photo={s.photo} size="display" />
              <div>
                <div className="font-bold text-lg">{s.name}</div>
                <div className="text-xs text-[var(--callendra-text-secondary)]">{s.appointments.length} appointments</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {s.appointments.length === 0 ? (
                <div className="text-center py-8 text-[var(--callendra-text-secondary)]">
                  <div className="text-3xl mb-2">📅</div>
                  <div className="text-sm">No appointments</div>
                </div>
              ) : (
                s.appointments.map((apt: any) => {
                  const aptTime = new Date(apt.date);
                  const duration = apt.service?.duration || 30;
                  const aptEnd = new Date(aptTime.getTime() + duration * 60 * 1000);
                  const isInProgress = aptTime <= now && aptEnd > now;
                  const isNext = !isInProgress && s.appointments.findIndex((a: any) => new Date(a.date) >= now) === s.appointments.indexOf(apt);
                  return (
                    <div key={apt.id} className={`rounded-xl px-4 py-3 border transition ${
                      isInProgress ? "bg-green-500/20 border-green-500/50" :
                      isNext ? "bg-green-500/10 border-green-500/30" :
                      "bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border-[var(--callendra-border)]"
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className={`font-semibold ${isNext ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"}`}>{apt.clientName}</div>
                          <div className="text-xs text-[var(--callendra-text-secondary)] mt-0.5">{apt.service?.name}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold text-lg ${isNext || isInProgress ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"}`}>
                            {formatTime(apt.date)}
                          </div>
                          {isNext && <div className="text-xs text-[var(--callendra-success)] font-medium">NEXT</div>}
                          
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center text-[var(--callendra-text-secondary)] opacity-80 text-xs">
        Auto-refreshes every 30 seconds · Powered by Callendra
      </div>
    </main>
  );
}
