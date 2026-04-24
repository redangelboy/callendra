"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DateTime } from "luxon";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import {
  breakOverlayPercents,
  breakSpansForWorkBlock,
  entryInWorkBlockWindow,
  type TimeclockReportEntry,
} from "@/lib/timeclock-report-timeline";

type LocRow = { id: string; name: string; displayToken?: string | null };

type Pair = {
  checkIn: string;
  checkOut: string | null;
  hours: number | null;
  checkInSelfie?: string | null;
  checkOutSelfie?: string | null;
};
type GroupedEntry = {
  staffId: string;
  staffName: string;
  pairs: Pair[];
  totalHours: number;
  entries?: TimeclockReportEntry[];
};

function ymdToday() {
  return DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
}

function formatHoursLabel(decimalHours: number): string {
  const totalMin = Math.max(0, Math.round(decimalHours * 60));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}h ${mm}min`;
}

function SelfieThumb({ url, onOpen }: { url: string | null | undefined; onOpen: (u: string) => void }) {
  if (!url) return <span className="text-[var(--callendra-text-secondary)]">—</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="shrink-0 rounded-md overflow-hidden border border-[var(--callendra-border)] focus:outline-none focus:ring-2 focus:ring-[var(--callendra-accent)]"
      title="View photo"
    >
      <img src={url} alt="" className="w-10 h-10 object-cover block" />
    </button>
  );
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatBreakMs(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return hh > 0 ? `${hh}h ${mm}min` : `${mm}min`;
}

function incompleteBlockMarkers(
  pair: Pair,
  nextPair: Pair | undefined,
  orderedEntries: TimeclockReportEntry[]
): { label: string; at: string }[] {
  const out: { label: string; at: string }[] = [{ label: "In", at: pair.checkIn }];
  for (const e of orderedEntries) {
    const kind = (e.type ?? "").toLowerCase();
    if (kind !== "break_start" && kind !== "break_end") continue;
    const ms = new Date(e.timestamp).getTime();
    if (!entryInWorkBlockWindow(pair, nextPair, ms)) continue;
    out.push({
      label: kind === "break_start" ? "Break" : "Resume",
      at: e.timestamp,
    });
  }
  return out;
}

function WorkBlockTimeline({
  pair,
  pairIndex,
  pairs,
  entries,
}: {
  pair: Pair;
  pairIndex: number;
  pairs: Pair[];
  entries: TimeclockReportEntry[];
}) {
  const nextPair = pairs[pairIndex + 1];
  const spans = breakSpansForWorkBlock(pair, nextPair, entries);
  const closedBreakMs = spans.reduce((acc, s) => acc + (s.endMs != null ? Math.max(0, s.endMs - s.startMs) : 0), 0);
  const hasOpenBreak = spans.some((s) => s.endMs == null);
  const complete = Boolean(pair.checkOut);

  if (complete && pair.checkOut) {
    const t0 = new Date(pair.checkIn).getTime();
    const t1 = new Date(pair.checkOut).getTime();
    const overlays = breakOverlayPercents(t0, t1, spans);
    const aria = `Work from ${formatClock(pair.checkIn)} to ${formatClock(pair.checkOut)}${
      overlays.length ? `, ${overlays.length} break segment(s)` : ""
    }`;
    return (
      <div className="min-w-[140px] max-w-[220px]">
        <div
          className="relative h-2.5 w-full rounded-full bg-[color-mix(in_srgb,var(--callendra-text-primary)_14%,var(--callendra-bg))] border border-[var(--callendra-border)]/80 overflow-hidden"
          role="img"
          aria-label={aria}
        >
          {overlays.map((o, i) => (
            <div
              key={i}
              title="Break"
              className="absolute top-0 bottom-0 rounded-sm bg-blue-500/85 border border-blue-600/40"
              style={{ left: `${o.left}%`, width: `${o.width}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between gap-1 text-[9px] tabular-nums text-[var(--callendra-text-secondary)] leading-none">
          <span>{formatClock(pair.checkIn)}</span>
          <span>{formatClock(pair.checkOut)}</span>
        </div>
        <p className="mt-1 text-[9px] text-blue-400/95 leading-none">
          Break total: {formatBreakMs(closedBreakMs)}
        </p>
      </div>
    );
  }

  const markers = incompleteBlockMarkers(pair, nextPair, entries);
  if (markers.length === 1) {
    return (
      <div className="min-w-[120px] max-w-[200px] text-[10px] text-[var(--callendra-text-secondary)] leading-snug">
        <span className="tabular-nums text-[var(--callendra-text-primary)]">{formatClock(pair.checkIn)}</span>
        <span className="block mt-0.5 text-[var(--callendra-text-secondary)]">Shift open — bar fills after check out</span>
      </div>
    );
  }

  return (
    <ul className="min-w-[120px] max-w-[200px] flex flex-col gap-1 text-[9px] leading-tight">
      {markers.map((m, i) => (
        <li
          key={`${m.label}-${m.at}-${i}`}
          className={`flex items-baseline justify-between gap-2 tabular-nums ${
            m.label === "Break" ? "text-blue-500 font-medium" : "text-[var(--callendra-text-secondary)]"
          }`}
        >
          <span className="shrink-0 uppercase tracking-wide text-[8px] opacity-90">{m.label}</span>
          <span className={m.label === "In" ? "text-[var(--callendra-text-primary)] font-medium" : ""}>
            {formatClock(m.at)}
          </span>
        </li>
      ))}
      {pair.checkOut ? null : (
        <li className="text-[8px] text-[var(--callendra-text-secondary)] pt-0.5 border-t border-[var(--callendra-border)]/50 mt-0.5">
          Full timeline appears when this block is checked out.
        </li>
      )}
      {(closedBreakMs > 0 || hasOpenBreak) && (
        <li className="text-[8px] text-blue-400/95 pt-0.5">
          Break so far: {formatBreakMs(closedBreakMs)}
          {hasOpenBreak ? " (open)" : ""}
        </li>
      )}
    </ul>
  );
}

