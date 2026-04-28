"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";

const shell =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[var(--callendra-bg)] px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]";

type ServiceRow = { id: string; name: string; duration: number; price: number };
type QueueRow = { id: string; clientName: string; serviceName: string; waitMinutes: number };

function WalkInGate() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const slugParam = Array.isArray(params?.slug) ? params.slug : [];
  const parentSlug = slugParam[0] ?? "";
  const locationSlug = slugParam[1] ?? "";
  const bookingHref = `/${locale}/book/${[parentSlug, locationSlug].filter(Boolean).join("/")}`;
  const token = searchParams.get("token")?.trim() ?? "";
  const [step, setStep] = useState<"home" | "queue" | "service" | "form" | "done">("home");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const queueQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (parentSlug) qs.set("parentSlug", parentSlug);
    if (locationSlug) qs.set("locationSegment", locationSlug);
    if (!parentSlug && locationSlug) qs.set("locationSlug", locationSlug);
    qs.set("walkInToken", token);
    return qs.toString();
  }, [parentSlug, locationSlug, token]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setError("");
      const qs = new URLSearchParams();
      if (parentSlug) qs.set("parentSlug", parentSlug);
      if (locationSlug) qs.set("locationSlug", locationSlug);
      if (!parentSlug && locationSlug) qs.set("slug", locationSlug);
      qs.set("token", token);
      const res = await fetch(`/api/book?${qs.toString()}`);
      if (!res.ok) {
        setError("Could not load services right now.");
        return;
      }
      const data = await res.json();
      const rows = Array.isArray(data.services) ? data.services : [];
      setServices(
        rows.map((s: any) => ({
          id: String(s.id),
          name: String(s.name ?? "Service"),
          duration: Number(s.duration ?? 30),
          price: Number(s.price ?? 0),
        }))
      );
    };
    void load();
  }, [parentSlug, locationSlug, token]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const loadQueue = async () => {
      const res = await fetch(`/api/walkin-queue?${queueQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data.queue) ? data.queue : [];
      if (!mounted) return;
      setQueueRows(
        rows.map((r: any) => ({
          id: String(r.id),
          clientName: String(r.clientName ?? "Client"),
          serviceName: String(r.serviceName ?? "Service"),
          waitMinutes: Number(r.waitMinutes ?? 0),
        }))
      );
    };
    void loadQueue();
    const t = setInterval(() => {
      void loadQueue();
    }, 15_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [token, queueQuery]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const joinQueue = async () => {
    if (!selectedServiceId || !clientName.trim()) return;
    if (!clientEmail.trim() && !clientPhone.trim()) {
      setError("Please provide email or phone.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/walkin-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationSlug: locationSlug || parentSlug,
          parentSlug: parentSlug || undefined,
          locationSegment: locationSlug || undefined,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          clientPhone: clientPhone.trim() || undefined,
          serviceId: selectedServiceId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not join waiting list");
      setPosition(typeof data.position === "number" ? data.position : null);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join waiting list");
    } finally {
      setLoading(false);
    }
  };

  return (
    !token ? (
      <div className={shell}>
        <div className="max-w-md text-center">
          <p className="mb-3 text-4xl" aria-hidden>
            🔗
          </p>
          <h1 className="mb-2 text-lg font-semibold text-[var(--callendra-text-primary)]">Missing walk-in link</h1>
          <p className="text-sm text-[var(--callendra-text-secondary)]">
            This page needs the full URL from your business (including the secret token). Ask the staff for the iPad link
            or open it from the dashboard.
          </p>
        </div>
      </div>
    ) : (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col px-3 py-3 sm:px-6 sm:py-5">
        {step === "home" && (
          <div className="grid h-full grid-rows-[auto_1fr] gap-3">
            <div className="text-center">
              <h1 className="text-2xl font-bold sm:text-4xl">Welcome</h1>
              <p className="mt-1 text-sm text-[var(--callendra-text-secondary)] sm:text-base">
                Choose how you want to continue
              </p>
            </div>
            <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href={bookingHref}
                className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_7%,var(--callendra-bg))] p-5 text-center"
              >
                <Image src="/callendra-logo.png" alt="Callendra" width={72} height={72} className="h-16 w-16 object-contain" />
                <h2 className="mt-3 text-2xl font-semibold">Book Appointment</h2>
                <p className="mt-2 text-sm text-[var(--callendra-text-secondary)]">Choose your exact date and time</p>
              </Link>
              <button
                type="button"
                onClick={() => setStep("queue")}
                className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-accent)_14%,var(--callendra-bg))] p-5 text-center"
              >
                <Image
                  src="/waiting-list-icon.png"
                  alt="Waiting list"
                  width={72}
                  height={72}
                  className="h-16 w-16 scale-125 object-contain mix-blend-screen"
                />
                <h2 className="mt-3 text-2xl font-semibold">Join Waiting List</h2>
                <p className="mt-2 text-sm text-[var(--callendra-text-secondary)]">
                  {queueRows.length} waiting · Get the next available barber
                </p>
              </button>
            </div>
          </div>
        )}

        {step === "queue" && (
          <div className="grid h-full grid-rows-[auto_1fr_auto] gap-3">
            <div className="text-center">
              <h2 className="text-xl font-bold sm:text-3xl">Waiting list ({queueRows.length})</h2>
              <p className="mt-1 text-xs text-[var(--callendra-text-secondary)]">
                Live updates every 15 seconds
              </p>
            </div>
            <div className="space-y-2 overflow-y-auto">
              {queueRows.length === 0 ? (
                <div className="rounded-xl border border-[var(--callendra-border)] p-4 text-center text-sm text-[var(--callendra-text-secondary)]">
                  No one waiting right now.
                </div>
              ) : (
                queueRows.map((q, i) => (
                  <div key={q.id} className="rounded-xl border border-[var(--callendra-border)] p-3">
                    <p className="text-sm font-semibold">
                      #{i + 1} {q.clientName}
                    </p>
                    <p className="text-xs text-[var(--callendra-text-secondary)]">{q.serviceName}</p>
                    <p className="text-xs text-[var(--callendra-text-secondary)]">Waiting {q.waitMinutes} min</p>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep("home")}
                className="rounded-lg border border-[var(--callendra-border)] py-3 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("service")}
                className="ui-btn-primary rounded-lg py-3 text-sm font-semibold"
              >
                Register now
              </button>
            </div>
          </div>
        )}

        {step === "service" && (
          <div className="grid h-full grid-rows-[auto_1fr_auto] gap-3">
            <div className="text-center">
              <h2 className="text-xl font-bold sm:text-3xl">Choose service</h2>
            </div>
            <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedServiceId(s.id)}
                  className={`rounded-xl border p-2 text-left ${
                    selectedServiceId === s.id
                      ? "border-[var(--callendra-accent)] bg-[color-mix(in_srgb,var(--callendra-accent)_18%,var(--callendra-bg))]"
                      : "border-[var(--callendra-border)]"
                  }`}
                >
                  <p className="line-clamp-2 text-sm font-semibold">{s.name}</p>
                  <p className="mt-1 text-xs text-[var(--callendra-text-secondary)]">
                    {s.duration} min · ${s.price.toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep("home")} className="rounded-lg border border-[var(--callendra-border)] py-3 text-sm font-medium">
                Back
              </button>
              <button
                type="button"
                disabled={!selectedServiceId}
                onClick={() => setStep("form")}
                className="ui-btn-primary rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="grid h-full grid-rows-[auto_1fr_auto] gap-3">
            <div className="text-center">
              <h2 className="text-xl font-bold sm:text-3xl">Your details</h2>
              {selectedService ? (
                <p className="mt-1 text-xs text-[var(--callendra-text-secondary)]">Service: {selectedService.name}</p>
              ) : null}
            </div>
            <div className="grid content-start gap-2">
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Name *"
                className="h-12 rounded-lg border border-[var(--callendra-border)] bg-transparent px-3 text-base outline-none"
              />
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Email (optional)"
                className="h-12 rounded-lg border border-[var(--callendra-border)] bg-transparent px-3 text-base outline-none"
              />
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="h-12 rounded-lg border border-[var(--callendra-border)] bg-transparent px-3 text-base outline-none"
              />
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep("service")} className="rounded-lg border border-[var(--callendra-border)] py-3 text-sm font-medium">
                Back
              </button>
              <button
                type="button"
                onClick={() => void joinQueue()}
                disabled={loading || !clientName.trim() || !selectedServiceId}
                className="ui-btn-primary rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Joining..." : "Join Waiting List"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-5xl">✅</p>
            <h2 className="mt-3 text-2xl font-bold">You&apos;re on the list!</h2>
            <p className="mt-2 text-sm text-[var(--callendra-text-secondary)]">We&apos;ll be with you shortly.</p>
            {position != null ? <p className="mt-3 text-lg font-semibold">You are #{position} in line</p> : null}
            <button
              type="button"
              onClick={() => {
                setStep("home");
                setSelectedServiceId("");
                setClientName("");
                setClientEmail("");
                setClientPhone("");
                setPosition(null);
              }}
              className="mt-6 rounded-lg border border-[var(--callendra-border)] px-6 py-3 text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
    )
  );
}

export default function WalkInPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-[100dvh] max-h-[100dvh] items-center justify-center bg-[var(--callendra-bg)]">
            <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
          </div>
        }
      >
        <WalkInGate />
      </Suspense>
    </div>
  );
}
