/** Ordered time-entry types for one staff + business in one calendar day (ascending time). */
export function workBreakStateFromOrderedTypes(entries: { type: string }[]): {
  workOpen: boolean;
  breakOpen: boolean;
} {
  let workOpen = false;
  let breakOpen = false;
  for (const e of entries) {
    const t = (e.type ?? "").toLowerCase();
    if (t === "checkin") {
      workOpen = true;
      breakOpen = false;
    } else if (t === "checkout") {
      workOpen = false;
      breakOpen = false;
    } else if (t === "break_start") {
      breakOpen = true;
    } else if (t === "break_end") {
      breakOpen = false;
    }
  }
  return { workOpen, breakOpen };
}
