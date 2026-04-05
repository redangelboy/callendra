import { PrismaClient } from "@prisma/client";

/**
 * Detecta si ya existe una cita (no cancelada) del mismo staff que se solape
 * con [start, end). Usa ventana amplia en DB y refina con duración del servicio.
 */
export async function findStaffOverlappingAppointment(
  prisma: PrismaClient,
  params: {
    staffId: string;
    start: Date;
    end: Date;
    excludeAppointmentId?: string;
  }
) {
  const { staffId, start, end, excludeAppointmentId } = params;

  const candidates = await prisma.appointment.findMany({
    where: {
      staffId,
      status: { not: "cancelled" },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      date: {
        gte: new Date(start.getTime() - 36 * 60 * 60 * 1000),
        lte: new Date(end.getTime() + 36 * 60 * 60 * 1000),
      },
    },
    include: { service: true },
  });

  const s0 = start.getTime();
  const e0 = end.getTime();

  for (const apt of candidates) {
    const durMin = apt.service?.duration ?? 30;
    const aptStart = apt.date.getTime();
    const aptEnd = aptStart + durMin * 60_000;
    if (aptStart < e0 && aptEnd > s0) {
      return apt;
    }
  }
  return null;
}
