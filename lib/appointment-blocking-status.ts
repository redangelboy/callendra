import type { Prisma } from "@prisma/client";

/** Appointments that still block availability (slots / overlap). */
export const APPOINTMENT_BLOCKING_STATUS_FILTER = {
  status: { in: ["confirmed", "cancel_requested"] },
} satisfies Prisma.AppointmentWhereInput;

/** Shown on day boards (display, staff day, dashboard schedule): hide finished. */
export const APPOINTMENT_ACTIVE_DAY_LIST_FILTER = {
  status: { in: ["confirmed", "cancel_requested"] },
} satisfies Prisma.AppointmentWhereInput;
