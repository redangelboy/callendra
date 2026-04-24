/** Raw punches for one staff on one business day (ascending timestamp). */
export type TimeclockReportEntry = { type: string; timestamp: string };

export type BreakSpanMs = { startMs: number; endMs: number | null };

type PairLike = { checkIn: string; checkOut: string | null };

function tsMs(iso: string): number {
  return new Date(iso).getTime();
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Punches between this block's check-in and its check-out, or before the next block's check-in if still open. */
export function entryInWorkBlockWindow(
  pair: PairLike,
  nextPair: PairLike | undefined,
  entryMs: number
): boolean {
  const t0 = tsMs(pair.checkIn);
  if (entryMs < t0) return false;
  if (pair.checkOut) return entryMs <= tsMs(pair.checkOut);
  if (nextPair) return entryMs < tsMs(nextPair.checkIn);
  return true;
}

/** Ordered break intervals inside the work block window (end null = break still open). */
export function breakSpansForWorkBlock(
  pair: PairLike,
  nextPair: PairLike | undefined,
  orderedEntries: TimeclockReportEntry[]
): BreakSpanMs[] {
  const spans: BreakSpanMs[] = [];
  let openStart: number | null = null;

  for (const e of orderedEntries) {
    const kind = (e.type ?? "").toLowerCase();
    if (kind !== "break_start" && kind !== "break_end") continue;
    const ms = tsMs(e.timestamp);
    if (!entryInWorkBlockWindow(pair, nextPair, ms)) continue;

    if (kind === "break_start") {
      if (openStart != null) {
        spans.push({ startMs: openStart, endMs: null });
      }
      openStart = ms;
    } else {
      if (openStart != null) {
        spans.push({ startMs: openStart, endMs: ms });
        openStart = null;
      }
    }
  }
  if (openStart != null) {
    spans.push({ startMs: openStart, endMs: null });
  }
  return spans;
}

/**
 * For a closed work block: positions of break overlays on a 0–100% bar (check-in → check-out).
 * Open-ended breaks use check-out as the visual end when `blockEndMs` is provided.
 */
export function breakOverlayPercents(
  blockStartMs: number,
  blockEndMs: number,
  breakSpans: BreakSpanMs[]
): { left: number; width: number }[] {
  const total = blockEndMs - blockStartMs;
  if (total <= 0) return [];

  return breakSpans
    .map((s) => {
      const endMs = s.endMs != null ? s.endMs : blockEndMs;
      const start = Math.max(s.startMs, blockStartMs);
      const end = Math.min(endMs, blockEndMs);
      if (end <= start) return null;
      const left = clampPct(((start - blockStartMs) / total) * 100);
      const width = clampPct(((end - blockStartMs) / total) * 100) - left;
      return width > 0 ? { left, width } : null;
    })
    .filter((x): x is { left: number; width: number } => x != null);
}
