import { useTranslations } from "next-intl";
import { Link } from "../../lib/navigation";

export default function Home() {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="flex justify-between items-center px-8 py-6 border-b border-white/10">
        <span className="text-xl font-bold tracking-tight">Callendra</span>
        <div className="flex items-center gap-4">
          <Link href="/" locale="es" className="text-xs border border-white/20 px-3 py-1 rounded-full hover:bg-white/10 transition">
            ES
          </Link>
          <Link href="/" locale="en" className="text-xs border border-white/20 px-3 py-1 rounded-full hover:bg-white/10 transition">
            EN
          </Link>
          <a href="/login" className="text-sm text-gray-400 hover:text-white transition">
            {t("nav.login")}
          </a>
          <a href="/register" className="text-sm bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 transition">
            {t("nav.register")}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-8 py-32 gap-6">
        <span className="text-sm bg-white/10 text-white px-4 py-1 rounded-full">
          {t("hero.badge")}
        </span>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-tight">
          {t("hero.title")}
        </h1>
        <p className="text-gray-400 text-lg max-w-xl">
          {t("hero.subtitle")}
        </p>
        <div className="flex gap-4 mt-4">
          <a href="/register" className="bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-gray-200 transition">
            {t("hero.cta")}
          </a>
          <a href="#precios" className="border border-white/20 px-6 py-3 rounded-full hover:bg-white/10 transition">
            {t("hero.pricing")}
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{t("features.title")}</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {t.raw("features.items").map((f: { icon: string; title: string; desc: string }) => (
            <div key={f.title} className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="precios" className="px-8 py-20 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">{t("pricing.title")}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {t.raw("pricing.plans").map((p: { name: string; price: string; desc: string; features: string[]; highlight?: boolean }) => (
            <div key={p.name} className={`rounded-2xl p-6 border ${p.highlight ? "border-white bg-white text-black" : "border-white/10"}`}>
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
              <a href="/register" className={`block text-center py-2 rounded-full text-sm font-semibold transition ${p.highlight ? "bg-black text-white hover:bg-gray-800" : "border border-white/20 hover:bg-white/10"}`}>
                {t("pricing.cta")}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-8 text-center text-gray-600 text-sm">
        {t("footer")}
      </footer>

    </main>
  );
}