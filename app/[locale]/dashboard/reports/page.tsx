"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatInstantInBusinessTz } from "@/lib/business-timezone";

type AptRow = {
  id: string;
  date: string;
  status: string;
  cancelReason?: string | null;
  totalPrice?: number | null;
  totalDurationMin?: number | null;
  extras?: Array<{
    customLabel?: string | null;
    service?: { name?: string | null } | null;
  }> | null;
  clientName: string;
  staff?: { name?: string | null } | null;
  service?: { name?: string | null; price?: number | null; duration?: number | null } | null;
  business?: { name?: string | null } | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: ymd(from), to: ymd(now) };
}

function formatTime(iso: string) {
  return formatInstantInBusinessTz(iso);
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDurationMin(min: number | null | undefined) {
  if (min == null || Number.isNaN(min)) return "—";
  return `${min} min`;
}

function cancellationLabel(status: string) {
  if (status === "cancelled") return "Cancelled (approved)";
  if (status === "cancel_requested") return "Pending approval";
  return "—";
}

function revenueForRow(apt: AptRow): number {
  if (apt.status === "cancelled") return 0;
  return Number(apt.totalPrice ?? apt.service?.price ?? 0);
}

function serviceSummary(apt: AptRow): string {
  const extras = (apt.extras ?? [])
    .map((e) => e.service?.name ?? e.customLabel ?? "")
    .filter((x) => !!x);
  return [apt.service?.name ?? "—", ...extras].join(" + ");
}

export default function ReportsPage() {
  const routeParams = useParams();
  const locale = typeof routeParams?.locale === "string" ? routeParams.locale : "en";

  const [rows, setRows] = useState<AptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isBranchView, setIsBranchView] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [serviceOptions, setServiceOptions] = useState<{ id: string; name: string }[]>([]);

  const initialRange = useMemo(() => defaultRange(), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [locationId, setLocationId] = useState<string>("all");
  const [serviceId, setServiceId] = useState<string>("all");
  const [staffId, setStaffId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("from", fromDate);
      qs.set("to", toDate);
      if (locationId !== "all") qs.set("locationId", locationId);
      if (serviceId !== "all") qs.set("serviceId", serviceId);
      if (staffId !== "all") qs.set("staffId", staffId);
      if (statusFilter !== "all") qs.set("status", statusFilter);

      const r = await fetch(`/api/appointments/consolidated?${qs.toString()}`);
      const data = await r.json();
      if (r.status === 403) {
        throw new Error(data.error || "Access denied");
      }
      if (!r.ok) throw new Error(data.error || "Failed to load");

      setRows(data.appointments || []);
      setIsBranchView(!!data.isBranchView);
      setBranchName(data.branchName ?? null);
      if (Array.isArray(data.locations)) setLocations(data.locations);
      if (Array.isArray(data.staffOptions)) {
        setStaffOptions(data.staffOptions.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
      }
      if (Array.isArray(data.serviceOptions)) {
        const seen = new Set<string>();
        const opts: { id: string; name: string }[] = [];
        for (const s of data.serviceOptions as { id: string; name: string }[]) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            opts.push({ id: s.id, name: s.name });
          }
        }
        setServiceOptions(opts);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, locationId, serviceId, staffId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped: Record<string, AptRow[]> = useMemo(() => {
    const g: Record<string, AptRow[]> = {};
    rows.forEach((apt) => {
      const name = apt.business?.name ?? "Unknown";
      if (!g[name]) g[name] = [];
      g[name].push(apt);
    });
    return g;
  }, [rows]);

  const grandTotal = useMemo(() => rows.reduce((sum, apt) => sum + revenueForRow(apt), 0), [rows]);

  const dashboardHref = `/${locale}/dashboard`;

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a
          href={dashboardHref}
          className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm"
        >
          ← Dashboard
        </a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">Consolidated reports</span>
      </nav>
      <div className="max-w-6xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-1">Appointments</h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm mb-6">
          {isBranchView && branchName ? (
            <>
              Location: <span className="text-[var(--callendra-text-primary)] font-medium">{branchName}</span>
              {" · "}
            </>
          ) : (
            <>All active locations · </>
          )}
          Filter by date range, branch, service, staff, and cancellation status.
        </p>

        <div className="flex flex-wrap gap-3 mb-8 items-end border border-[var(--callendra-border)] rounded-2xl p-4 bg-[color-mix(in_srgb,var(--callendra-text-primary)_4%,var(--callendra-bg))]">
          <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)]"
            />
          </label>
          {!isBranchView && (
            <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
              Branch
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)] min-w-[160px]"
              >
                <option value="all">All branches</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
            Service
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)] min-w-[160px]"
            >
              <option value="all">All services</option>
              {serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
            Staff
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)] min-w-[140px]"
            >
              <option value="all">All staff</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--callendra-text-secondary)]">
            Cancellation
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--callendra-border)] bg-[var(--callendra-bg)] px-2 py-1.5 text-sm text-[var(--callendra-text-primary)] min-w-[160px]"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="pending_cancel">Pending approval</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const d = defaultRange();
              setFromDate(d.from);
              setToDate(d.to);
              setLocationId("all");
              setServiceId("all");
              setStaffId("all");
              setStatusFilter("all");
            }}
            className="text-xs text-[var(--callendra-text-secondary)] underline underline-offset-2 hover:opacity-90"
          >
            Reset filters
          </button>
        </div>

        {loading && <p className="text-[var(--callendra-text-secondary)] opacity-80 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center text-[var(--callendra-text-secondary)] text-sm">
            No appointments match these filters.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="flex flex-col gap-8">
            {Object.entries(grouped).map(([locationName, apts]) => {
              const locationTotal = apts.reduce((sum, apt) => sum + revenueForRow(apt), 0);
              return (
                <div key={locationName}>
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-semibold text-[var(--callendra-text-secondary)] uppercase tracking-wider">
                      {locationName}
                    </h2>
                    <span className="text-xs text-[var(--callendra-text-secondary)] opacity-80">
                      {apts.length} appointment{apts.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="border border-[var(--callendra-border)] rounded-2xl overflow-hidden overflow-x-auto">
                    <table className="w-full min-w-[960px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--callendra-border)] text-left text-xs text-[var(--callendra-text-secondary)] opacity-90 uppercase tracking-wider">
                          <th className="px-4 py-2 font-medium w-[120px]">Date</th>
                          <th className="px-4 py-2 font-medium w-[88px]">Time</th>
                          <th className="px-4 py-2 font-medium w-[72px]">Duration</th>
                          <th className="px-4 py-2 font-medium">Client</th>
                          <th className="px-4 py-2 font-medium">Service</th>
                          <th className="px-4 py-2 font-medium w-[120px]">Staff</th>
                          <th className="px-4 py-2 font-medium w-[180px]">Cancellation</th>
                          <th className="px-4 py-2 font-medium text-right w-[72px]">$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apts.map((apt) => {
                          const muted = apt.status === "cancelled";
                          return (
                            <tr
                              key={apt.id}
                              className={`border-b border-[var(--callendra-border)] last:border-b-0 ${
                                muted ? "opacity-60" : ""
                              }`}
                            >
                              <td className="px-4 py-3 text-[var(--callendra-text-secondary)] whitespace-nowrap">
                                {formatDateShort(apt.date)}
                              </td>
                              <td className="px-4 py-3 font-mono text-[var(--callendra-accent)] text-xs whitespace-nowrap">
                                {formatTime(apt.date)}
                              </td>
                              <td className="px-4 py-3 text-[var(--callendra-text-secondary)] whitespace-nowrap">
                                {formatDurationMin(apt.totalDurationMin ?? apt.service?.duration)}
                              </td>
                              <td className="px-4 py-3 font-medium text-[var(--callendra-text-primary)] max-w-[200px]">
                                <span className="truncate block">{apt.clientName}</span>
                              </td>
                              <td className="px-4 py-3 text-[var(--callendra-text-secondary)] max-w-[220px]">
                                <span className="truncate block" title={serviceSummary(apt)}>
                                  {serviceSummary(apt)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[var(--callendra-text-secondary)] whitespace-nowrap">
                                {apt.staff?.name ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-[var(--callendra-text-secondary)] text-xs leading-snug">
                                <div>{cancellationLabel(apt.status)}</div>
                                {apt.status === "cancel_requested" && apt.cancelReason && (
                                  <div className="text-yellow-400/90 mt-0.5 line-clamp-2">{apt.cancelReason}</div>
                                )}
                                {apt.status === "cancelled" && apt.cancelReason && (
                                  <div className="opacity-80 mt-0.5 line-clamp-2">{apt.cancelReason}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-[var(--callendra-accent)] whitespace-nowrap">
                                {apt.status === "cancelled" ? (
                                  <span className="line-through opacity-70">${Number(apt.totalPrice ?? apt.service?.price ?? 0)}</span>
                                ) : (
                                  `$${revenueForRow(apt)}`
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] font-semibold">
                          <td colSpan={7} className="px-4 py-3 text-[var(--callendra-text-secondary)]">
                            Subtotal — {locationName}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--callendra-text-primary)]">
                            ${locationTotal}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}

            <div className="border border-[var(--callendra-border)] rounded-2xl px-5 py-4 flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-[var(--callendra-text-primary)]">Grand total</div>
                <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80">
                  {rows.length} appointment{rows.length !== 1 ? "s" : ""} across {Object.keys(grouped).length}{" "}
                  location{Object.keys(grouped).length !== 1 ? "s" : ""} (excludes cancelled from revenue)
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--callendra-accent)]">${grandTotal}</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
