/** Calendar day key for StaffBreak.date (UTC midnight of YYYY-MM-DD). */
export function staffBreakDateFromYmd(ymd: string): Date {
  return new Date(`${ymd.trim()}T00:00:00.000Z`);
}
