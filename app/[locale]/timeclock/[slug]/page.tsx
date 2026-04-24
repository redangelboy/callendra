"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

/** Must match server `expiresAt` in GET /api/clock-qr (seconds until refresh). */
const KIOSK_QR_TTL_SECONDS = 10;

function TimeClockKioskInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const businessId = typeof params?.slug === "string" ? params.slug : "";
  const kioskSecret = searchParams.get("token")?.trim() ?? "";

  const [business, setBusiness] = useState<{ name: string; location: string | null } | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(KIOSK_QR_TTL_SECONDS);
  const [error, setError] = useState("");
  const [authHint, setAuthHint] = useState(false);

  const fetchQr = useCallback(async () => {
    if (!businessId) return;
    const qs = new URLSearchParams({ businessId });
    if (kioskSecret) qs.set("token", kioskSecret);
    const res = await fetch(`/api/clock-qr?${qs.toString()}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setAuthHint(true);
        throw new Error(data.error || "Unauthorized");
      }
      throw new Error(typeof data.error === "string" ? data.error : "Could not load QR");
    }
    setAuthHint(false);
    setQrToken(data.token);
    setCountdown(KIOSK_QR_TTL_SECONDS);
  }, [businessId, kioskSecret]);

  useEffect(() => {
    if (!businessId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/timeclock/business?businessId=${encodeURIComponent(businessId)}`);
        const data = await res.json();
        if (res.ok && data?.id) {
          setBusiness({ name: data.name, location: data.location });
        }
      } catch {
        /* optional */
      }
    })();
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    setError("");
    void fetchQr().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Error");
    });
  }, [businessId, fetchQr]);

  useEffect(() => {
    if (!businessId || authHint) return;
    const t = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          void fetchQr().catch((e: unknown) => {
            setError(e instanceof Error ? e.message : "Error");
          });
          return KIOSK_QR_TTL_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [businessId, fetchQr, authHint]);

  const qrValue =
    qrToken && businessId ? JSON.stringify({ qrToken, businessId }) : "";

  return (
    <main className="min-h-[100dvh] bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md border border-[var(--callendra-border)] rounded-3xl p-8 bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] text-center">
        <h1 className="text-2xl md:text-3xl font-bold">Time Clock</h1>
        <p className="text-[var(--callendra-text-secondary)] mt-2 text-sm">
          {business?.name || "Callendra"}
          {business?.location ? ` · ${business.location}` : ""}
        </p>
        <p className="text-[var(--callendra-text-secondary)] text-xs mt-3 leading-snug">
          Scan with your staff-day link on your phone. The code refreshes every {KIOSK_QR_TTL_SECONDS} seconds — scan
          right after tapping Check in or Check out.
        </p>

        {authHint ? (
          <p className="text-amber-400/90 text-sm mt-6">
            Add the display token to the URL (?token=…) from the dashboard kiosk link, or open this page while signed in as owner/admin.
          </p>
        ) : null}

        {error ? <p className="text-red-400 text-sm mt-4">{error}</p> : null}

        {!authHint && qrValue ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-white p-4 inline-block">
              <QRCodeSVG value={qrValue} size={220} level="M" />
            </div>
            <p className="text-3xl font-mono font-bold text-[var(--callendra-accent)] tabular-nums">{countdown}</p>
            <p className="text-xs text-[var(--callendra-text-secondary)]">New code in {countdown}s</p>
          </div>
        ) : !authHint && !error ? (
          <p className="text-[var(--callendra-text-secondary)] text-sm mt-8">Loading QR…</p>
        ) : null}
      </div>
    </main>
  );
}

export default function TimeClockKioskPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)] flex items-center justify-center">
          <p className="text-sm animate-pulse">Loading…</p>
        </main>
      }
    >
      <TimeClockKioskInner />
    </Suspense>
  );
}
