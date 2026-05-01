import { PrismaClient } from "@prisma/client";

/** Staff and services bookable at a location (business row id). */
export async function loadLocationCatalog(prisma: PrismaClient, locationBusinessId: string) {
  const staffAssignments = await prisma.staffAssignment.findMany({
    where: { businessId: locationBusinessId, active: true },
    include: { staff: true },
  });

  const staffMap = new Map<string, (typeof staffAssignments)[0]["staff"]>();
  for (const a of staffAssignments) {
    if (a.staff?.active) staffMap.set(a.staff.id, a.staff);
  }
  const staff = Array.from(staffMap.values());

  const serviceRows = await prisma.serviceLocation.findMany({
    where: { businessId: locationBusinessId, active: true },
    include: { service: true },
  });

  const services = serviceRows
    .filter((x) => x.service.active)
    .map((x) => ({
      ...x.service,
      price: x.price ?? x.service.price,
    }));

  return { staff, services };
}

/** Effective service price at a location for appointment display. */
export async function effectiveServicePrice(
  prisma: PrismaClient,
  serviceId: string,
  locationBusinessId: string
) {
  const sl = await prisma.serviceLocation.findUnique({
    where: {
      serviceId_businessId: { serviceId, businessId: locationBusinessId },
    },
    include: { service: true },
  });
  if (!sl?.service) return null;
  return sl.price ?? sl.service.price;
}

/** Primary-line USD price for an appointment: frozen snapshot if set, else catalog at location (legacy). */
export async function resolveAppointmentPrimaryPrice(
  prisma: PrismaClient,
  apt: {
    serviceId: string | null;
    businessId: string;
    servicePriceSnapshot: number | null;
    service?: { price?: number | null } | null;
  }
): Promise<number> {
  const snap = apt.servicePriceSnapshot;
  if (snap != null && Number.isFinite(snap)) return snap;
  if (!apt.serviceId) return 0;
  const p = await effectiveServicePrice(prisma, apt.serviceId, apt.businessId);
  return p ?? apt.service?.price ?? 0;
}
