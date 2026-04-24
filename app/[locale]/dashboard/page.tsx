"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { DateTime } from "luxon";
import { bookingPathForBusiness, walkInPathForBusiness } from "@/lib/booking-path";
import { isMainBusinessFromPayload } from "@/lib/main-business";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { DashboardNewAppointmentModal } from "@/components/dashboard-new-appointment-modal";
import { DashboardAppointmentExtraModal } from "@/components/dashboard-appointment-extra-modal";

const TIME_OPTIONS_15 = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
  }
  return out;
})();

function breakStartMillis(ymd: string, startTime: string): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, min] = startTime.split(":").map(Number);
  return DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: min },
    { zone: BUSINESS_TIMEZONE }
  ).toMillis();
}

function appointmentExtrasSummary(apt: any): string {
  const parts = [
    apt?.service?.name,
    ...(apt?.extras ?? []).map((e: any) => e?.service?.name ?? e?.customLabel ?? "Extra"),
  ].filter(Boolean);
  return parts.join(" · ");
}

function appointmentSchedulePrice(apt: any): number {
  return Number(apt?.totalPrice ?? apt?.service?.price ?? 0);
}

type ScheduleRow =
  | { kind: "appointment"; apt: any }
  | { kind: "break"; br: any; businessYmd: string };

