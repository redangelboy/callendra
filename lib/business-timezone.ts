import { DateTime } from "luxon";

/**
 * US Central Time (CST in winter, CDT in summer).
 * Set NEXT_PUBLIC_BUSINESS_TIMEZONE or BUSINESS_TIMEZONE to override (IANA name).
 */
export const BUSINESS_TIMEZONE =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || process.env.BUSINESS_TIMEZONE)) ||
  "America/Chicago";

/** JS weekday 0=Sun..6=Sat for the calendar YYYY-MM-DD in business timezone. */
export function parseYmdToJsDayOfWeek(ymd: string): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return 0;
  const dt = DateTime.fromObject({ year: y, month: mo, day: d }, { zone: BUSINESS_TIMEZONE }).startOf("day");
  if (!dt.isValid) return 0;
  const w = dt.weekday;
  return w === 7 ? 0 : w;
}

/** UTC instant for wall-clock HH:mm on YYYY-MM-DD in business timezone. */
export function utcFromYmdAndTime(ymd: string, hhmm: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  if ([y, mo, d, h, m].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid date/time: ${ymd} ${hhmm}`);
  }
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: m, second: 0, millisecond: 0 },
    { zone: BUSINESS_TIMEZONE }
  );
  if (!dt.isValid) throw new Error(`Invalid zoned datetime: ${ymd} ${hhmm}`);
  return dt.toJSDate();
}

/** Start/end of that calendar day in business timezone, as UTC Date for DB queries. */
export function businessDayUtcRange(ymd: string): { start: Date; end: Date } {
  const [y, mo, d] = ymd.split("-").map(Number);
  const start = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: 0, minute: 0, second: 0, millisecond: 0 },
    { zone: BUSINESS_TIMEZONE }
  ).startOf("day");
  const end = start.endOf("day");
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** 12-hour label for a wall-clock "HH:mm" string in business timezone (e.g. "1:00 pm"). */
export function formatHhmmForDisplay(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const min = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(min)) return hhmm;
  const dt = DateTime.fromObject(
    { year: 2000, month: 1, day: 1, hour: h, minute: min },
    { zone: BUSINESS_TIMEZONE }
  );
  if (!dt.isValid) return hhmm;
  return dt.toFormat("h:mm a").toLowerCase();
}

/** Same instant as JS Date / ISO string, shown as wall clock in business timezone (e.g. appointment start). */
export function formatInstantInBusinessTz(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dt = DateTime.fromJSDate(d).setZone(BUSINESS_TIMEZONE);
  if (!dt.isValid) return "";
  return dt.toFormat("h:mm a").toLowerCase();
}

export function formatInstantInBusinessTzWithSeconds(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dt = DateTime.fromJSDate(d).setZone(BUSINESS_TIMEZONE);
  if (!dt.isValid) return "";
  return dt.toFormat("h:mm:ss a").toLowerCase();
}

/** Wall-clock HH:mm in business timezone (for `<input type="time" value=…>`). */
export function instantToHhmmInBusinessTz(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return DateTime.fromJSDate(d).setZone(BUSINESS_TIMEZONE).toFormat("HH:mm");
}
