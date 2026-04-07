"use client";
import type { CSSProperties } from "react";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { StaffAvatar } from "@/components/staff-avatar";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Split staff into two rows (ceil/floor) so many columns don’t stack as 4+ tiny rows. */
function splitIntoTwoRows<T>(items: T[]): [T[], T[]] {
  if (items.length === 0) return [[], []];
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function gridColsStyle(columnCount: number): CSSProperties {
  const n = Math.max(1, columnCount);
  return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
}

function StaffColumn({
  s,
  now,
  formatTime,
}: {
  s: any;
  now: Date;
  formatTime: (date: string) => string;
}) {
  return (
    <section className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))]">
      <div className="shrink-0 flex items-center gap-2.5 px-2 py-2.5 sm:px-3 sm:py-3 min-w-0 border-b border-[var(--callendra-border)]/60">
        <StaffAvatar name={s.name} photo={s.photo} size="display" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm sm:text-base md:text-lg truncate">{s.name}</div>
          <div className="text-[10px] sm:text-xs md:text-sm text-[var(--callendra-text-secondary)]">
            {s.appointments.length} appt{s.appointments.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1.5 py-1.5 sm:px-2 sm:py-2 [scrollbar-width:thin] [scrollbar-color:var(--callendra-border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--callendra-text-primary)_35%,transparent)]"
      >
        {s.appointments.length === 0 ? (
          <div className="flex h-full min-h-[4rem] flex-col items-center justify-center gap-1 py-4 text-[var(--callendra-text-secondary)]">
            <div className="text-2xl opacity-80" aria-hidden>
              📅
            </div>
            <div className="text-xs sm:text-sm">No appointments</div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 sm:gap-2">
            {s.appointments.map((apt: any) => {
              const aptTime = new Date(apt.date);
              const duration = apt.service?.duration || 30;
              const aptEnd = new Date(aptTime.getTime() + duration * 60 * 1000);
              const isInProgress = aptTime <= now && aptEnd > now;
              const isNext =
                !isInProgress &&
                s.appointments.findIndex((a: any) => new Date(a.date) >= now) === s.appointments.indexOf(apt);
              return (
                <li key={apt.id}>
                  <div
                    className={`rounded-lg px-2 py-2 sm:px-2.5 sm:py-2 border transition min-w-0 ${
                      isInProgress
                        ? "bg-green-500/20 border-green-500/50"
                        : isNext
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border-[var(--callendra-border)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-xs sm:text-sm md:text-base font-semibold leading-snug break-words line-clamp-2 ${
                            isNext ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                          }`}
                        >
                          {apt.clientName}
                        </div>
                        <div className="text-[10px] sm:text-xs text-[var(--callendra-text-secondary)] break-words line-clamp-2 mt-0.5">
                          {apt.service?.name}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
                        <div
                          className={`font-mono font-bold text-sm sm:text-base md:text-lg tabular-nums leading-none ${
                            isNext || isInProgress ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                          }`}
                        >
                          {formatTime(apt.date)}
                        </div>
                        {isNext && (
                          <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-[var(--callendra-success)] font-semibold">
                            Next
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

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
      <div className="h-full min-h-0 overflow-hidden overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
        <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl animate-pulse text-center">
          Loading display...
        </div>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="h-full min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[var(--callendra-bg)] flex flex-col items-center justify-center px-4 sm:px-6 text-center">
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
      <div className="h-full min-h-0 overflow-hidden overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
        <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl text-center">Display not available</div>
      </div>
    );
  }

  const [staffRow1, staffRow2] = splitIntoTwoRows(byStaff);
  /** Same column count on both rows so every card has equal width; last cells stay empty when rows differ (e.g. 7 + 6). */
  const columnCount = Math.max(staffRow1.length, staffRow2.length, 1);

  return (
    <main
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] min-w-0 max-w-[100vw] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] px-2 sm:px-3 md:px-4"
    >
      <header className="shrink-0 flex flex-col gap-2 sm:gap-3 sm:flex-row sm:justify-between sm:items-center border-b border-[var(--callendra-border)] pb-0 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 min-h-0">
          {business.logo && (
            <img
              src={business.logo}
              alt=""
              className="w-[4.5rem] h-[4.5rem] sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 xl:w-36 xl:h-36 shrink-0 object-contain"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-[2rem] xl:text-[2.25rem] font-bold tracking-tight break-words hyphens-auto leading-tight">
              {business.parentSlug && business.locationSlug ? `${business.parentName || business.name}` : business.name}
              {business.parentSlug && business.locationSlug && business.name ? ` - ${business.name}` : ""}
            </h1>
            <p className="text-[var(--callendra-text-secondary)] mt-1 text-xs sm:text-sm md:text-base truncate">
              {DAYS[now.getDay()]}, {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right shrink-0 flex flex-row sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-x-3 gap-y-0">
          <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-mono font-bold text-[var(--callendra-accent)] tabular-nums leading-none">
            {formatClock(now)}
          </div>
          <div className="text-[var(--callendra-text-secondary)] text-[10px] sm:text-xs whitespace-nowrap">
            {appointments.length} today
          </div>
        </div>
      </header>

      {/* Two fixed rows; shared column count so card widths match — empty slots on the shorter row. */}
      <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden sm:gap-2.5">
        <div className="grid min-h-0 flex-1 gap-2 sm:gap-2.5" style={gridColsStyle(columnCount)}>
          {staffRow1.map((s: any) => (
            <StaffColumn key={s.id} s={s} now={now} formatTime={formatTime} />
          ))}
        </div>
        {staffRow2.length > 0 && (
          <div className="grid min-h-0 flex-1 gap-2 sm:gap-2.5" style={gridColsStyle(columnCount)}>
            {staffRow2.map((s: any) => (
              <StaffColumn key={s.id} s={s} now={now} formatTime={formatTime} />
            ))}
          </div>
        )}
      </div>
      <footer className="shrink-0 pt-1 pb-0.5 text-center text-[var(--callendra-text-secondary)] opacity-75 text-[9px] sm:text-[10px] px-1 leading-tight">
        Auto-refresh 30s · Callendra
      </footer>
    </main>
  );
}

export default function DisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full min-h-0 overflow-hidden overflow-x-hidden bg-[var(--callendra-bg)] flex items-center justify-center px-4">
          <div className="text-[var(--callendra-text-primary)] text-lg sm:text-xl animate-pulse">Loading display...</div>
        </div>
      }
    >
      <DisplayPageInner />
    </Suspense>
  );
}