export default function DashboardTimeclockPage() {
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const [locations, setLocations] = useState<LocRow[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [reportDate, setReportDate] = useState(ymdToday());
  const [rows, setRows] = useState<GroupedEntry[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearModalError, setClearModalError] = useState("");

  const loadBase = async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionRes, locRes] = await Promise.all([fetch("/api/auth/session"), fetch("/api/business/locations")]);
      const sessionData = await sessionRes.json();
      const locData = await locRes.json();
      if (Array.isArray(locData)) {
        setLocations(
          locData.map((l: { id: string; name: string; displayToken?: string | null }) => ({
            id: l.id,
            name: l.name,
            displayToken: l.displayToken ?? null,
          }))
        );
      }
      const base = sessionData.businessId || (Array.isArray(locData) && locData[0]?.id) || "";
      setSelectedBusinessId((prev) => prev || base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (businessId: string, date: string) => {
    if (!businessId) return;
    try {
      const entriesRes = await fetch(
        `/api/time-entries?businessId=${encodeURIComponent(businessId)}&date=${encodeURIComponent(date)}`
      );
      const entriesData = await entriesRes.json();
      if (!entriesRes.ok) throw new Error(entriesData.error || "Could not load entries");
      setRows(Array.isArray(entriesData.grouped) ? entriesData.grouped : []);
      setTotalHours(Number(entriesData.totalStaffHours || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load time clock data");
    }
  };

  const openClearModal = () => {
    if (!selectedBusinessId || !reportDate) return;
    setClearModalError("");
    setClearPassword("");
    setClearModalOpen(true);
  };

  const closeClearModal = () => {
    setClearModalOpen(false);
    setClearPassword("");
    setClearModalError("");
  };

  const submitClearDay = async () => {
    if (!selectedBusinessId || !reportDate) return;
    if (!clearPassword.trim()) {
      setClearModalError("Enter the business owner password.");
      return;
    }
    setClearing(true);
    setClearModalError("");
    setError("");
    try {
      const res = await fetch(
        `/api/time-entries?businessId=${encodeURIComponent(selectedBusinessId)}&date=${encodeURIComponent(reportDate)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: clearPassword }),
        }
      );
      const d = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Could not delete entries");
      closeClearModal();
      await loadReport(selectedBusinessId, reportDate);
    } catch (e) {
      setClearModalError(e instanceof Error ? e.message : "Could not delete entries");
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (!selectedBusinessId) return;
    void loadReport(selectedBusinessId, reportDate);
  }, [selectedBusinessId, reportDate]);

  const selectedLoc = useMemo(
    () => locations.find((l) => l.id === selectedBusinessId),
    [locations, selectedBusinessId]
  );

  const kioskUrl = useMemo(() => {
    if (!selectedBusinessId) return "";
    const origin =
      (process.env.NEXT_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
    const base = `${origin}/${locale}/timeclock/${selectedBusinessId}`;
    const t = selectedLoc?.displayToken;
    return t ? `${base}?token=${encodeURIComponent(t)}` : base;
  }, [locale, selectedBusinessId, selectedLoc?.displayToken]);

  return (
    <main className="min-h-screen">
      {lightboxUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 border-0 cursor-default"
          onClick={() => setLightboxUrl(null)}
          aria-label="Close photo"
        >
          <img
            src={lightboxUrl}
            alt="Clock selfie"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      ) : null}

      {clearModalOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-day-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--callendra-border)] bg-[var(--callendra-bg)] p-5 shadow-xl">
            <h3 id="clear-day-title" className="text-lg font-semibold text-[var(--callendra-text-primary)]">
              Clear time entries?
            </h3>
            <p className="text-sm text-[var(--callendra-text-secondary)] mt-2 leading-relaxed">
              All punches for <span className="font-medium text-[var(--callendra-text-primary)]">{selectedLoc?.name}</span>{" "}
              on <span className="font-mono text-xs">{reportDate}</span> will be permanently removed.
            </p>
            <label className="mt-4 block text-xs text-[var(--callendra-text-secondary)]">
              Business owner password
              <input
                type="password"
                autoComplete="current-password"
                value={clearPassword}
                onChange={(e) => setClearPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitClearDay()}
                className="mt-1 w-full rounded-lg border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_5%,var(--callendra-bg))] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
              />
            </label>
            {clearModalError ? <p className="text-red-400 text-sm mt-2">{clearModalError}</p> : null}
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                disabled={clearing}
                onClick={closeClearModal}
                className="px-4 py-2 rounded-lg text-sm border border-[var(--callendra-border)] text-[var(--callendra-text-secondary)] hover:opacity-90 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => void submitClearDay()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600/90 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {clearing ? "Deleting…" : "Delete all punches"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a
          href={`/${locale}/dashboard`}
          className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm"
        >
          ← Dashboard
        </a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">Time Clock</span>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-8">
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}
        {loading ? <p className="text-[var(--callendra-text-secondary)] text-sm">Loading...</p> : null}

        <section className="border border-[var(--callendra-border)] rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Kiosk</h2>
          <p className="text-xs text-[var(--callendra-text-secondary)] mt-1">
            Open on a tablet or shared screen; staff scan the rotating code from their personal staff-day link.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 items-end">
            <label className="text-xs text-[var(--callendra-text-secondary)] flex flex-col gap-1">
              Location
              <select
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            {kioskUrl ? (
              <a
                href={kioskUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm border border-[var(--callendra-border)] px-4 py-2 rounded-full hover:opacity-90 transition"
              >
                Open kiosk page
              </a>
            ) : null}
          </div>
          {kioskUrl ? <p className="mt-2 text-xs text-[var(--callendra-text-secondary)] break-all">{kioskUrl}</p> : null}
          {!selectedLoc?.displayToken ? (
            <p className="mt-2 text-xs text-amber-400/90">
              Generate a display token in Business profile for this location so the kiosk link stays secure.
            </p>
          ) : null}
        </section>

        <section className="border border-[var(--callendra-border)] rounded-2xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Time entries report</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--callendra-text-secondary)] flex flex-col gap-1">
                Date
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-3 py-2 text-sm text-[var(--callendra-text-primary)]"
                />
              </label>
              <button
                type="button"
                disabled={clearing || !selectedBusinessId}
                onClick={openClearModal}
                className="text-xs border border-red-500/50 text-red-400/95 px-3 py-2 rounded-lg hover:bg-red-500/10 disabled:opacity-40 transition"
              >
                Clear this day
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[var(--callendra-text-secondary)] mt-2">
            Removes every punch for the selected location and date. You must enter the{" "}
            <strong className="text-[var(--callendra-text-primary)]">business owner</strong> account password to
            confirm (owner or admin session).
          </p>

          <div className="mt-4 border border-[var(--callendra-border)] rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-[var(--callendra-border)] text-left text-xs text-[var(--callendra-text-secondary)] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Check in</th>
                  <th className="px-4 py-2">Check out</th>
                  <th className="px-4 py-2 w-[200px]">Day timeline</th>
                  <th className="px-4 py-2">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--callendra-text-secondary)]">
                      No entries for this date.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const dayEntries = Array.isArray(r.entries) ? r.entries : [];
                    return (
                    <tr key={r.staffId} className="border-b border-[var(--callendra-border)] last:border-b-0 align-top">
                      <td className="px-4 py-3 font-medium">{r.staffName}</td>
                      <td className="px-4 py-3">
                        {r.pairs.length === 0 ? (
                          <span className="text-[var(--callendra-text-secondary)]">—</span>
                        ) : (
                          <ul className="flex flex-col gap-2.5">
                            {r.pairs.map((pair, idx) => (
                              <li
                                key={`${pair.checkIn}-${idx}`}
                                className="flex items-center gap-2 flex-wrap border-b border-[var(--callendra-border)]/60 pb-2.5 last:border-b-0 last:pb-0"
                              >
                                {r.pairs.length > 1 ? (
                                  <span className="text-[10px] uppercase tracking-wide text-[var(--callendra-text-secondary)] w-14 shrink-0">
                                    Block {idx + 1}
                                  </span>
                                ) : null}
                                <SelfieThumb url={pair.checkInSelfie} onOpen={setLightboxUrl} />
                                <span className="tabular-nums">{formatClock(pair.checkIn)}</span>
                                {pair.hours != null ? (
                                  <span className="text-[10px] text-[var(--callendra-text-secondary)]">
                                    ({formatHoursLabel(pair.hours)})
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.pairs.length === 0 ? (
                          <span className="text-[var(--callendra-text-secondary)]">—</span>
                        ) : (
                          <ul className="flex flex-col gap-2.5">
                            {r.pairs.map((pair, idx) => {
                              const outLabel = pair.checkOut
                                ? formatClock(pair.checkOut)
                                : pair.checkIn
                                  ? "Still in"
                                  : "—";
                              return (
                                <li
                                  key={`${pair.checkIn}-out-${idx}`}
                                  className="flex items-center gap-2 flex-wrap border-b border-[var(--callendra-border)]/60 pb-2.5 last:border-b-0 last:pb-0 min-h-[2.75rem]"
                                >
                                  {r.pairs.length > 1 ? <span className="w-14 shrink-0" aria-hidden /> : null}
                                  <SelfieThumb url={pair.checkOutSelfie} onOpen={setLightboxUrl} />
                                  <span className="tabular-nums">{outLabel}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.pairs.length === 0 ? (
                          <span className="text-[var(--callendra-text-secondary)]">—</span>
                        ) : (
                          <ul className="flex flex-col gap-2.5">
                            {r.pairs.map((pair, idx) => (
                              <li
                                key={`${pair.checkIn}-tl-${idx}`}
                                className="flex items-start gap-2 border-b border-[var(--callendra-border)]/60 pb-2.5 last:border-b-0 last:pb-0 min-h-[2.75rem]"
                              >
                                {r.pairs.length > 1 ? (
                                  <span className="text-[10px] uppercase tracking-wide text-[var(--callendra-text-secondary)] w-14 shrink-0 pt-0.5">
                                    Block {idx + 1}
                                  </span>
                                ) : null}
                                <WorkBlockTimeline
                                  pair={pair}
                                  pairIndex={idx}
                                  pairs={r.pairs}
                                  entries={dayEntries}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="font-medium tabular-nums">{formatHoursLabel(r.totalHours)}</div>
                        {r.pairs.length > 1 ? (
                          <p className="text-[10px] text-[var(--callendra-text-secondary)] mt-1 max-w-[10rem] leading-snug">
                            Sum of {r.pairs.length} work blocks
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--callendra-text-secondary)] mt-2 leading-snug">
            <span className="inline-block w-3 h-2 rounded-sm bg-[color-mix(in_srgb,var(--callendra-text-primary)_14%,var(--callendra-bg))] border border-[var(--callendra-border)]/80 align-middle mr-1" />{" "}
            Work window
            <span className="mx-2 opacity-50">·</span>
            <span className="inline-block w-3 h-2 rounded-sm bg-blue-500/85 align-middle mr-1" /> Break
            <span className="mx-2 opacity-50">·</span>
            Open shifts show times only until the block is checked out; then the bar spans in → out with breaks in blue.
          </p>

          <div className="mt-4 flex justify-end">
            <div className="text-sm border border-[var(--callendra-border)] rounded-xl px-4 py-2">
              Total staff hours: <span className="font-semibold">{formatHoursLabel(totalHours)}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
