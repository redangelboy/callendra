/** Total block length in minutes: primary service + all extras. */
export function appointmentTotalDurationMin(apt: {
  service?: { duration?: number | null } | null;
  extras?: { extraDurationMin: number }[] | null;
}): number {
  const base = apt.service?.duration ?? 30;
  const add = (apt.extras ?? []).reduce((s, e) => s + e.extraDurationMin, 0);
  return base + add;
}

/** End instant (ms) of the appointment block from its start `date`. */
export function appointmentEndMs(
  start: Date,
  apt: {
    service?: { duration?: number | null } | null;
    extras?: { extraDurationMin: number }[] | null;
  }
): number {
  return start.getTime() + appointmentTotalDurationMin(apt) * 60_000;
}
