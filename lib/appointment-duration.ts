type AppointmentDurationInput = {
  serviceDurationMin?: number | null;
  service?: { duration?: number | null } | null;
  extras?: { extraDurationMin: number }[] | null;
};

function primaryServiceDurationMin(apt: AppointmentDurationInput): number {
  const snap = apt.serviceDurationMin;
  if (snap != null && Number.isFinite(snap) && snap > 0) return Math.floor(snap);
  const cat = apt.service?.duration;
  if (cat != null && Number.isFinite(cat) && cat > 0) return Math.floor(cat);
  return 30;
}

/** Total block length in minutes: primary service + all extras. */
export function appointmentTotalDurationMin(apt: AppointmentDurationInput): number {
  const base = primaryServiceDurationMin(apt);
  const add = (apt.extras ?? []).reduce((s, e) => s + e.extraDurationMin, 0);
  return base + add;
}

/** End instant (ms) of the appointment block from its start `date`. */
export function appointmentEndMs(start: Date, apt: AppointmentDurationInput): number {
  return start.getTime() + appointmentTotalDurationMin(apt) * 60_000;
}
