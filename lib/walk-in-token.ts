import { timingSafeEqual } from "node:crypto";

/** Constant-time compare for walk-in kiosk secrets. */
export function walkInTokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const s = String(a).trim();
  const t = String(b).trim();
  if (!s || !t) return false;
  try {
    const ab = Buffer.from(s, "utf8");
    const bb = Buffer.from(t, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
