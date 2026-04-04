"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const [form, setForm] = useState({
    businessName: "",
    email: "",
    password: "",
    confirmPassword: "",
    ownerName: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error registering");
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-bold tracking-tight">Callendra</a>
          <p className="text-gray-400 text-sm mt-2">Create your account — it's free for 14 days</p>
        </div>

        {/* Card */}
        <div className="border border-white/10 rounded-2xl p-8 flex flex-col gap-4">

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Business name</label>
            <input
              type="text"
              placeholder="Don Juan Barbershop"
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Your name</label>
            <input
              type="text"
              placeholder="John Doe"
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Phone (optional)</label>
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-400">Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 transition"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition disabled:opacity-50 mt-2"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <a href="/login" className="text-white hover:underline">Sign in</a>
          </p>

        </div>
      </div>
    </main>
  );
}