"use client";
import { useState } from "react";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<any[]>([]);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid credentials");
      if (data.requireBusinessSelect) {
        setBusinesses(data.businesses);
      } else {
        window.location.href = "/en/dashboard";
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBusiness = async (businessId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, businessId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = "/en/dashboard";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (businesses.length > 0) return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-bold tracking-tight">Reservify</a>
          <p className="text-gray-400 text-sm mt-2">Select a location</p>
        </div>
        <div className="flex flex-col gap-3">
          {businesses.map((b) => (
            <button key={b.id} onClick={() => handleSelectBusiness(b.id)}
              className="border border-white/10 rounded-2xl px-6 py-4 text-left hover:border-white/30 transition">
              <div className="font-semibold">{b.name}</div>
              <div className="text-sm text-gray-400 mt-1">{b.slug}</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-bold tracking-tight">Reservify</a>
          <p className="text-gray-400 text-sm mt-2">Sign in to your account</p>
        </div>
        <div className="border border-white/10 rounded-2xl p-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Email</label>
            <input type="email" placeholder="you@example.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Password</label>
            <input type="password" placeholder="••••••••" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition" />
          </div>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          <button onClick={handleSubmit} disabled={loading}
            className="bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition disabled:opacity-50 mt-2">
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{" "}
            <a href="/en/register" className="text-white hover:underline">Get started</a>
          </p>
        </div>
      </div>
    </main>
  );
}
