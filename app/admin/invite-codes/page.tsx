"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  code: string;
  email: string | null;
  status: string;
  createdAt: string;
  usedBy: string | null;
  expiresAt: string | null;
  active: boolean;
};

export default function AdminInviteCodesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [genEmail, setGenEmail] = useState("");
  const [genExpiry, setGenExpiry] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/invite-codes", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    setRows(data.codes || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        await load();
      } catch {
        if (!cancelled) setError("Could not load invite codes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenLoading(true);
    try {
      const body: { email?: string; expiresAt?: string } = {};
      if (genEmail.trim()) body.email = genEmail.trim();
      if (genExpiry.trim()) body.expiresAt = new Date(genExpiry).toISOString();
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Could not create code");
      setModalOpen(false);
      setGenEmail("");
      setGenExpiry("");
      await load();
    } catch {
      setError("Could not generate code");
    } finally {
      setGenLoading(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this code? It cannot be used for new signups.")) return;
    const res = await fetch("/api/admin/invite-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, active: false }),
    });
    if (!res.ok) {
      setError("Could not update code");
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">Invite codes</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
        >
          Generate code
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Used by</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-zinc-900/40">
                  <td className="px-4 py-3 font-mono text-zinc-200">{r.code}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.status === "active"
                          ? "text-emerald-400"
                          : r.status === "used"
                            ? "text-zinc-500"
                            : "text-amber-400"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{r.usedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "active" && (
                      <button
                        type="button"
                        onClick={() => void deactivate(r.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">Generate invite code</h2>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Email (optional — sends invite)</label>
                <input
                  type="email"
                  value={genEmail}
                  onChange={(e) => setGenEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                  placeholder="owner@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Expires at (optional)</label>
                <input
                  type="datetime-local"
                  value={genExpiry}
                  onChange={(e) => setGenExpiry(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={genLoading}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  {genLoading ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
