"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "../lib/navigation";

export function LandingHeader() {
  const t = useTranslations();
  const tn = useTranslations("landingNav");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-white/[0.07] transition-[padding,box-shadow] duration-300 ease-out ${
        compact
          ? "bg-slate-950/85 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.65)] shadow-black/40 backdrop-blur-xl"
          : "bg-gradient-to-b from-[#0a1628]/95 via-slate-950/88 to-slate-950/55 shadow-[0_1px_0_rgba(37,99,235,0.12)] backdrop-blur-2xl"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#2563eb]/55 to-transparent"
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-x-0 -bottom-8 h-8 bg-gradient-to-b from-[#2563eb]/12 to-transparent blur-md ${
          compact ? "opacity-40" : "opacity-100"
        } transition-opacity duration-300`}
        aria-hidden
      />
      <div
        className={`relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 ${
          compact ? "py-2.5" : "py-4 sm:py-5"
        } transition-[padding] duration-300 ease-out`}
      >
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/callendra-logo.png"
            alt="Callendra"
            width={320}
            height={80}
            className={`w-auto object-contain object-left transition-[height,max-width] duration-300 ease-out ${
              compact
                ? "h-9 max-w-[min(200px,48vw)]"
                : "h-12 max-w-[min(280px,62vw)] sm:h-14 sm:max-w-[min(300px,55vw)] md:h-[3.75rem] md:max-w-[min(320px,50vw)]"
            }`}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex" aria-label="Primary">
          <a href="#business-types" className="transition hover:text-white">
            {tn("businessTypes")}
          </a>
          <a href="#features" className="transition hover:text-white">
            {tn("features")}
          </a>
          <a href="#pricing" className="transition hover:text-white">
            {tn("pricing")}
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            locale="es"
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/10"
          >
            ES
          </Link>
          <Link
            href="/"
            locale="en"
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/10"
          >
            EN
          </Link>
          <a href="/login" className="hidden text-sm font-medium text-zinc-300 transition hover:text-white sm:inline">
            {t("nav.login")}
          </a>
          <a
            href="/register"
            className="hidden rounded-full bg-[#4ade80] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm transition hover:brightness-110 sm:inline"
          >
            {t("nav.register")}
          </a>

          <details className="relative md:hidden">
            <summary className="list-none cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 [&::-webkit-details-marker]:hidden">
              {tn("menu")}
            </summary>
            <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 py-1 text-sm shadow-xl backdrop-blur-md">
              <a href="#business-types" className="block px-4 py-2.5 text-zinc-200 hover:bg-white/10">
                {tn("businessTypes")}
              </a>
              <a href="#features" className="block px-4 py-2.5 text-zinc-200 hover:bg-white/10">
                {tn("features")}
              </a>
              <a href="#pricing" className="block px-4 py-2.5 text-zinc-200 hover:bg-white/10">
                {tn("pricing")}
              </a>
              <hr className="border-white/10" />
              <a href="/login" className="block px-4 py-2.5 text-zinc-200 hover:bg-white/10">
                {t("nav.login")}
              </a>
              <a href="/register" className="block px-4 py-2.5 font-semibold text-[#4ade80] hover:bg-white/10">
                {t("nav.register")}
              </a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
