"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CallendraThemeStyle } from "@/components/callendra-theme-style";
import { StaffAvatar } from "@/components/staff-avatar";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/callendra-themes";

type Apt = {
  id: string;
  date: string;
  clientName: string;
  service?: { name?: string | null; duration?: number | null } | null;
};

type NextSuggestion = {
  appointmentId: string;
  clientName: string;
  businessName: string;
  currentStartIso: string;
  suggestedStartIso: string;
};

function StaffDayInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const token = searchParams.get("token")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPhoto, setStaffPhoto] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [themePreset, setThemePreset] = useState<string>(DEFAULT_THEME_ID);
  const [appointments, setAppointments] = useState<Apt[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [actionError, setActionError] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<NextSuggestion | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setError("Missing token in URL.");
      setLoading(false);
      return;
    }
    setError("");
    const res = await fetch(`/api/staff-day?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Could not load");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setStaffName(data.staff?.name ?? "");
    const p = data.staff?.photo;
    setStaffPhoto(typeof p === "string" && p.trim() ? p.trim() : null);
    setBrandName(typeof data.brandName === "string" ? data.brandName : "");
    setLocationName(typeof data.locationName === "string" ? data.locationName : "");
    const tp = typeof data.themePreset === "string" ? data.themePreset : DEFAULT_THEME_ID;
    setThemePreset(isValidThemeId(tp) ? tp : DEFAULT_THEME_ID);
    setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const inProgressId = useMemo(() => {
    for (const apt of appointments) {
      const start = new Date(apt.date);
      const dur = apt.service?.duration ?? 30;
      const end = new Date(start.getTime() + dur * 60_000);
      if (start <= now && end > now) return apt.id;
    }
    return null;
  }, [appointments, now]);

  const complete = async (appointmentId: string, advanceNext: boolean) => {
    if (!token) return;
    setActionError("");
    setCompletingId(appointmentId);
    setPendingSuggestion(null);
    try {
      const res = await fetch("/api/staff-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, appointmentId, action: "complete", advanceNext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (!advanceNext && data.nextSuggestion) {
        setPendingSuggestion(data.nextSuggestion as NextSuggestion);
      }
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Error");
    } finally {
      setCompletingId(null);
      setAdvancing(false);
    }
  };

  const themeStyle = (
    <CallendraThemeStyle preset={isValidThemeId(themePreset) ? themePreset : DEFAULT_THEME_ID} variant="override" />
  );

  if (!token) {
    return (
      <>
        {themeStyle}
        <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
          <p className="text-sm text-[var(--callendra-text-secondary)] text-center">This page needs a valid link with a token.</p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        {themeStyle}
        <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
          <p className="animate-pulse text-sm">Loading your day…</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {themeStyle}
        <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-4 bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
          <p className="text-red-400 text-sm text-center">{error}</p>
        </div>
      </>
    );
  }

  const nextIdx = appointments.findIndex((apt) => new Date(apt.date).getTime() >= now.getTime());

  return (
    <>
      {themeStyle}
      <main className="min-h-[100dvh] bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] px-4 py-6 max-w-lg mx-auto">
      <header className="mb-6 border-b border-[var(--callendra-border)]/60 pb-5">
        <div className="min-w-0">
          <p className="text-xs text-[var(--callendra-text-secondary)] uppercase tracking-wide">{brandName}</p>
          {locationName ? (
            <p className="text-sm font-semibold text-[var(--callendra-text-primary)] mt-1 truncate">{locationName}</p>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-2.5 min-w-0">
          <StaffAvatar name={staffName} photo={staffPhoto} size="display" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight truncate">{staffName}</h1>
            <p className="text-sm text-[var(--callendra-text-secondary)] mt-0.5">Today&apos;s appointments</p>
          </div>
        </div>
      </header>

      {actionError ? <p className="text-red-400 text-sm mb-4">{actionError}</p> : null}

      {appointments.length === 0 ? (
        <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center text-[var(--callendra-text-secondary)] text-sm">
          No upcoming appointments for you today.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {appointments.map((apt, i) => {
            const start = new Date(apt.date);
            const dur = apt.service?.duration ?? 30;
            const end = new Date(start.getTime() + dur * 60_000);
            const inProgress = apt.id === inProgressId;
            const isNext = !inProgress && nextIdx === i;
            return (
              <li key={apt.id}>
                <div
                  className={`rounded-lg px-2.5 py-2 border transition min-w-0 ${
                    inProgress
                      ? "bg-green-500/20 border-green-500/50"
                      : isNext
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border-[var(--callendra-border)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-semibold leading-snug break-words line-clamp-2 ${
                          isNext ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                        }`}
                      >
                        {apt.clientName}
                      </div>
                      <div className="text-xs text-[var(--callendra-text-secondary)] break-words line-clamp-2 mt-0.5">
                        {apt.service?.name ?? "Service"}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
                      <div
                        className={`font-mono font-bold text-base tabular-nums leading-none ${
                          isNext || inProgress ? "text-[var(--callendra-accent)]" : "text-[var(--callendra-text-primary)]"
                        }`}
                      >
                        {formatTime(apt.date)}
                      </div>
                      {isNext && (
                        <span className="text-[10px] uppercase tracking-wide text-[var(--callendra-success)] font-semibold">
                          Next
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {inProgress && (
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={completingId === apt.id}
                      onClick={() => void complete(apt.id, false)}
                      className="w-full ui-btn-primary py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                      {completingId === apt.id ? "Saving…" : "Finish appointment"}
                    </button>
                    <button
                      type="button"
                      disabled={completingId === apt.id}
                      onClick={() => {
                        setAdvancing(true);
                        void complete(apt.id, true);
                      }}
                      className="w-full border border-[var(--callendra-border)] py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                    >
                      {completingId === apt.id && advancing ? "Saving…" : "Finish & pull next earlier if possible"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingSuggestion && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_70%,var(--callendra-bg))] flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-2xl p-5 w-full max-w-md shadow-xl">
            <h2 className="font-semibold text-lg mb-2">Next client</h2>
            <p className="text-sm text-[var(--callendra-text-secondary)] mb-4">
              <span className="font-medium text-[var(--callendra-text-primary)]">{pendingSuggestion.clientName}</span> at{" "}
              {pendingSuggestion.businessName} is scheduled for{" "}
              <span className="font-mono">{formatTime(pendingSuggestion.currentStartIso)}</span>. Move to{" "}
              <span className="font-mono text-[var(--callendra-accent)]">{formatTime(pendingSuggestion.suggestedStartIso)}</span>?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold"
                onClick={async () => {
                  if (!token) return;
                  setAdvancing(true);
                  setActionError("");
                  try {
                    const res = await fetch("/api/staff-day", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        token,
                        appointmentId: pendingSuggestion.appointmentId,
                        action: "moveNext",
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Could not move");
                    setPendingSuggestion(null);
                    await load();
                  } catch (e: unknown) {
                    setActionError(e instanceof Error ? e.message : "Error");
                  } finally {
                    setAdvancing(false);
                  }
                }}
              >
                {advancing ? "…" : "Yes, move"}
              </button>
              <button
                type="button"
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm"
                onClick={() => setPendingSuggestion(null)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--callendra-text-secondary)] opacity-70 mt-8 text-center">
        {locale.toUpperCase()} · Refreshes when you return to this tab
      </p>
    </main>
    </>
  );
}

export default function StaffDayPage() {
  return (
    <Suspense
      fallback={
        <>
          <CallendraThemeStyle preset={DEFAULT_THEME_ID} variant="override" />
          <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
            <span className="text-sm animate-pulse">Loading…</span>
          </div>
        </>
      }
    >
      <StaffDayInner />
    </Suspense>
  );
}
