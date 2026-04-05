"use client";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { StaffAvatar } from "@/components/staff-avatar";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
      socket.emit("join-display", slug);
    });
    socket.on("new-appointment", () => {
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

function DisplayPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const token = searchParams.get("token") ?? "";

  const [business, setBusiness] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [access, setAccess] = useState<"loading" | "ok" | "denied">("loading");

  const fetchAppointments = useCallback(async () => {
    const qs = new URLSearchParams({ slug });
    if (token) qs.set("token", token);
    const res = await fetch(`/api/display?${qs.toString()}`);
    if (res.status === 403) {
      setAccess("denied");
      setBusiness(null);
      return;
    }
    if (!res.ok) {
      setAccess("denied");
      setBusiness(null);
      return;
    }
    const data = await res.json();
    if (data.business) setBusiness(data.business);
    if (Array.isArray(data.appointments)) setAppointments(data.appointments);
    setAccess("ok");
  }, [slug, token]);

  useEffect(() => {
    setAccess("loading");
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    if (access !== "ok" || !slug) return;
    const interval = setInterval(fetchAppointments, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    initSocket(slug, fetchAppointments);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [access, slug, fetchAppointments]);

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

  if (access === "loading") {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
        <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl animate-pulse text-center">
          Loading display...
        </div>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[var(--callendra-bg)] flex flex-col items-center justify-center px-4 sm:px-6 text-center">
        <div className="text-4xl sm:text-5xl mb-4" aria-hidden>
          🔒
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-[var(--callendra-text-primary)] mb-2 max-w-md">
          Access restricted
        </h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm max-w-md">
          This display requires a valid link from your Callendra dashboard. Ask your business owner for the display URL with token.
        </p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
        <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl text-center">Display not available</div>
      </div>
    );
  }

  const staffColCount = Math.min(Math.max(staff.length, 1), 4);
  const lgStaffGridClass =
    staffColCount === 1
      ? "lg:grid-cols-1"
      : staffColCount === 2
        ? "lg:grid-cols-2"
        : staffColCount === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-4";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] p-3 sm:p-4 md:p-5 lg:p-6 min-w-0 max-w-[100vw]">
      <header className="flex flex-col gap-4 sm:gap-5 md:gap-6 lg:flex-row lg:justify-between lg:items-start mb-6 sm:mb-8 border-b border-[var(--callendra-border)] pb-4 sm:pb-5 md:pb-6 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
          {business.logo && (
            <img
              src={business.logo}
              alt=""
              className="w-14 h-14 sm:w-24 sm:h-24 lg:w-32 lg:h-32 shrink-0 rounded-full object-contain border-2 border-[var(--callendra-border)]"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight break-words hyphens-auto">
              {business.parentSlug && business.locationSlug ? `${business.parentName || business.name}` : business.name}
              {business.parentSlug && business.locationSlug && business.name ? ` - ${business.name}` : ""}
            </h1>
            <p className="text-[var(--callendra-text-secondary)] mt-1 text-xs sm:text-sm lg:text-base">
              {DAYS[now.getDay()]}, {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="text-center sm:text-right shrink-0 w-full sm:w-auto lg:pt-0">
          <div className="text-3xl sm:text-4xl lg:text-5xl font-mono font-bold text-[var(--callendra-accent)] tabular-nums">
            {formatClock(now)}
          </div>
          <div className="text-[var(--callendra-text-secondary)] text-xs sm:text-sm mt-1">
            {appointments.length} appointments today
          </div>
        </div>
      </header>

      <div
        className={`grid min-w-0 grid-cols-1 gap-4 sm:gap-5 md:gap-5 lg:gap-6 ${staff.length > 1 ? "sm:grid-cols-2" : ""} ${lgStaffGridClass}`}
      >
        {byStaff.map((s: any) => (
          <section
            key={s.id}
            className="min-w-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] rounded-2xl overflow-hidden border border-[var(--callendra-border)]"
          >
            <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] px-3 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 min-w-0">
              <StaffAvatar
                name={s.name}
                photo={s.photo}
                size="display"
                className="!w-14 !h-14 !min-w-[3.5rem] !min-h-[3.5rem] !text-lg sm:!w-20 sm:!h-20 sm:!min-w-[5rem] sm:!min-h-[5rem] sm:!text-2xl lg:!w-32 lg:!h-32 lg:!min-w-[8rem] lg:!min-h-[8rem] lg:!text-3xl"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-base sm:text-lg truncate sm:whitespace-normal sm:break-words">{s.name}</div>
                <div className="text-xs text-[var(--callendra-text-secondary)]">{s.appointments.length} appointments</div>
              </div>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 min-w-0">
              {s.appointments.length === 0 ? (
                <div className="text-center py-8 text-[var(--callendra-text-secondary)] sm:col-span-2 lg:col-span-1">
                  <div className="text-3xl mb-2">📅</div>
                  <div className="text-sm">No appointments</div>
                </div>
              ) : (
                s.appointments.map((apt: any) => {
                  const aptTime = new Date(apt.date);
                  const duration = apt.service?.duration || 30;
                  const aptEnd = new Date(aptTime.getTime() + duration * 60 * 1000);
                  const isInProgress = aptTime <= now && aptEnd > now;
                  const isNext =
                    !isInProgress &&
                    s.appointments.findIndex((a: any) => new Date(a.date) >= now) === s.appointments.indexOf(apt);
                  return (
                    <div
                      key={apt.id}
                      className={`rounded-xl px-3 py-3 sm:px-4 sm:py-3 lg:px-5 lg:py-4 border transition min-w-0 ${
                        isInProgress
                          ? "bg-green-500/20 border-green-500/50"
                          : isNext
                            ? "bg-green-500/10 border-green-500/30"
                            : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border-[var(--callendra-border)]"
                      }`}
                    >
                      <div className="flex flex-col gap-2 min-w-0 lg:flex-row lg:justify-between lg:items-start lg:gap-4">
                        <div className="flex flex-col gap-1 min-w-0 lg:flex-1 lg:min-w-0">
                          <div
                            className={`text-xl sm:text-lg lg:text-2xl xl:text-3xl font-semibold break-words leading-snug ${
                              isNext ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                            }`}
                          >
                            {apt.clientName}
                          </div>
                          <div className="text-base sm:text-sm lg:text-lg xl:text-xl text-[var(--callendra-text-secondary)] break-words">
                            {apt.service?.name}
                          </div>
                          <div className="text-sm text-[var(--callendra-text-secondary)] pt-0.5 lg:hidden truncate">
                            {s.name}
                          </div>
                        </div>
                        <div className="flex flex-row items-center justify-between gap-3 sm:justify-start lg:flex-col lg:items-end lg:justify-start lg:shrink-0 lg:gap-1 lg:pt-0.5">
                          <div
                            className={`font-mono font-bold text-2xl sm:text-xl lg:text-2xl xl:text-3xl tabular-nums ${
                              isNext || isInProgress ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                            }`}
                          >
                            {formatTime(apt.date)}
                          </div>
                          {isNext && (
                            <div className="text-xs sm:text-sm text-[var(--callendra-success)] font-medium lg:text-right">NEXT</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>
      <footer className="mt-6 sm:mt-8 text-center text-[var(--callendra-text-secondary)] opacity-80 text-[10px] sm:text-xs px-1 break-words">
        Auto-refreshes every 30 seconds · Powered by Callendra
      </footer>
    </main>
  );
}

export default function DisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
          <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl animate-pulse">Loading display...</div>
        </div>
      }
    >
      <DisplayPageInner />
    </Suspense>
  );
}
