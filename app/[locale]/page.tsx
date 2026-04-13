import { LandingHeader } from "../../components/landing-header";
import { useTranslations } from "next-intl";

type CategoryId = "salon" | "barber" | "nails" | "spa" | "medspa" | "massage";

const CATEGORY_CARDS: { id: CategoryId; src: string }[] = [
  {
    id: "salon",
    src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "barber",
    src: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "nails",
    src: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "spa",
    src: "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "medspa",
    src: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "massage",
    src: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=900&q=80",
  },
];

export default function Home() {
  const t = useTranslations();
  const tc = useTranslations("categoryGrid");

  return (
    <main className="min-h-screen bg-[#030712] text-zinc-100 antialiased [background-image:radial-gradient(ellipse_90%_55%_at_50%_-8%,rgba(37,99,235,0.22),transparent),linear-gradient(180deg,#0a1628_0%,#070d18_45%,#030712_100%)]">
      <LandingHeader />

      {/* Hero — edge-to-edge video; copy bottom-left; left scrim for readability */}
      <section className="relative isolate flex min-h-[78vh] flex-col justify-end overflow-hidden bg-[#030712] sm:min-h-[85vh] md:min-h-[90vh]">
        <video
          className="pointer-events-none absolute inset-0 z-0 h-full w-full min-h-full min-w-full object-cover object-center opacity-[0.82] sm:opacity-[0.86]"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        >
          <source src="/callendra-display.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0a1628]/40 via-[#070d18]/28 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[min(42vh,360px)] bg-gradient-to-b from-transparent via-[#070d18]/80 to-[#070d18]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-full max-w-[min(100%,640px)] bg-gradient-to-r from-[#030712]/88 via-[#030712]/45 to-transparent sm:from-[#030712]/82 sm:via-[#030712]/38"
          aria-hidden
        />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-10 pt-24 text-left sm:px-6 sm:pb-12 sm:pt-28 md:pb-16 md:pt-32 lg:px-8">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white [text-shadow:0_2px_28px_rgba(0,0,0,0.6)] sm:text-5xl md:text-6xl md:leading-[1.08]">
            {t("hero.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-100 [text-shadow:0_1px_18px_rgba(0,0,0,0.55)] md:text-xl">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-start gap-3">
            <a
              href="tel:+19726454982"
              className="rounded-full bg-[#4ade80] px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110"
            >
              {t("hero.cta")}
            </a>
            <a
              href="#pricing"
              className="rounded-full border border-white/25 bg-black/25 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/35 hover:bg-black/35"
            >
              {t("hero.pricing")}
            </a>
          </div>
        </div>
      </section>

      {/* Business types — large rounded image grid */}
      <section id="business-types" className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-24 lg:pt-8">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4ade80]">{tc("eyebrow")}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{tc("title")}</h2>
          <p className="mt-3 text-lg text-zinc-400">{tc("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {CATEGORY_CARDS.map(({ id, src }) => (
            <a
              key={id}
              href="/register"
              className="group relative aspect-[4/5] overflow-hidden rounded-3xl bg-slate-800 shadow-lg ring-1 ring-white/10 transition hover:ring-[#2563eb]/40"
            >
              {/* Native img: avoids next/image remote host config issues (Turbopack / custom server / merged config). */}
              <img
                src={src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />
              <h3 className="absolute bottom-0 left-0 p-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {tc(id)}
              </h3>
              <span
                className="absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-zinc-900 shadow-md transition group-hover:scale-105 md:opacity-0 md:group-hover:opacity-100"
                aria-hidden
              >
                →
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-white/10 bg-black/25 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("features.title")}
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {t.raw("features.items").map((f: { icon: string; title: string; desc: string }) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-sm backdrop-blur-sm transition hover:border-[#4ade80]/35 hover:bg-white/[0.06]"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/10 bg-[#050a14] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t("pricing.title")}
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {t.raw("pricing.plans").map((p: { name: string; price: string; desc: string; features: string[]; highlight?: boolean }) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
                  p.highlight
                    ? "border-[#2563eb]/50 bg-white/[0.06] ring-2 ring-[#2563eb]/25"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{p.desc}</div>
                <div className="mt-1 text-xl font-bold text-white">{p.name}</div>
                <div className="mt-4 text-4xl font-bold tracking-tight text-white">
                  {p.price}
                  <span className="text-sm font-normal text-zinc-500">{t("pricing.month")}</span>
                </div>
                <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm text-zinc-400">
                  {p.features.map((feat: string) => (
                    <li key={feat} className="flex gap-2">
                      <span className="text-[#4ade80]">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a
                  href="/register"
                  className={`mt-8 block rounded-full py-2.5 text-center text-sm font-semibold transition ${
                    p.highlight
                      ? "bg-[#4ade80] text-zinc-950 hover:brightness-110"
                      : "border border-white/20 text-white hover:border-white/30 hover:bg-white/5"
                  }`}
                >
                  {t("pricing.cta")}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black/40 px-4 py-10 text-center text-sm text-zinc-500 sm:px-6">
        {t("footer")}
      </footer>
    </main>
  );
}
