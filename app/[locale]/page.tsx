import { useTranslations } from "next-intl";
import { Link } from "../../lib/navigation";

export default function Home() {
  const t = useTranslations();

  return (
    <main className="min-h-screen">

      {/* Nav */}
      <nav className="flex justify-between items-center px-8 py-6 border-b border-[var(--callendra-border)]">
        <span className="text-xl font-bold tracking-tight">Callendra</span>
        <div className="flex items-center gap-4">
          <Link href="/" locale="es" className="text-xs border border-[var(--callendra-border)] px-3 py-1 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,transparent)] transition">
            ES
          </Link>
          <Link href="/" locale="en" className="text-xs border border-[var(--callendra-border)] px-3 py-1 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,transparent)] transition">
            EN
          </Link>
          <a href="/login" className="text-sm text-[var(--callendra-text-secondary)] hover:opacity-90 transition">
            {t("nav.login")}
          </a>
          <a href="/register" className="ui-btn-primary text-sm px-4 py-2 rounded-full transition">
            {t("nav.register")}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-8 py-32 gap-6">
        <span className="text-sm bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] text-[var(--callendra-text-primary)] px-4 py-1 rounded-full">
          {t("hero.badge")}
        </span>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-tight">
          {t("hero.title")}
        </h1>
        <p className="text-[var(--callendra-text-secondary)] text-lg max-w-xl">
          {t("hero.subtitle")}
        </p>
        <div className="flex gap-4 mt-4">
          <a href="/register" className="ui-btn-primary px-6 py-3 rounded-full font-semibold transition">
            {t("hero.cta")}
          </a>
          <a href="#precios" className="border border-[var(--callendra-border)] px-6 py-3 rounded-full hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,transparent)] transition">
            {t("hero.pricing")}
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{t("features.title")}</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {t.raw("features.items").map((f: { icon: string; title: string; desc: string }) => (
            <div key={f.title} className="border border-[var(--callendra-border)] rounded-2xl p-6 hover:border-[var(--callendra-accent)] transition">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-[var(--callendra-text-secondary)] text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="precios" className="px-8 py-20 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{t("pricing.title")}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {t.raw("pricing.plans").map((p: { name: string; price: string; desc: string; features: string[]; highlight?: boolean }) => (
            <div key={p.name} className={`rounded-2xl p-6 border ${p.highlight ? "border-[var(--callendra-accent)] bg-[var(--callendra-surface)] text-[var(--callendra-text-primary)]" : "border-[var(--callendra-border)]"}`}>
              <div className="text-sm mb-1 opacity-60">{p.desc}</div>
              <div className="text-2xl font-bold mb-1">{p.name}</div>
              <div className="text-4xl font-bold mb-6">{p.price}<span className="text-sm font-normal opacity-60">{t("pricing.month")}</span></div>
              <ul className="space-y-2 mb-8">
                {p.features.map((f: string) => (
                  <li key={f} className="text-sm flex gap-2">
                    <span>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/register" className={`block text-center py-2 rounded-full text-sm font-semibold transition ${p.highlight ? "ui-btn-primary" : "border border-[var(--callendra-border)] hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,transparent)]"}`}>
                {t("pricing.cta")}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--callendra-border)] px-8 py-8 text-center text-[var(--callendra-text-secondary)] opacity-80 text-sm">
        {t("footer")}
      </footer>

    </main>
  );
}