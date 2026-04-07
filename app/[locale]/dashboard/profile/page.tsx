"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { bookingPathForBusiness, walkInPathForBusiness } from "@/lib/booking-path";
import { normalizeBrandSlug } from "@/lib/rename-brand-slug";
import {
  CALLENDRA_THEMES,
  type CallendraThemeId,
  DEFAULT_THEME_ID,
  GOLDEN_LUXE_BUTTON_GRADIENT,
  THEME_CATEGORY_OPTIONS,
  THEME_LABELS,
  themesForCategory,
  type ThemeCategoryFilterId,
  isValidThemeId,
} from "@/lib/callendra-themes";

export default function ProfilePage() {
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";

  const [form, setForm] = useState({
    name: "",
    phone: "",
    notificationPhone: "",
    address: "",
    googleMapsPlaceUrl: "",
    logo: "",
    retellPhoneNumber: "",
    themePreset: DEFAULT_THEME_ID as string,
  });
  const [themeCategory, setThemeCategory] = useState<ThemeCategoryFilterId>("all");
  const [showNotificationPhone, setShowNotificationPhone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [isMainBusiness, setIsMainBusiness] = useState(false);
  const [hasLocations, setHasLocations] = useState(false);
  const [bookingPath, setBookingPath] = useState("");
  const [mainLocationLinks, setMainLocationLinks] = useState<{ id: string; name: string; path: string }[]>([]);
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [walkInToken, setWalkInToken] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [displayTokenLoading, setDisplayTokenLoading] = useState(false);
  const [walkInTokenLoading, setWalkInTokenLoading] = useState(false);
  const [displayTokenError, setDisplayTokenError] = useState("");
  const [walkInTokenError, setWalkInTokenError] = useState("");
  const [brandSlugInput, setBrandSlugInput] = useState("");
  const [initialBrandSlug, setInitialBrandSlug] = useState("");
  const [confirmBrandSlug, setConfirmBrandSlug] = useState(false);

  const displayUrl = useMemo(() => {
    if (typeof window === "undefined" || !slug || !displayToken) return "";
    const origin = (process.env.NEXT_PUBLIC_URL || window.location.origin).replace(/\/$/, "");
    return `${origin}/${locale}/display/${encodeURIComponent(slug)}?token=${encodeURIComponent(displayToken)}`;
  }, [slug, displayToken, locale]);

  const walkInUrlsByLocation = useMemo(() => {
    if (!walkInToken || typeof window === "undefined") return [] as { id: string; name: string; url: string }[];
    if (mainLocationLinks.length === 0) return [];
    const origin = (process.env.NEXT_PUBLIC_URL || window.location.origin).replace(/\/$/, "");
    return mainLocationLinks.map((row) => ({
      id: row.id,
      name: row.name,
      url: `${origin}/${locale}${row.path.replace(/^\/book/, "/walk-in")}?token=${encodeURIComponent(walkInToken)}`,
    }));
  }, [mainLocationLinks, walkInToken, locale]);

  const walkInUrl = useMemo(() => {
    if (typeof window === "undefined" || !slug || !walkInToken) return "";
    if (mainLocationLinks.length > 0) return "";
    const origin = (process.env.NEXT_PUBLIC_URL || window.location.origin).replace(/\/$/, "");
    const path = bookingPath
      ? bookingPath.replace(/^\/book/, "/walk-in")
      : `/walk-in/${slug}`;
    return `${origin}/${locale}${path}?token=${encodeURIComponent(walkInToken)}`;
  }, [slug, walkInToken, bookingPath, locale, mainLocationLinks.length]);

  const maskedToken =
    displayToken && displayToken.length > 8
      ? `••••••${displayToken.slice(-8)}`
      : displayToken
        ? "••••••••"
        : null;

  const maskedWalkInToken =
    walkInToken && walkInToken.length > 8
      ? `••••••${walkInToken.slice(-8)}`
      : walkInToken
        ? "••••••••"
        : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("displayToken") === "required") {
      setDisplayTokenError("Generate your display token first (Display screen section below).");
    }
    if (params.get("walkInToken") === "required") {
      setWalkInTokenError("Generate your walk-in token first (Walk-in iPad section below).");
    }
  }, []);

  const loadBusinessProfile = useCallback(async () => {
    const [a, sessionRes] = await Promise.all([fetch("/api/business"), fetch("/api/auth/session")]);
    const sessionData = await sessionRes.json();
    setIsOwner(!!sessionData.ownerId);

    const data = await a.json();
    if (!data.id) return;
    setDisplayToken(typeof data.displayToken === "string" ? data.displayToken : null);
    setWalkInToken(typeof data.walkInToken === "string" ? data.walkInToken : null);

    const hasNotif = "notificationPhone" in data;
    setShowNotificationPhone(hasNotif);
    const tp = data.themePreset;
    setForm({
      name: data.name || "",
      phone: data.phone || "",
      notificationPhone: hasNotif ? data.notificationPhone || "" : "",
      address: data.address || "",
      googleMapsPlaceUrl: data.googleMapsPlaceUrl || "",
      logo: data.logo || "",
      retellPhoneNumber: data.retellPhoneNumber || "",
      themePreset:
        typeof tp === "string" && isValidThemeId(tp) ? tp : DEFAULT_THEME_ID,
    });
    setSlug(data.slug || "");

    const isMain = !!data.isMainBusiness;
    setIsMainBusiness(isMain);

    const canon = (data.parentSlug ?? data.slug ?? "").trim();
    if (isMain) {
      setBrandSlugInput(canon);
      setInitialBrandSlug(canon);
    } else {
      setBrandSlugInput("");
      setInitialBrandSlug("");
    }

    const locRes = await fetch("/api/business/locations");
    const locs = await locRes.json();
    const list = Array.isArray(locs) ? locs : [];
    const locationCount = list.filter((l: any) => l.parentSlug === data.slug).length;
    const hasBranchLocations = locationCount > 0;
    setHasLocations(hasBranchLocations);

    if (!isMain) {
      const countForParent = list.filter(
        (l: any) => (l.parentSlug ?? l.slug) === (data.parentSlug ?? data.slug)
      ).length;
      setMainLocationLinks([]);
      const bp = bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent);
      setBookingPath(bp);
      return;
    }

    const brandLocs = list.filter((l: any) => (l.parentSlug ?? l.slug) === data.slug);
    const countForParent = brandLocs.length;

    if (hasBranchLocations) {
      const linksOnly = brandLocs
        .filter((l: any) => {
          const ls = (l.locationSlug ?? "").trim();
          return ls !== "" && ls !== "main";
        })
        .map((l: any) => {
          const parentSlug = l.parentSlug ?? l.slug;
          const locationSlug = (l.locationSlug ?? "").trim() || "main";
          return {
            id: l.id,
            name: l.name || "Location",
            path: `/book/${parentSlug}/${locationSlug}`,
          };
        });
      setMainLocationLinks(linksOnly);
      if (linksOnly.length === 0) {
        setBookingPath(
          bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent)
        );
      } else {
        setBookingPath("");
      }
    } else {
      setMainLocationLinks([]);
      setBookingPath(
        bookingPathForBusiness(data.parentSlug, data.slug, data.locationSlug, countForParent)
      );
    }
  }, []);

  useEffect(() => {
    void loadBusinessProfile();
  }, [loadBusinessProfile]);

  const themeOptionsInCategory = useMemo(
    () => themesForCategory(themeCategory),
    [themeCategory]
  );

  const activeTheme = useMemo(() => {
    const id = form.themePreset;
    if (typeof id === "string" && isValidThemeId(id)) return CALLENDRA_THEMES[id];
    return CALLENDRA_THEMES[DEFAULT_THEME_ID];
  }, [form.themePreset]);

  const handleThemeCategoryChange = (cat: ThemeCategoryFilterId) => {
    setThemeCategory(cat);
    const allowed = themesForCategory(cat);
    const current = form.themePreset;
    if (typeof current === "string" && isValidThemeId(current) && allowed.includes(current)) {
      return;
    }
    setForm((f) => ({ ...f, themePreset: allowed[0] ?? DEFAULT_THEME_ID }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm((prev) => ({ ...prev, logo: data.url }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRegenerateDisplayToken = async () => {
    setDisplayTokenLoading(true);
    setDisplayTokenError("");
    try {
      const res = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerateDisplayToken" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update token");
      if (typeof data.displayToken === "string") setDisplayToken(data.displayToken);
    } catch (err: unknown) {
      setDisplayTokenError(err instanceof Error ? err.message : "Error");
    } finally {
      setDisplayTokenLoading(false);
    }
  };

  const handleRegenerateWalkInToken = async () => {
    setWalkInTokenLoading(true);
    setWalkInTokenError("");
    try {
      const res = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerateWalkInToken" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update token");
      if (typeof data.walkInToken === "string") setWalkInToken(data.walkInToken);
    } catch (err: unknown) {
      setWalkInTokenError(err instanceof Error ? err.message : "Error");
    } finally {
      setWalkInTokenLoading(false);
    }
  };

  const copyDisplayUrl = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
    } catch {
      setDisplayTokenError("Could not copy to clipboard");
    }
  };

  const copyWalkInUrl = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setWalkInTokenError("Could not copy to clipboard");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const normalizedBrand = normalizeBrandSlug(brandSlugInput);
      const canonicalInitial = normalizeBrandSlug(initialBrandSlug);
      const brandChanged = isOwner && isMainBusiness && normalizedBrand !== canonicalInitial;

      if (brandChanged && !confirmBrandSlug) {
        setError("Check the box to confirm you understand that old booking links, QR codes, and saved URLs will stop working.");
        setLoading(false);
        return;
      }
      if (brandChanged && !normalizedBrand) {
        setError("Brand URL slug cannot be empty.");
        setLoading(false);
        return;
      }

      const body: Record<string, unknown> = { ...form };
      if (brandChanged) {
        body.brandSlug = normalizedBrand;
        body.confirmBrandSlugChange = true;
      }

      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setConfirmBrandSlug(false);
      await loadBusinessProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen">
      <nav className="border-b border-[var(--callendra-border)] px-8 py-4 flex items-center gap-4">
        <a href="/en/dashboard" className="text-[var(--callendra-text-secondary)] hover:opacity-90 transition text-sm">← Dashboard</a>
        <span className="text-[var(--callendra-text-primary)] font-semibold">Business Profile</span>
      </nav>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-2">Business Profile</h1>
        <p className="text-[var(--callendra-text-secondary)] text-sm mb-8">Update your business information.</p>
        <div className="border border-[var(--callendra-border)] rounded-2xl p-5 mb-8">
          {isMainBusiness && hasLocations && mainLocationLinks.length > 0 ? (
            <>
              <div className="mb-4">
                <div className="text-sm font-medium">Your booking links</div>
                <div className="text-xs text-[var(--callendra-text-secondary)] mt-1">Share these with your clients</div>
              </div>
              <ul className="flex flex-col divide-y divide-white/10">
                {mainLocationLinks.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm text-[var(--callendra-text-primary)]">{row.name}</span>
                    <a
                      href={`/en${row.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--callendra-accent)] hover:opacity-80 transition font-mono break-all sm:text-right"
                    >
                      {row.path}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Your booking link</div>
                <div className="text-xs text-[var(--callendra-text-secondary)] mt-1">Share this with your clients</div>
              </div>
              <a
                href={bookingPath ? `/en${bookingPath}` : `/en/book/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--callendra-accent)] hover:opacity-80 transition font-mono break-all sm:text-right"
              >
                {bookingPath || `/book/${slug}`}
              </a>
            </div>
          )}
        </div>

        {isOwner && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-6 flex flex-col gap-4 mb-8">
            <h2 className="font-semibold">Display screen</h2>
            <p className="text-sm text-[var(--callendra-text-secondary)]">
              TV and waiting-room displays use a secret link. Only people with the full URL can open your display.
            </p>
            {displayTokenError && (
              <p className="text-sm text-amber-400/90">{displayTokenError}</p>
            )}
            {!displayToken ? (
              <p className="text-sm text-[var(--callendra-text-secondary)]">No token generated yet.</p>
            ) : (
              <>
                <div>
                  <div className="text-xs text-[var(--callendra-text-secondary)] mb-1">Current token (masked)</div>
                  <div className="font-mono text-sm text-[var(--callendra-text-primary)]">{maskedToken}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--callendra-text-secondary)] mb-1">Full display URL</div>
                  <div className="font-mono text-xs break-all text-[var(--callendra-accent)]">{displayUrl}</div>
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={displayTokenLoading}
                onClick={handleRegenerateDisplayToken}
                className="ui-btn-primary px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {displayTokenLoading ? "Saving…" : displayToken ? "Regenerate token" : "Generate token"}
              </button>
              <button
                type="button"
                disabled={!displayUrl}
                onClick={copyDisplayUrl}
                className="border border-[var(--callendra-border)] px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
              >
                Copy URL
              </button>
            </div>
          </div>
        )}

        {isOwner && (
          <div className="border border-[var(--callendra-border)] rounded-2xl p-6 flex flex-col gap-4 mb-8">
            <h2 className="font-semibold">Walk-in (iPad)</h2>
            <p className="text-sm text-[var(--callendra-text-secondary)]">
              Put this URL on an iPad at your entrance so walk-in clients can book without the public web limits. Only
              people with the full link can open it (separate secret from the display screen).
            </p>
            {walkInTokenError && (
              <p className="text-sm text-amber-400/90">{walkInTokenError}</p>
            )}
            {!walkInToken ? (
              <p className="text-sm text-[var(--callendra-text-secondary)]">No token generated yet.</p>
            ) : (
              <>
                <div>
                  <div className="text-xs text-[var(--callendra-text-secondary)] mb-1">Current token (masked)</div>
                  <div className="font-mono text-sm text-[var(--callendra-text-primary)]">{maskedWalkInToken}</div>
                </div>
                {walkInUrlsByLocation.length > 0 ? (
                  <ul className="flex flex-col gap-4">
                    {walkInUrlsByLocation.map((row) => (
                      <li key={row.id}>
                        <div className="text-xs text-[var(--callendra-text-secondary)] mb-1">{row.name}</div>
                        <div className="font-mono text-xs break-all text-[var(--callendra-accent)]">{row.url}</div>
                      </li>
                    ))}
                  </ul>
                ) : walkInUrl ? (
                  <div>
                    <div className="text-xs text-[var(--callendra-text-secondary)] mb-1">Full walk-in URL</div>
                    <div className="font-mono text-xs break-all text-[var(--callendra-accent)]">{walkInUrl}</div>
                  </div>
                ) : null}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={walkInTokenLoading}
                onClick={handleRegenerateWalkInToken}
                className="ui-btn-primary px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {walkInTokenLoading ? "Saving…" : walkInToken ? "Regenerate token" : "Generate token"}
              </button>
              {walkInUrlsByLocation.length > 0 ? (
                walkInUrlsByLocation.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => copyWalkInUrl(row.url)}
                    className="border border-[var(--callendra-border)] px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
                  >
                    Copy — {row.name}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  disabled={!walkInUrl}
                  onClick={() => copyWalkInUrl(walkInUrl)}
                  className="border border-[var(--callendra-border)] px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
                >
                  Copy URL
                </button>
              )}
            </div>
          </div>
        )}

        <div className="border border-[var(--callendra-border)] rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <h2 className="font-semibold">Logo</h2>
          <div className="flex items-center gap-6">
            {form.logo ? (
              <img src={form.logo} alt="Logo" className="w-20 h-20 rounded-2xl object-contain border border-[var(--callendra-border)]" />
            ) : (
              <div className="w-20 h-20 rounded-2xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] flex items-center justify-center text-[var(--callendra-text-secondary)] opacity-80 text-xs">No logo</div>
            )}
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_14%,transparent)] transition px-4 py-2 rounded-xl text-sm font-medium">
                {uploading ? "Uploading..." : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
              </label>
              <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80">PNG, JPG up to 5MB</p>
            </div>
          </div>
        </div>

        <div className="border border-[var(--callendra-border)] rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <div>
            <h2 className="font-semibold">Tema de colores</h2>
            <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80 mt-1">
              Aplica a la página de reservas y a la pantalla pública (solo colores, no el panel del dashboard).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-sm text-[var(--callendra-text-secondary)]">Filtrar por estilo</label>
              <select
                value={themeCategory}
                onChange={(e) => handleThemeCategoryChange(e.target.value as ThemeCategoryFilterId)}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition text-[var(--callendra-text-primary)]"
              >
                {THEME_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} className="bg-neutral-900">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-sm text-[var(--callendra-text-secondary)]">Tema</label>
              <select
                value={form.themePreset}
                onChange={(e) =>
                  setForm((f) => ({ ...f, themePreset: e.target.value }))
                }
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition text-[var(--callendra-text-primary)]"
              >
                {themeOptionsInCategory.map((id) => (
                  <option key={id} value={id} className="bg-neutral-900">
                    {THEME_LABELS[id].title} — {THEME_LABELS[id].mood}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="rounded-2xl border p-4 sm:p-5 mt-2"
            style={{
              background: activeTheme.background,
              borderColor: activeTheme.border,
            }}
          >
            <div
              className="rounded-xl border p-4 shadow-sm"
              style={{
                background: activeTheme.surface,
                borderColor: activeTheme.border,
                color: activeTheme.textPrimary,
              }}
            >
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: activeTheme.textSecondary }}>
                Vista previa
              </p>
              <h3 className="text-lg font-semibold mt-1">{THEME_LABELS[(form.themePreset as CallendraThemeId) || DEFAULT_THEME_ID].title}</h3>
              <p className="text-sm mt-1" style={{ color: activeTheme.textSecondary }}>
                Texto secundario y descripciones.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {(
                  [
                    ["bg", activeTheme.background],
                    ["surface", activeTheme.surface],
                    ["accent", activeTheme.accent],
                    ["primary", activeTheme.buttonPrimary],
                    ["éxito", activeTheme.success],
                  ] as const
                ).map(([label, hex]) => (
                  <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: activeTheme.textSecondary }}>
                    <span className="w-6 h-6 rounded-md border shrink-0" style={{ background: hex, borderColor: activeTheme.border }} />
                    <span className="uppercase">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                  style={
                    form.themePreset === "goldenLuxe"
                      ? { background: GOLDEN_LUXE_BUTTON_GRADIENT }
                      : { background: activeTheme.buttonPrimary }
                  }
                >
                  Botón principal
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white opacity-90"
                  style={{ background: activeTheme.buttonHover }}
                >
                  Hover
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-[var(--callendra-border)] rounded-2xl p-6 flex flex-col gap-4 mb-8">
          <h2 className="font-semibold">Basic information</h2>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--callendra-text-secondary)]">Business name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--callendra-text-secondary)]">Business phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
          </div>
          {showNotificationPhone && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[var(--callendra-text-secondary)]">Notification phone (optional)</label>
              <input
                type="tel"
                value={form.notificationPhone}
                onChange={(e) => setForm({ ...form, notificationPhone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition"
              />
              <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80">SMS for cancel requests and alerts. Falls back to business phone if empty.</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--callendra-text-secondary)]">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="123 Main St, Dallas TX"
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--callendra-text-secondary)]">Google Maps link (optional)</label>
            <input
              type="url"
              value={form.googleMapsPlaceUrl}
              onChange={(e) => setForm({ ...form, googleMapsPlaceUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/place/..."
              className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition font-mono text-xs"
            />
            <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80">
              Open your business in Google Maps → Share → copy link. Used in booking confirmation email/SMS so clients open the correct place, not a generic search.
            </p>
          </div>
          {isOwner && isMainBusiness && (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_4%,var(--callendra-bg))] p-4">
              <div>
                <label className="text-sm font-medium text-[var(--callendra-text-primary)]">Booking URL (brand slug)</label>
                <p className="text-xs text-[var(--callendra-text-secondary)] mt-1">
                  Middle part of <span className="font-mono">/book/…/your-location</span>. Lowercase letters, numbers, and hyphens only. Changing it updates every location link for this brand.
                </p>
              </div>
              <input
                type="text"
                value={brandSlugInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setBrandSlugInput(v);
                  if (normalizeBrandSlug(v) === normalizeBrandSlug(initialBrandSlug)) {
                    setConfirmBrandSlug(false);
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-[var(--callendra-accent)] transition"
              />
              <p className="text-xs text-[var(--callendra-accent)] font-mono break-all">
                {hasLocations && mainLocationLinks.length > 0
                  ? `Example: /book/${normalizeBrandSlug(brandSlugInput) || "…"}/your-location`
                  : `/book/${normalizeBrandSlug(brandSlugInput) || "…"}`}
              </p>
              {normalizeBrandSlug(brandSlugInput) !== normalizeBrandSlug(initialBrandSlug) && (
                <label className="flex items-start gap-2 cursor-pointer text-sm text-[var(--callendra-text-secondary)]">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-[var(--callendra-border)]"
                    checked={confirmBrandSlug}
                    onChange={(e) => setConfirmBrandSlug(e.target.checked)}
                  />
                  <span>
                    I understand that after saving, old booking links, QR codes, and bookmarks that use the previous URL will no longer work until I share the new ones.
                  </span>
                </label>
              )}
            </div>
          )}
          {(!isMainBusiness || !hasLocations) && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[var(--callendra-text-secondary)]">AI Agent Phone Number</label>
              <input type="tel" value={form.retellPhoneNumber} onChange={(e) => setForm({ ...form, retellPhoneNumber: e.target.value })}
                placeholder="+19453072113"
                className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--callendra-accent)] transition" />
              <p className="text-xs text-[var(--callendra-text-secondary)] opacity-80">Phone number assigned by Retell AI for this location</p>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-[var(--callendra-accent)] text-sm">✓ Saved successfully</p>}
          <button onClick={handleSave} disabled={loading}
            className="ui-btn-primary py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50">
            {loading ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </main>
  );
}
