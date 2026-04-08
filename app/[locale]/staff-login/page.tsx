"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/staff-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.message || data.error || "Invalid credentials");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--callendra-bg)] flex items-center justify-center p-4">
      <div className="bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] border border-[var(--callendra-border)] rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--callendra-text-primary)]">Staff Login</h1>
          <p className="text-[var(--callendra-text-secondary)] text-sm mt-1">Callendra</p>
        </div>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full ui-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full ui-input"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full ui-btn-primary font-semibold rounded-lg py-3 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Sign In"}
          </button>
        </div>
        <p className="text-center text-[var(--callendra-text-secondary)] opacity-80 text-xs mt-6">
          Are you the owner?{" "}
          <a href="/login" className="text-[var(--callendra-accent)] hover:underline">
            Login here
          </a>
        </p>
      </div>
    </div>
  );
}
