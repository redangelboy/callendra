"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/admin" className="text-lg font-semibold tracking-tight text-white">
            Callendra Admin
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/admin" className="text-zinc-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link href="/admin/invite-codes" className="text-zinc-400 hover:text-white transition">
              Invite codes
            </Link>
            <Link href="/admin/businesses" className="text-zinc-400 hover:text-white transition">
              Businesses
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-zinc-500 hover:text-zinc-300 transition"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
