"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
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

type ClockPunch = { type: string; timestamp: string };

type ClockScanAction = "checkin" | "checkout" | "break_start" | "break_end";

function clockActionNeedsSelfie(action: ClockScanAction): boolean {
  return action === "checkin" || action === "checkout";
}

type ClockSession = { workOpen: boolean; breakOpen: boolean };

type NextSuggestion = {
  appointmentId: string;
  clientName: string;
  businessName: string;
  currentStartIso: string;
  suggestedStartIso: string;
};

async function safeStopHtml5Qrcode(instance: Html5Qrcode | null) {
  if (!instance) return;
  try {
    await instance.stop();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/not running|not paused|cannot stop/i.test(msg)) {
      console.warn("[staff-day clock]", e);
    }
  }
}

const CLOCK_READER_ID = "staff-day-clock-reader";
const CLOCK_SELFIE_VIDEO_ID = "staff-day-clock-selfie-video";

async function openClockScanner(
  onScan: (decodedText: string) => void
): Promise<Html5Qrcode> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 120));

  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error(
      "Camera requires HTTPS (or localhost only). Opening http://192.168… from your phone is blocked by Safari/Chrome. " +
        "On your Mac run npm run dev:https with mkcert certs in certs/ — see server.js when you start the dev server."
    );
  }

  if (!document.getElementById(CLOCK_READER_ID)) {
    throw new Error("Camera area not ready — tap Check in/out again.");
  }

  const { Html5Qrcode } = await import("html5-qrcode");
  /** Large, responsive scan region helps phones recognize the kiosk QR without a “capture” button (scan is continuous). */
  const scanConfig = {
    fps: 15,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const minDim = Math.min(viewfinderWidth, viewfinderHeight);
      const size = Math.max(200, Math.min(minDim - 24, Math.floor(minDim * 0.9)));
      return { width: size, height: size };
    },
    aspectRatio: 1,
  };
  const noopScanError = () => {};

  /** Prefer rear camera: many phones list the selfie cam first or with empty labels — don't open those before trying facingMode. */
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { exact: "environment" } },
    { facingMode: { ideal: "environment" } },
    { facingMode: "environment" },
  ];

  try {
    const devices = await Html5Qrcode.getCameras();
    const backRe = /back|rear|environment|wide|ultra|tele|trasera|posterior|0\.5x|1x|2x|3x/i;
    const frontRe = /front|user|selfie|facial|face\s*id|true\s*depth|infrared|facetime/i;
    const score = (label: string) => {
      const l = label.trim().toLowerCase();
      if (backRe.test(l)) return 0;
      if (frontRe.test(l)) return 2;
      return 1;
    };
    const sorted = [...devices].sort((a, b) => score(a.label) - score(b.label) || a.id.localeCompare(b.id));
    for (const d of sorted) {
      attempts.push({ deviceId: { exact: d.id } });
    }
  } catch {
    /* enumerate can fail before permission */
  }

  attempts.push({ facingMode: { ideal: "user" } }, { facingMode: "user" });

  let lastErr: unknown = null;
  let h: Html5Qrcode | null = null;

  for (const constraints of attempts) {
    try {
      await safeStopHtml5Qrcode(h);
      h = null;
      h = new Html5Qrcode(CLOCK_READER_ID, /* verbose */ false);
      await h.start(constraints, scanConfig, onScan, noopScanError);
      return h;
    } catch (e) {
      lastErr = e;
      await safeStopHtml5Qrcode(h);
      h = null;
    }
  }

  const raw = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (/not allowed|permission|denied|NotAllowedError/i.test(raw)) {
    throw new Error("Allow camera access for this site in your browser settings, then try again.");
  }
  throw new Error(
    raw ? `Could not open camera: ${raw}` : "Could not open camera — try Safari/Chrome or another device."
  );
}

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

  const [clockMode, setClockMode] = useState<null | ClockScanAction>(null);
  const [clockPhase, setClockPhase] = useState<null | "selfie" | "qr">(null);
  const [selfieCountdown, setSelfieCountdown] = useState<number | null>(null);
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [clockToday, setClockToday] = useState<ClockPunch[]>([]);
  const [clockSessionByBusinessId, setClockSessionByBusinessId] = useState<Record<string, ClockSession>>({});
  const [clockErr, setClockErr] = useState("");
  const clockScannerRef = useRef<Html5Qrcode | null>(null);
  const clockScanBusy = useRef(false);
  const selfieUrlRef = useRef<string | null>(null);

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
    const punches = Array.isArray(data.clockToday)
      ? (data.clockToday as unknown[]).filter(
          (row): row is ClockPunch =>
            row !== null &&
            typeof row === "object" &&
            typeof (row as ClockPunch).type === "string" &&
            typeof (row as ClockPunch).timestamp === "string"
        )
      : [];
    setClockToday(punches);
    const cs = data.clockSessionByBusinessId;
    if (cs && typeof cs === "object" && !Array.isArray(cs)) {
      const next: Record<string, ClockSession> = {};
      for (const [bid, v] of Object.entries(cs as Record<string, unknown>)) {
        if (!v || typeof v !== "object" || Array.isArray(v)) continue;
        const o = v as Record<string, unknown>;
        next[bid] = {
          workOpen: Boolean(o.workOpen),
          breakOpen: Boolean(o.breakOpen),
        };
      }
      setClockSessionByBusinessId(next);
    } else {
      setClockSessionByBusinessId({});
    }
    setLoading(false);
  }, [token]);

  const clockGate = useMemo(() => {
    const ids = Object.keys(clockSessionByBusinessId);
    if (ids.length !== 1) {
      return { single: false as const, workOpen: false, breakOpen: false };
    }
    const id = ids[0]!;
    const s = clockSessionByBusinessId[id] ?? { workOpen: false, breakOpen: false };
    return { single: true as const, workOpen: s.workOpen, breakOpen: s.breakOpen };
  }, [clockSessionByBusinessId]);

  const runClockScanPayload = useCallback(
    async (decodedText: string, mode: ClockScanAction, selfieUrl: string) => {
      let qrToken = decodedText.trim();
      try {
        const o = JSON.parse(decodedText) as { qrToken?: string };
        if (typeof o.qrToken === "string" && o.qrToken.trim()) qrToken = o.qrToken.trim();
      } catch {
        /* plain token */
      }
      const res = await fetch("/api/clock-qr/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrToken, type: mode, selfieUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Scan failed");
      clockScannerRef.current = null;
      selfieUrlRef.current = null;
      setClockMode(null);
      setClockPhase(null);
      await load();
    },
    [token, load]
  );

  const stopClockScanner = useCallback(async () => {
    const s = clockScannerRef.current;
    clockScannerRef.current = null;
    selfieUrlRef.current = null;
    setClockMode(null);
    setClockPhase(null);
    setSelfieCountdown(null);
    setSelfieUploading(false);
    await safeStopHtml5Qrcode(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      void stopClockScanner();
    };
  }, [stopClockScanner]);

  useEffect(() => {
    if (!clockMode || clockPhase !== "qr" || !token) return;
    let cancelled = false;
    const instance: { current: Html5Qrcode | null } = { current: null };
    setClockErr("");
    const mode = clockMode;
    const needsSelfie = clockActionNeedsSelfie(mode);
    const selfieUrl = selfieUrlRef.current;
    if (needsSelfie && !selfieUrl) {
      setClockErr("Selfie missing — start again.");
      setClockMode(null);
      setClockPhase(null);
      return;
    }
    void (async () => {
      try {
        instance.current = await openClockScanner((decodedText) => {
          void (async () => {
            if (cancelled || clockScanBusy.current) return;
            clockScanBusy.current = true;
            try {
              const su = selfieUrlRef.current;
              if (clockActionNeedsSelfie(mode) && !su) throw new Error("Selfie missing — start again.");
              await runClockScanPayload(decodedText, mode, su ?? "");
            } catch (e: unknown) {
              setClockErr(e instanceof Error ? e.message : "Error");
              clockScannerRef.current = null;
              selfieUrlRef.current = null;
              setClockMode(null);
              setClockPhase(null);
            } finally {
              clockScanBusy.current = false;
            }
          })();
        });
        if (cancelled) {
          await safeStopHtml5Qrcode(instance.current);
          instance.current = null;
          return;
        }
        clockScannerRef.current = instance.current;
      } catch (e: unknown) {
        if (!cancelled) {
          setClockErr(e instanceof Error ? e.message : "Could not open camera");
          selfieUrlRef.current = null;
          setClockMode(null);
          setClockPhase(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      clockScannerRef.current = null;
      void safeStopHtml5Qrcode(instance.current);
      instance.current = null;
    };
  }, [clockMode, clockPhase, token, runClockScanPayload]);

  useEffect(() => {
    if (!clockMode || clockPhase !== "selfie" || !token) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const fail = (msg: string) => {
      if (cancelled) return;
      setClockErr(msg);
      selfieUrlRef.current = null;
      setClockMode(null);
      setClockPhase(null);
      setSelfieCountdown(null);
      setSelfieUploading(false);
    };

    void (async () => {
      setClockErr("");
      setSelfieCountdown(null);
      setSelfieUploading(false);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = document.getElementById(CLOCK_SELFIE_VIDEO_ID) as HTMLVideoElement | null;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          fail("Camera preview not ready — try again.");
          return;
        }
        video.playsInline = true;
        video.muted = true;
        video.setAttribute("playsinline", "true");
        video.srcObject = stream;
        await video.play();

        for (let n = 3; n >= 1; n--) {
          if (cancelled) return;
          setSelfieCountdown(n);
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (cancelled) return;
        setSelfieCountdown(0);
        await new Promise((r) => setTimeout(r, 250));
        if (cancelled) return;

        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          video.srcObject = null;
          fail("Camera did not initialize — allow camera and retry.");
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          video.srcObject = null;
          fail("Could not capture image.");
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        video.srcObject = null;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
            "image/jpeg",
            0.88
          );
        });
        if (cancelled) return;

        setSelfieUploading(true);
        setSelfieCountdown(null);
        const fd = new FormData();
        fd.append("file", new File([blob], "selfie.jpg", { type: "image/jpeg" }));
        const up = await fetch("/api/clock-qr/upload-selfie", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = (await up.json()) as { url?: string; error?: string };
        if (cancelled) return;
        if (!up.ok) {
          fail(typeof data.error === "string" ? data.error : "Could not upload selfie");
          return;
        }
        const url = typeof data.url === "string" ? data.url.trim() : "";
        if (!url) {
          fail("Could not upload selfie");
          return;
        }
        selfieUrlRef.current = url;
        setSelfieUploading(false);
        setClockPhase("qr");
      } catch (e: unknown) {
        if (cancelled) return;
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        const video = document.getElementById(CLOCK_SELFIE_VIDEO_ID) as HTMLVideoElement | null;
        if (video) video.srcObject = null;
        const raw = e instanceof Error ? e.message : String(e);
        if (/not allowed|permission|denied|NotAllowedError/i.test(raw)) {
          fail("Allow camera access for this site, then try again.");
        } else {
          fail(raw || "Selfie step failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = document.getElementById(CLOCK_SELFIE_VIDEO_ID) as HTMLVideoElement | null;
      if (video) video.srcObject = null;
    };
  }, [clockMode, clockPhase, token]);

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
        <div className="mt-4 grid w-full min-w-0 grid-cols-2 gap-3 items-start">
          <div className="min-w-0 flex items-center gap-2.5 sm:gap-3 py-0.5 pr-0.5">
            <div className="shrink-0">
              <StaffAvatar name={staffName} photo={staffPhoto} size="display" />
            </div>
            <div className="min-w-0 flex flex-col justify-center gap-1 overflow-hidden">
              <h1 className="text-xl font-bold leading-tight tracking-tight truncate">{staffName}</h1>
              <p className="text-[13px] leading-snug text-[var(--callendra-text-secondary)] break-words">
                Today&apos;s appointments
              </p>
            </div>
          </div>
          <aside className="w-full min-w-0 self-start rounded-xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_5%,var(--callendra-bg))] shadow-[0_1px_0_color-mix(in_srgb,var(--callendra-text-primary)_12%,transparent)] flex flex-col p-1.5 sm:p-2 gap-1">
            <h2 className="text-[10px] font-semibold leading-tight text-[var(--callendra-text-primary)] text-center border-b border-[var(--callendra-border)]/80 pb-1">
              Time Clock
            </h2>
            <div className="min-h-0 shrink-0 overflow-hidden px-0.5">
              {!clockMode && clockToday.length > 0 ? (
                <ul className="max-h-[3.25rem] overflow-y-auto space-y-0 text-left pl-0.5">
                  {clockToday.map((p, i) => {
                    const isLast = i === clockToday.length - 1;
                    const tl = p.type.toLowerCase();
                    const label =
                      tl === "checkout"
                        ? "Out"
                        : tl === "break_start"
                          ? "Break"
                          : tl === "break_end"
                            ? "Resume"
                            : "In";
                    const tStr = new Date(p.timestamp).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    return (
                      <li
                        key={`${p.timestamp}-${i}`}
                        className={`text-[9px] leading-tight tabular-nums ${
                          isLast ? "text-green-400 font-semibold" : "text-[var(--callendra-text-secondary)]"
                        }`}
                      >
                        {label} {tStr}
                        {isLast ? " ✓" : ""}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0 pt-0.5">
              {clockGate.single ? (
                <>
                  <button
                    type="button"
                    title={
                      clockGate.workOpen && clockGate.breakOpen
                        ? "End your break before checking out"
                        : undefined
                    }
                    disabled={!!clockMode || (clockGate.workOpen && clockGate.breakOpen)}
                    onClick={() => {
                      setClockErr("");
                      selfieUrlRef.current = null;
                      setClockMode(clockGate.workOpen ? "checkout" : "checkin");
                      setClockPhase("selfie");
                    }}
                    className="ui-btn-primary w-full px-2 py-1 rounded-md text-[11px] font-semibold disabled:opacity-50 leading-tight"
                  >
                    {clockGate.workOpen ? "Check out" : "Check in"}
                  </button>
                  {clockGate.workOpen ? (
                    <button
                      type="button"
                      title={
                        clockGate.breakOpen
                          ? "You are on a break — tap to end break"
                          : "Lunch or permission — scan the kiosk QR only"
                      }
                      disabled={!!clockMode}
                      onClick={() => {
                        setClockErr("");
                        selfieUrlRef.current = null;
                        setClockMode(clockGate.breakOpen ? "break_end" : "break_start");
                        setClockPhase("qr");
                      }}
                      className="w-full border border-[var(--callendra-border)] px-2 py-1 rounded-md text-[11px] font-medium disabled:opacity-50 leading-tight"
                    >
                      {clockGate.breakOpen ? "End break" : "Start break"}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!!clockMode}
                    onClick={() => {
                      setClockErr("");
                      selfieUrlRef.current = null;
                      setClockMode("checkin");
                      setClockPhase("selfie");
                    }}
                    className="ui-btn-primary w-full px-2 py-1 rounded-md text-[11px] font-semibold disabled:opacity-50 leading-tight"
                  >
                    Check in
                  </button>
                  <button
                    type="button"
                    disabled={!!clockMode}
                    onClick={() => {
                      setClockErr("");
                      selfieUrlRef.current = null;
                      setClockMode("checkout");
                      setClockPhase("selfie");
                    }}
                    className="w-full border border-[var(--callendra-border)] px-2 py-1 rounded-md text-[11px] font-medium disabled:opacity-50 leading-tight"
                  >
                    Check out
                  </button>
                </>
              )}
              {clockMode ? (
                <button
                  type="button"
                  onClick={() => void stopClockScanner()}
                  className="text-[10px] text-[var(--callendra-text-secondary)] underline underline-offset-2 text-center py-0.5"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </aside>
        </div>
        {!clockMode && clockErr ? (
          <p className="text-sm text-red-400 mt-2 text-center">{clockErr}</p>
        ) : null}
        {!clockMode && !clockGate.single && Object.keys(clockSessionByBusinessId).length > 1 ? (
          <p className="text-[10px] text-[var(--callendra-text-secondary)] mt-2 text-center leading-snug px-1">
            You work at more than one location — use the kiosk QR at the shop you&apos;re clocking for. Check in and
            check out must alternate for that location. Start/end break uses the same flow when you are at one assigned
            branch (break controls hide here because state is per location).
          </p>
        ) : null}
      </header>

      {clockMode && clockPhase === "selfie" ? (
        <section className="mb-6 relative rounded-xl overflow-hidden bg-black min-h-[240px] w-full flex items-center justify-center border border-[var(--callendra-border)]">
          <video
            id={CLOCK_SELFIE_VIDEO_ID}
            className="w-full max-h-[min(52vh,360px)] object-cover"
            playsInline
            muted
            autoPlay
          />
          {selfieCountdown !== null && selfieCountdown > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
              <p className="text-5xl font-bold text-white tabular-nums drop-shadow-lg">{selfieCountdown}</p>
            </div>
          ) : null}
          {selfieCountdown === 0 && !selfieUploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
              <span className="text-5xl" aria-hidden>
                📸
              </span>
            </div>
          ) : null}
          {selfieUploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="text-sm font-medium text-white">Uploading…</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {clockMode && clockPhase === "qr" ? (
        <section className="mb-6">
          <p className="text-xs text-[var(--callendra-text-secondary)] mb-2">
            {clockMode === "checkin" && "Point the back camera at the kiosk QR to check in."}
            {clockMode === "checkout" && "Point the back camera at the kiosk QR to check out."}
            {clockMode === "break_start" && "Point the back camera at the kiosk QR to start your break."}
            {clockMode === "break_end" && "Point the back camera at the kiosk QR to end your break."}
          </p>
          <div
            id={CLOCK_READER_ID}
            className="rounded-xl overflow-hidden bg-black/20 min-h-[260px] w-full border border-[var(--callendra-border)]"
          />
        </section>
      ) : null}

      {clockMode && clockErr ? (
        <p className="text-sm text-red-400 mb-4 -mt-2">{clockErr}</p>
      ) : null}

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