export default function DashboardPage() {
  const routeParams = useParams();
  const locale = typeof routeParams?.locale === "string" ? routeParams.locale : "en";
  const reportsHref = `/${locale}/dashboard/reports`;

  const [session, setSession] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [editingApt, setEditingApt] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [staffList, setStaffList] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });
  const [bookingPath, setBookingPath] = useState("");
  const [walkInPath, setWalkInPath] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [switchingLocation, setSwitchingLocation] = useState(false);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "STAFF", staffId: "" });
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editUserForm, setEditUserForm] = useState({ name: "", role: "STAFF", staffId: "" });
  const [cancelRequestApt, setCancelRequestApt] = useState<any>(null);
  const [showNewAptModal, setShowNewAptModal] = useState(false);
  const [serviceList, setServiceList] = useState<any[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelRequests, setCancelRequests] = useState<any[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [scheduleDate, setScheduleDate] = useState(() =>
    DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd")
  );
  const [staffBreaks, setStaffBreaks] = useState<any[]>([]);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakSaving, setBreakSaving] = useState(false);
  const [breakError, setBreakError] = useState("");
  const [extraModalApt, setExtraModalApt] = useState<any>(null);
  const [breakForm, setBreakForm] = useState({
    staffId: "",
    breakBusinessId: "",
    date: "",
    startTime: "12:00",
    durationPreset: "30",
    customMinutes: "30",
    label: "Break",
  });

  /** Prefer server `isMainBusiness` (matches canonical main row even when locationSlug was set to "main"). */
  function isMainBusinessPayload(biz: any) {
    if (!biz) return false;
    if (typeof biz.isMainBusiness === "boolean") return biz.isMainBusiness;
    const ls = biz.locationSlug;
    return ls == null || ls === "" || String(ls).trim() === "";
  }

  const fetchData = async () => {
    const [sessionRes, locsRes, bizRes] = await Promise.all([
      fetch("/api/auth/session"),
      fetch("/api/business/locations"),
      fetch("/api/business"),
    ]);
    const sessionData = await sessionRes.json();
    const locsData = await locsRes.json();
    const biz = await bizRes.json();

    if (!sessionData.businessId) { window.location.href = "/en/login"; return; }
    setSession(sessionData);
    if (Array.isArray(locsData)) setLocations(locsData);
    if (biz?.id) setBusiness(biz);

    if (biz?.id) {
      console.log("[dashboard] business.locationSlug =", biz.locationSlug, "| isMainBusiness =", biz.isMainBusiness);
    }

    // Cargar staff list siempre
    const staffRes2 = await fetch("/api/staff");
    const svcRes = await fetch("/api/services");
    const svcData = await svcRes.json();
    console.log("svcData:", JSON.stringify(svcData));
    if (Array.isArray(svcData)) setServiceList(svcData);
    else if (svcData.services) setServiceList(svcData.services);
    const staffData2 = await staffRes2.json();
    if (staffData2.staff) setStaffList(staffData2.staff);
    else if (Array.isArray(staffData2)) setStaffList(staffData2);

    // Cargar team users y solicitudes de cancelación si es owner
    if (sessionData?.ownerId) {
      const teamRes = await fetch("/api/staff-users?businessId=" + sessionData.businessId);
      const teamData = await teamRes.json();
      if (teamData.users) setTeamUsers(teamData.users);

      const cancelRes = await fetch("/api/appointments/cancel-requests");
      const cancelData = await cancelRes.json();
      if (cancelData.appointments) setCancelRequests(cancelData.appointments);
    }

    const locList = Array.isArray(locsData) ? locsData : [];
    /** Varias filas Business bajo la misma cuenta (marcas o sucursales). */
    const accountHasMultipleBusinessRows = locList.length > 1;
    const main = biz ? isMainBusinessFromPayload(biz) : false;

    let loadedApts: any[] = [];

    if (accountHasMultipleBusinessRows && main) {
      const consParams = new URLSearchParams();
      consParams.set("date", scheduleDate);
      if (locationFilter !== "all") consParams.set("locationId", locationFilter);
      const cons = await fetch(`/api/appointments/consolidated?${consParams.toString()}`);
      const c = await cons.json();
      if (cons.ok && Array.isArray(c.appointments)) {
        loadedApts = c.appointments;
        setAppointments(c.appointments);
        setStats({ total: c.total ?? 0, thisWeek: c.thisWeek ?? 0 });
      } else {
        setAppointments([]);
        setStats({ total: 0, thisWeek: 0 });
      }
    } else {
      const aptsRes = await fetch(`/api/appointments?date=${encodeURIComponent(scheduleDate)}`);
      const staffRes = await fetch("/api/staff");
      const staffData = await staffRes.json();
      if (staffData.staff) setStaffList(staffData.staff);
      else if (Array.isArray(staffData)) setStaffList(staffData);
      const aptsData = await aptsRes.json();
      if (aptsData.appointments) {
        loadedApts = aptsData.appointments;
        setAppointments(aptsData.appointments);
        setStats({ total: aptsData.total, thisWeek: aptsData.thisWeek });
      }
    }

    let nextBreaks: any[] = [];
    if (accountHasMultipleBusinessRows && main) {
      const breakBusinessIds: string[] =
        locationFilter !== "all"
          ? [locationFilter]
          : locList.map((l: any) => l.id).filter(Boolean);
      for (const bid of breakBusinessIds) {
        const rb = await fetch(
          `/api/staff-breaks?businessId=${encodeURIComponent(bid)}&date=${encodeURIComponent(scheduleDate)}`
        );
        const j = await rb.json();
        if (Array.isArray(j.breaks)) {
          nextBreaks = nextBreaks.concat(j.breaks.map((b: any) => ({ ...b, businessId: bid })));
        }
      }
    } else if (biz?.id) {
      const rb = await fetch(
        `/api/staff-breaks?businessId=${encodeURIComponent(biz.id)}&date=${encodeURIComponent(scheduleDate)}`
      );
      const j = await rb.json();
      if (Array.isArray(j.breaks)) nextBreaks = j.breaks.map((b: any) => ({ ...b, businessId: biz.id }));
    }
    setStaffBreaks(nextBreaks);
  };

  useEffect(() => {
    fetchData();
  }, [locationFilter, scheduleDate]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!locationMenuRef.current?.contains(e.target as Node)) {
        setLocationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!session?.businessId) return;
    Promise.all([fetch("/api/business"), fetch("/api/business/locations")])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([biz, locs]) => {
        if (!biz?.id) return;
        const list = Array.isArray(locs) ? locs : [];
        const parent = biz.parentSlug ?? biz.slug;
        const countForParent = list.filter(
          (l: any) => (l.parentSlug ?? l.slug) === parent
        ).length;
        const bp = bookingPathForBusiness(biz.parentSlug, biz.slug, biz.locationSlug, countForParent);
        setBookingPath(bp);
        setWalkInPath(walkInPathForBusiness(biz.parentSlug, biz.slug, biz.locationSlug, countForParent));
      });
  }, [session]);

  const handleSwitchLocation = async (businessId: string) => {
    if (businessId === session?.businessId) {
      setLocationMenuOpen(false);
      return;
    }
    setSwitchingLocation(true);
    try {
      const res = await fetch("/api/auth/switch-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not switch location");
      }
      window.location.reload();
    } catch (e) {
      console.error(e);
      setSwitchingLocation(false);
    }
  };

  const handleEdit = (apt: any) => {
    setEditingApt(apt);
    setEditForm({
      date: new Date(apt.date).toISOString().slice(0, 10),
      time: new Date(apt.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      staffId: apt.staffId,
      serviceId: apt.serviceId,
    });
  };

  const handleEditSave = async () => {
    if (!editingApt) return;
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingApt.id, status: editingApt.status, date: editForm.date, time: editForm.time, staffId: editForm.staffId, serviceId: editForm.serviceId }),
    });
    setEditingApt(null);
    fetchData();
  };

  const handleCancel = async (id: string) => {
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    fetchData();
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const formatBreakRowTime = (businessYmd: string, startTime: string) =>
    new Date(breakStartMillis(businessYmd, startTime)).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const branchLocationsForBreaks = locations.filter(
    (loc: any) => loc.locationSlug && loc.locationSlug !== "" && loc.locationSlug !== "main"
  );

  const bookingHref = bookingPath ? `/en${bookingPath}` : `/en/book/${session?.slug ?? ""}`;
  const isMain = isMainBusinessFromPayload(business);
  const isOwner = !!(session?.ownerId);
  const userRole = session?.role || null; // "ADMIN" | "STAFF" | null (owner)
  /** Varias filas en la cuenta (p. ej. El de Guanajuato + The Barber). */
  const accountHasMultipleBusinessRows = locations.length > 1;
  /**
   * Sucursales de ESTA marca (mismo parentSlug canónico): 1 = solo sede / una fila de marca.
   * No confundir con cuántas marcas tiene el owner en total.
   */
  const parentKey = business ? (business.parentSlug ?? business.slug) : "";
  const locationsForThisBrand = locations.filter(
    (loc: any) => (loc.parentSlug ?? loc.slug) === parentKey
  );
  const singleBrandLocation = locationsForThisBrand.length === 1;
  /** En marca multi-sucursal, el main es catálogo/consolidado sin horarios de cita en esa fila. */
  const showNewAppointmentQuickAction = singleBrandLocation || !isMain;

  const revenueToday = appointments.reduce((sum, a) => sum + (a.service?.price || 0), 0);

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
    </div>
  );

  if (!business) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const displayScreenHref =
    business.displayToken
      ? `/${locale}/display/${session.slug}?token=${encodeURIComponent(business.displayToken)}`
      : `/${locale}/dashboard/profile?displayToken=required`;

  const walkInHref =
    business.walkInToken && walkInPath
      ? `/${locale}${walkInPath}?token=${encodeURIComponent(business.walkInToken)}`
      : `/${locale}/dashboard/profile?walkInToken=required`;

  const withDisplayAndWalkInHref = (actions: { label: string; icon: string; href: string }[]) =>
    actions.map((a) => {
      if (a.label === "Display screen") return { ...a, href: displayScreenHref };
      if (a.label === "Walk-in (iPad)") return { ...a, href: walkInHref };
      return a;
    });

  const mainActionsMulti = [
    { label: "Manage staff", icon: "👤", href: "/en/dashboard/staff" },
    { label: "Manage services", icon: "✂️", href: "/en/dashboard/services" },
    { label: "Locations", icon: "🏪", href: "/en/dashboard/locations" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
    { label: "Consolidated reports", icon: "📊", href: reportsHref },
    { label: "Time Clock", icon: "🕒", href: "/en/dashboard/timeclock" },
    { label: "Team access", icon: "🔑", href: "#team" },
  ];

  const locationActionsMulti = withDisplayAndWalkInHref([
    { label: "Schedule", icon: "🕐", href: "/en/dashboard/schedule" },
    { label: "Today's bookings", icon: "📅", href: "#today" },
    { label: "Display screen", icon: "📺", href: `/en/display/${session.slug}` },
    { label: "Walk-in (iPad)", icon: "🚶", href: `/en/walk-in/${session.slug}` },
    { label: "Assigned staff", icon: "👥", href: "/en/dashboard/staff" },
    { label: "Assigned services", icon: "💈", href: "/en/dashboard/services" },
    { label: "Time Clock", icon: "🕒", href: "/en/dashboard/timeclock" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
    ...(isOwner ? [{ label: "Consolidated reports", icon: "📊", href: reportsHref }] as const : []),
  ]);

  /** Una sola fila Business para esta marca: catálogo + operación en un solo lugar */
  const fullActionsSingle = withDisplayAndWalkInHref([
    { label: "Manage staff", icon: "👤", href: "/en/dashboard/staff" },
    { label: "Manage services", icon: "✂️", href: "/en/dashboard/services" },
    { label: "Set schedule", icon: "🕐", href: "/en/dashboard/schedule" },
    { label: "Display screen", icon: "📺", href: `/en/display/${session.slug}` },
    { label: "Walk-in (iPad)", icon: "🚶", href: `/en/walk-in/${session.slug}` },
    { label: "Today's bookings", icon: "📅", href: "#today" },
    { label: "Business profile", icon: "⚙️", href: "/en/dashboard/profile" },
    { label: "Locations", icon: "🏪", href: "/en/dashboard/locations" },
    { label: "Time Clock", icon: "🕒", href: "/en/dashboard/timeclock" },
    { label: "Team access", icon: "🔑", href: "#team" },
    ...(isOwner ? [{ label: "Consolidated reports", icon: "📊", href: reportsHref }] : []),
  ]);

  const isStaffUser = session?.userType === "staff";
  const canManageStaffBreaks = !!(isOwner || (isStaffUser && userRole === "ADMIN"));
  const chicagoTodayYmd = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
  const scheduleHeading =
    scheduleDate === chicagoTodayYmd ? "Today's schedule" : `Schedule — ${scheduleDate}`;

  const scheduleRows: ScheduleRow[] = [
    ...appointments.map((apt) => ({ kind: "appointment" as const, apt })),
    ...staffBreaks.map((br) => ({ kind: "break" as const, br, businessYmd: scheduleDate })),
  ];
  scheduleRows.sort((a, b) => {
    const ta =
      a.kind === "appointment"
        ? new Date(a.apt.date).getTime()
        : breakStartMillis(a.businessYmd, a.br.startTime);
    const tb =
      b.kind === "appointment"
        ? new Date(b.apt.date).getTime()
        : breakStartMillis(b.businessYmd, b.br.startTime);
    return ta - tb;
  });

  const openBreakModal = () => {
    setBreakError("");
    setShowBreakModal(true);
    let breakBiz = session?.businessId ?? "";
    if (accountHasMultipleBusinessRows && isMain) {
      if (locationFilter !== "all") {
        breakBiz = locationFilter;
      } else {
        breakBiz = branchLocationsForBreaks[0]?.id ?? breakBiz;
      }
    }
    setBreakForm({
      staffId: staffList[0]?.id ?? "",
      breakBusinessId: breakBiz,
      date: scheduleDate,
      startTime: "12:00",
      durationPreset: "30",
      customMinutes: "30",
      label: "Break",
    });
  };

  const saveBreak = async () => {
    const targetBiz = breakForm.breakBusinessId || session?.businessId;
    if (!breakForm.staffId || !targetBiz) {
      setBreakError("Select a staff member and location");
      return;
    }
    const durationMin =
      breakForm.durationPreset === "custom"
        ? Math.max(1, parseInt(breakForm.customMinutes, 10) || 0)
        : parseInt(breakForm.durationPreset, 10);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      setBreakError("Invalid duration");
      return;
    }
    setBreakSaving(true);
    setBreakError("");
    try {
      const res = await fetch("/api/staff-breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: breakForm.staffId,
          businessId: targetBiz,
          date: breakForm.date,
          startTime: breakForm.startTime,
          duration: durationMin,
          label: breakForm.label.trim() || "Break",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save break");
      setShowBreakModal(false);
      fetchData();
    } catch (e: unknown) {
      setBreakError(e instanceof Error ? e.message : "Error");
    } finally {
      setBreakSaving(false);
    }
  };

  const deleteStaffBreak = async (id: string) => {
    if (!confirm("Remove this break?")) return;
    const res = await fetch(`/api/staff-breaks/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Could not remove break");
      return;
    }
    fetchData();
  };

  const staffAllowedLabels = [
    "Schedule",
    "Today's bookings",
    "Display screen",
    "Walk-in (iPad)",
    "Assigned staff",
    "Assigned services",
  ];

  const rawQuickActions = singleBrandLocation
    ? fullActionsSingle
    : isMain
      ? mainActionsMulti
      : locationActionsMulti;

  const quickActions = isStaffUser
    ? rawQuickActions.filter(a => staffAllowedLabels.includes(a.label))
    : rawQuickActions;

  return (
    <main className="min-h-screen">

      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex justify-between items-center">
        <span className="font-bold text-lg">Callendra</span>
        <div className="flex items-center gap-4">
          <div className="relative" ref={locationMenuRef}>
            <button
              type="button"
              disabled={switchingLocation}
              onClick={() => setLocationMenuOpen((o) => !o)}
              className="flex items-center gap-2 text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 border border-[var(--callendra-border)] rounded-lg px-3 py-2 transition disabled:opacity-50 bg-[var(--callendra-bg)]"
              aria-expanded={locationMenuOpen}
              aria-haspopup="listbox"
            >
              <span>{session.businessName}</span>
              <span className="text-[var(--callendra-text-secondary)] opacity-80 text-xs" aria-hidden>▼</span>
            </button>
            {locationMenuOpen && locations.length > 0 && (
              <ul
                role="listbox"
                className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-[var(--callendra-border)] bg-[var(--callendra-bg)] py-1 shadow-lg"
              >
                {locations.map((loc) => {
                  const active = loc.id === session.businessId;
                  return (
                    <li key={loc.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        disabled={switchingLocation}
                        onClick={() => handleSwitchLocation(loc.id)}
                        className={`w-full px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] text-[var(--callendra-text-primary)] font-medium"
                            : "text-[var(--callendra-text-secondary)] hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] hover:opacity-90"
                        }`}
                      >
                        {loc.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/en/login"))}
            className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-10">

        <div className="mb-10">
          <h1 className="text-3xl font-bold">{greeting} 👋</h1>
          <p className="text-[var(--callendra-text-secondary)] mt-1">
            {singleBrandLocation
              ? `Here's what's happening with ${session.businessName} today.`
              : accountHasMultipleBusinessRows && isMain
                ? "Overview of all your locations."
                : `Here's what's happening with ${session.businessName} today.`}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: scheduleDate === chicagoTodayYmd ? "Today's appointments" : "Appointments (day)",
              value: appointments.length,
              icon: "📅",
            },
            { label: "This week", value: stats.thisWeek, icon: "📊" },
            { label: "Total appointments", value: stats.total, icon: "👥" },
            {
              label: scheduleDate === chicagoTodayYmd ? "Revenue today" : "Revenue (day)",
              value: `$${revenueToday.toFixed(0)}`,
              icon: "💰",
            },
          ].map((stat) => (
            <div key={stat.label} className="border border-[var(--callendra-border)] rounded-2xl p-5">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(isOwner || isStaffUser) && showNewAppointmentQuickAction && (
              <button
                onClick={() => setShowNewAptModal(true)}
                className="border border-[var(--callendra-border)] rounded-2xl p-5 text-left hover:border-[var(--callendra-accent)] transition block">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm font-medium">New appointment</div>
              </button>
            )}
            {quickActions.map((action) => (
              <a key={action.label} href={action.href}
                className="border border-[var(--callendra-border)] rounded-2xl p-5 text-left hover:border-[var(--callendra-accent)] transition block">
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="text-sm font-medium">{action.label}</div>
              </a>
            ))}
          </div>
        </div>

        {accountHasMultipleBusinessRows && isMain ? (
          <div className="mb-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
              <h2 className="text-lg font-semibold">{scheduleHeading}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-lg px-3 py-2 text-sm text-[var(--callendra-text-primary)] outline-none"
                />
                {canManageStaffBreaks && (
                  <button
                    type="button"
                    onClick={openBreakModal}
                    className="text-sm border border-[var(--callendra-border)] px-4 py-2 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition"
                  >
                    + Add break
                  </button>
                )}
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-lg px-3 py-2 text-sm text-[var(--callendra-text-primary)] outline-none"
                >
                  <option value="all">All locations</option>
                  {locations
                    .filter(
                      (loc: any) =>
                        loc.locationSlug && loc.locationSlug !== "" && loc.locationSlug !== "main"
                    )
                    .map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                </select>
                <a
                  href={reportsHref}
                  className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 transition border border-[var(--callendra-border)] px-4 py-2 rounded-full"
                >
                  Reports →
                </a>
              </div>
            </div>
            {scheduleRows.length === 0 ? (
              <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-[var(--callendra-text-secondary)] text-sm">No appointments or breaks for this day</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {scheduleRows.map((row) =>
                  row.kind === "appointment" ? (
                    <div
                      key={row.apt.id}
                      className="border border-[var(--callendra-border)] rounded-2xl px-6 py-4 flex justify-between items-center hover:border-[var(--callendra-border)] transition"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-2xl font-mono font-bold w-16 ${row.apt.status === "cancel_requested" ? "text-yellow-400" : "text-[var(--callendra-accent)]"}`}
                        >
                          {formatTime(row.apt.date)}
                        </div>
                        <div>
                          <div className="font-semibold">{row.apt.clientName}</div>
                          <div className="text-sm text-[var(--callendra-text-secondary)]">
                            {appointmentExtrasSummary(row.apt)} · with {row.apt.staff?.name}
                          </div>
                          <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-0.5">
                            {row.apt.business?.name}
                          </div>
                          {row.apt.status === "cancel_requested" && (
                            <div className="text-xs text-yellow-400 mt-0.5">⏳ Cancel requested</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <span className="text-sm font-semibold text-[var(--callendra-accent)]">
                          ${appointmentSchedulePrice(row.apt).toFixed(0)}
                        </span>
                        {canManageStaffBreaks ? (
                          <button
                            type="button"
                            onClick={() => setExtraModalApt(row.apt)}
                            className="text-xs text-[var(--callendra-accent)] hover:opacity-90 transition border border-[var(--callendra-accent)]/40 px-3 py-1 rounded-full"
                          >
                            Add extra
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleCancel(row.apt.id)}
                          className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`break-${row.br.id}`}
                      className="border border-dashed border-[var(--callendra-border)] rounded-2xl px-6 py-4 flex justify-between items-center bg-[color-mix(in_srgb,var(--callendra-text-primary)_5%,var(--callendra-bg))] transition"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-mono font-bold w-16 text-[var(--callendra-text-secondary)]">
                          {formatBreakRowTime(row.businessYmd, row.br.startTime)}
                        </div>
                        <div>
                          <div className="font-semibold">{row.br.label || "Break"}</div>
                          <div className="text-sm text-[var(--callendra-text-secondary)]">
                            {row.br.duration} min · with {row.br.staff?.name}
                          </div>
                          {row.br.businessId ? (
                            <div className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-0.5">
                              {locations.find((l: any) => l.id === row.br.businessId)?.name ?? ""}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {canManageStaffBreaks ? (
                        <button
                          type="button"
                          onClick={() => deleteStaffBreak(row.br.id)}
                          className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <div id="today">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
              <h2 className="text-lg font-semibold">{scheduleHeading}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-[var(--callendra-bg)] border border-[var(--callendra-border)] rounded-lg px-3 py-2 text-sm text-[var(--callendra-text-primary)] outline-none"
                />
                {canManageStaffBreaks && (
                  <button
                    type="button"
                    onClick={openBreakModal}
                    className="text-sm border border-[var(--callendra-border)] px-4 py-2 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition"
                  >
                    + Add break
                  </button>
                )}
                <a
                  href={bookingHref}
                  target="_blank"
                  className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 transition border border-[var(--callendra-border)] px-4 py-2 rounded-full"
                >
                  Booking link
                </a>
              </div>
            </div>

            {scheduleRows.length === 0 ? (
              <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-[var(--callendra-text-secondary)] text-sm">No appointments or breaks for this day</p>
                <a href={bookingHref} target="_blank"
                  className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-[var(--callendra-text-secondary)] transition mt-2 block">
                  Share your booking link to get started
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {scheduleRows.map((row) =>
                  row.kind === "appointment" ? (
                    <div
                      key={row.apt.id}
                      className="border border-[var(--callendra-border)] rounded-2xl px-6 py-4 flex justify-between items-center hover:border-[var(--callendra-border)] transition"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-2xl font-mono font-bold w-16 ${row.apt.status === "cancel_requested" ? "text-yellow-400" : "text-[var(--callendra-accent)]"}`}
                        >
                          {formatTime(row.apt.date)}
                        </div>
                        <div>
                          <div className="font-semibold">{row.apt.clientName}</div>
                          <div className="text-sm text-[var(--callendra-text-secondary)]">
                            {appointmentExtrasSummary(row.apt)} · with {row.apt.staff?.name}
                          </div>
                          {row.apt.status === "cancel_requested" && (
                            <div className="text-xs text-yellow-400 mt-0.5">⏳ Cancel requested</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <span className="text-sm font-semibold text-[var(--callendra-accent)]">
                          ${appointmentSchedulePrice(row.apt).toFixed(0)}
                        </span>
                        {canManageStaffBreaks ? (
                          <button
                            type="button"
                            onClick={() => setExtraModalApt(row.apt)}
                            className="text-xs text-[var(--callendra-accent)] hover:opacity-90 transition border border-[var(--callendra-accent)]/40 px-3 py-1 rounded-full"
                          >
                            Add extra
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleEdit(row.apt)}
                          className="text-xs text-[var(--callendra-text-secondary)] hover:opacity-90 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                        >
                          Edit
                        </button>
                        {!isStaffUser ? (
                          <button
                            type="button"
                            onClick={() => handleCancel(row.apt.id)}
                            className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                          >
                            Cancel
                          </button>
                        ) : row.apt.status === "cancel_requested" ? (
                          <span className="text-xs text-yellow-400 border border-yellow-400/30 px-3 py-1 rounded-full">
                            Pending
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelRequestApt(row.apt);
                              setCancelReason("");
                            }}
                            className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-yellow-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                          >
                            Request cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`break-${row.br.id}`}
                      className="border border-dashed border-[var(--callendra-border)] rounded-2xl px-6 py-4 flex justify-between items-center bg-[color-mix(in_srgb,var(--callendra-text-primary)_5%,var(--callendra-bg))] transition"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-mono font-bold w-16 text-[var(--callendra-text-secondary)]">
                          {formatBreakRowTime(row.businessYmd, row.br.startTime)}
                        </div>
                        <div>
                          <div className="font-semibold">{row.br.label || "Break"}</div>
                          <div className="text-sm text-[var(--callendra-text-secondary)]">
                            {row.br.duration} min · with {row.br.staff?.name}
                          </div>
                        </div>
                      </div>
                      {canManageStaffBreaks ? (
                        <button
                          type="button"
                          onClick={() => deleteStaffBreak(row.br.id)}
                          className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

      </div>
    {editingApt && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_72%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Edit Appointment</h2>
            <div className="text-sm text-[var(--callendra-text-secondary)]">{editingApt.clientName} — {editingApt.service?.name}</div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Date</label>
              <input type="date" value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Time</label>
              <input type="time" value={editForm.time}
                onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Barber</label>
              <select value={editForm.staffId}
                onChange={(e) => setEditForm({ ...editForm, staffId: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition">
                {staffList.map((s: any) => (
                  <option key={s.id} value={s.id} className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={handleEditSave}
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold transition">
                Save
              </button>
              <button onClick={() => setEditingApt(null)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Requests - solo owner */}
      {isOwner && cancelRequests.length > 0 && (
        <div className="max-w-6xl mx-auto px-8 pb-6">
          <div className="border border-yellow-500/30 rounded-2xl p-6 bg-yellow-500/5">
            <h2 className="text-lg font-semibold mb-4 text-yellow-400">⚠️ Cancel requests ({cancelRequests.length})</h2>
            <div className="flex flex-col gap-3">
              {cancelRequests.map((apt: any) => (
                <div key={apt.id} className="flex justify-between items-center border border-[var(--callendra-border)] rounded-xl px-5 py-3">
                  <div>
                    <div className="font-semibold">{apt.clientName} — {apt.service?.name}</div>
                    <div className="text-sm text-[var(--callendra-text-secondary)]">with {apt.staff?.name} · {new Date(apt.date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                    <div className="text-sm text-yellow-300 mt-1">Reason: {apt.cancelReason}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: apt.id, status: "cancelled" }) });
                        fetchData();
                      }}
                      className="text-xs text-red-400 border border-red-400/30 px-3 py-1 rounded-full hover:bg-red-400/10 transition"
                    >Approve cancel</button>
                    <button
                      onClick={async () => {
                        await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: apt.id, status: "confirmed" }) });
                        fetchData();
                      }}
                      className="text-xs text-[var(--callendra-accent)] border border-green-400/30 px-3 py-1 rounded-full hover:bg-green-400/10 transition"
                    >Keep</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team Access Section - solo owner */}
      {isOwner && (
        <div id="team" className="max-w-6xl mx-auto px-8 pb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Team access</h2>
            <button
              onClick={() => { setShowTeamModal(true); setTeamError(""); setNewUser({ name: "", email: "", password: "", role: "STAFF", staffId: "" }); }}
              className="text-sm border border-[var(--callendra-border)] px-4 py-2 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition"
            >
              + Add member
            </button>
          </div>

          {teamUsers.length === 0 ? (
            <div className="border border-[var(--callendra-border)] rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🔑</div>
              <p className="text-[var(--callendra-text-secondary)] text-sm">No team members yet</p>
              <p className="text-[var(--callendra-text-secondary)] opacity-80 text-xs mt-1">Add staff or admins so they can access the dashboard</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {teamUsers.map((u: any) => (
                <div key={u.id} className="border border-[var(--callendra-border)] rounded-2xl px-6 py-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-sm text-[var(--callendra-text-secondary)]">{u.email} · {u.staff?.name ? `Linked to ${u.staff.name}` : "No barber linked"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-3 py-1 rounded-full border ${u.role === "ADMIN" ? "border-blue-500/30 text-blue-400" : "border-[var(--callendra-border)] text-[var(--callendra-text-secondary)]"}`}>
                      {u.role}
                    </span>
                    <button
                      onClick={() => { setEditingUser(u); setEditUserForm({ name: u.name, role: u.role, staffId: u.staffId || "" }); }}
                      className="text-xs text-[var(--callendra-text-secondary)] hover:opacity-90 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => { await fetch("/api/staff-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) }); fetchData(); }}
                      className="text-xs text-[var(--callendra-text-secondary)] opacity-80 hover:text-red-400 transition border border-[var(--callendra-border)] px-3 py-1 rounded-full"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal editar team member */}
      {editingUser && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_72%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Edit team member</h2>
            <div className="text-sm text-[var(--callendra-text-secondary)]">{editingUser.email}</div>
            <input placeholder="Full name" value={editUserForm.name}
              onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]" />
            <select value={editUserForm.role}
              onChange={e => setEditUserForm({ ...editUserForm, role: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]">
              <option value="STAFF" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">Staff — sees own appointments only</option>
              <option value="ADMIN" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">Admin — manages all appointments</option>
            </select>
            <select value={editUserForm.staffId}
              onChange={e => setEditUserForm({ ...editUserForm, staffId: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]">
              <option value="" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">No barber linked</option>
              {staffList.map((s: any) => (
                <option key={s.id} value={s.id} className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">{s.name}</option>
              ))}
            </select>
            <div className="flex gap-3 mt-2">
              <button
                onClick={async () => {
                  const res = await fetch("/api/staff-users", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editingUser.id, name: editUserForm.name, role: editUserForm.role, staffId: editUserForm.staffId || null }),
                  });
                  const data = await res.json();
                  if (data.success) { setEditingUser(null); fetchData(); }
                }}
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold transition"
              >Save</button>
              <button onClick={() => setEditingUser(null)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear team member */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_72%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Add team member</h2>
            <input placeholder="Full name" value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]" />
            <input type="email" placeholder="Email" value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]" />
            <input type="password" placeholder="Password" value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]" />
            <select value={newUser.role}
              onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]">
              <option value="STAFF" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">Staff — sees own appointments only</option>
              <option value="ADMIN" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">Admin — manages all appointments</option>
            </select>
            <select value={newUser.staffId}
              onChange={e => setNewUser({ ...newUser, staffId: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)]">
              <option value="" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">Link to barber (optional)</option>
              {staffList.map((s: any) => (
                <option key={s.id} value={s.id} className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">{s.name}</option>
              ))}
            </select>
            {teamError && <p className="text-red-400 text-sm">{teamError}</p>}
            <div className="flex gap-3 mt-2">
              <button
                disabled={teamLoading}
                onClick={async () => {
                  if (!newUser.name || !newUser.email || !newUser.password) { setTeamError("Name, email and password are required"); return; }
                  setTeamLoading(true); setTeamError("");
                  const res = await fetch("/api/staff-users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...newUser, businessId: session.businessId, staffId: newUser.staffId || null }),
                  });
                  const data = await res.json();
                  if (data.success) { setShowTeamModal(false); fetchData(); }
                  else setTeamError(data.error || "Error creating user");
                  setTeamLoading(false);
                }}
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50"
              >
                {teamLoading ? "Creating..." : "Create"}
              </button>
              <button onClick={() => setShowTeamModal(false)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal solicitud de cancelación - solo staff */}
      {cancelRequestApt && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_72%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Request cancellation</h2>
            <div className="text-sm text-[var(--callendra-text-secondary)]">{cancelRequestApt.clientName} — {cancelRequestApt.service?.name}</div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Reason for cancellation</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Explain why this appointment needs to be cancelled..."
                rows={3}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition resize-none"
              />
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={async () => {
                  if (!cancelReason.trim()) return;
                  await fetch("/api/appointments", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: cancelRequestApt.id, status: "cancel_requested", cancelReason }),
                  });
                  setCancelRequestApt(null);
                  fetchData();
                }}
                className="flex-1 bg-yellow-500 text-black py-3 rounded-xl text-sm font-semibold hover:bg-yellow-400 transition"
              >
                Send request
              </button>
              <button onClick={() => setCancelRequestApt(null)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition">
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      <DashboardNewAppointmentModal
        open={showNewAptModal}
        onClose={() => setShowNewAptModal(false)}
        business={
          business
            ? {
                slug: business.slug,
                parentSlug: business.parentSlug,
                locationSlug: business.locationSlug,
              }
            : null
        }
        staffList={staffList}
        serviceList={serviceList}
        onCreated={fetchData}
      />

      <DashboardAppointmentExtraModal
        open={!!extraModalApt}
        appointment={
          extraModalApt
            ? {
                id: extraModalApt.id,
                businessId: extraModalApt.businessId,
                clientName: extraModalApt.clientName,
              }
            : null
        }
        onClose={() => setExtraModalApt(null)}
        onSaved={fetchData}
      />

      {showBreakModal && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--callendra-text-primary)_72%,var(--callendra-bg))] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Add break</h2>
            {accountHasMultipleBusinessRows && isMain && branchLocationsForBreaks.length > 0 ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--callendra-text-secondary)]">Location</label>
                <select
                  value={breakForm.breakBusinessId}
                  onChange={(e) => setBreakForm({ ...breakForm, breakBusinessId: e.target.value })}
                  className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
                >
                  {branchLocationsForBreaks.map((loc: any) => (
                    <option
                      key={loc.id}
                      value={loc.id}
                      className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]"
                    >
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Staff</label>
              <select
                value={breakForm.staffId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBreakForm((prev) => {
                    let biz = prev.breakBusinessId;
                    if (accountHasMultipleBusinessRows && isMain && branchLocationsForBreaks.length > 0) {
                      const s = staffList.find((x: any) => x.id === id);
                      const allowed: string[] = s?.assignedLocationIds ?? [];
                      if (allowed.length && !allowed.includes(biz)) {
                        biz =
                          allowed.find((bid) => branchLocationsForBreaks.some((l: any) => l.id === bid)) ??
                          allowed[0];
                      }
                    }
                    return { ...prev, staffId: id, breakBusinessId: biz };
                  });
                }}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              >
                {staffList.map((s: any) => (
                  <option
                    key={s.id}
                    value={s.id}
                    className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]"
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Date</label>
              <input
                type="date"
                value={breakForm.date}
                onChange={(e) => setBreakForm({ ...breakForm, date: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Start time</label>
              <select
                value={breakForm.startTime}
                onChange={(e) => setBreakForm({ ...breakForm, startTime: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              >
                {TIME_OPTIONS_15.map((t) => (
                  <option
                    key={t}
                    value={t}
                    className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]"
                  >
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Duration</label>
              <select
                value={breakForm.durationPreset}
                onChange={(e) => setBreakForm({ ...breakForm, durationPreset: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              >
                <option value="15" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  15 min
                </option>
                <option value="30" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  30 min
                </option>
                <option value="45" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  45 min
                </option>
                <option value="60" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  60 min
                </option>
                <option value="90" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  90 min
                </option>
                <option value="120" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  120 min
                </option>
                <option value="custom" className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))]">
                  Custom…
                </option>
              </select>
            </div>
            {breakForm.durationPreset === "custom" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--callendra-text-secondary)]">Minutes</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={breakForm.customMinutes}
                  onChange={(e) => setBreakForm({ ...breakForm, customMinutes: e.target.value })}
                  className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--callendra-text-secondary)]">Label</label>
              <input
                value={breakForm.label}
                onChange={(e) => setBreakForm({ ...breakForm, label: e.target.value })}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              />
            </div>
            {breakError ? <p className="text-red-400 text-sm">{breakError}</p> : null}
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                disabled={breakSaving}
                onClick={() => void saveBreak()}
                className="flex-1 ui-btn-primary py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50"
              >
                {breakSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowBreakModal(false)}
                className="flex-1 border border-[var(--callendra-border)] py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
