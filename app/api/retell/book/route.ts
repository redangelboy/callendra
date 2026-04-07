import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime } from "@/lib/business-timezone";
import { findStaffOverlappingAppointment } from "@/lib/appointment-overlap";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { notifyClientBookingConfirmed } from "@/lib/notify";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });



export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Retell manda los args dentro de body.args o directamente en body
    const args = body.args || body;

    const {
      slug,
      clientName,
      clientPhone,
      serviceName,
      staffName,
      date,
      time,
    } = args;

    if (!slug || !clientName || !clientPhone || !date || !time) {
      return NextResponse.json({
        success: false,
        message: "Missing required fields: clientName, clientPhone, date, time"
      }, { status: 400 });
    }

    // Resolver fecha — forzar año actual siempre
    const currentYear = new Date().getFullYear();
    let resolvedDate = date;
    // Formato MM-DD o MM/DD sin año
    if (/^\d{1,2}[\/\-]\d{1,2}$/.test(date)) {
      const parts = date.replace(/\//g, "-").split("-");
      resolvedDate = `${currentYear}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
    // Formato YYYY-MM-DD pero con año incorrecto — reemplazar con año actual
    else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split("-");
      resolvedDate = `${currentYear}-${parts[1]}-${parts[2]}`;
    }

    // Resolver hora — convertir "3pm" → "15:00", "10am" → "10:00"
    let resolvedTime = time;
    const ampm = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      let hours = parseInt(ampm[1]);
      const minutes = ampm[2] ? ampm[2] : "00";
      const period = ampm[3].toLowerCase();
      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      resolvedTime = `${String(hours).padStart(2, "0")}:${minutes}`;
    }

    // Si la hora no tiene AM/PM y es ambigua, inferir por hora actual
    if (/^\d{1,2}(:\d{2})?$/.test(time.trim())) {
      const hour = parseInt(time.split(":")[0]);
      const nowHour = new Date().getHours();
      // Si la hora es <= 12 y ya pasamos del mediodía, asumir PM
      if (hour < 12 && nowHour >= 12) {
        resolvedTime = `${String(hour + 12).padStart(2, "0")}:${time.includes(":") ? time.split(":")[1] : "00"}`;
      }
    }

    // Buscar el negocio
    const business = await prisma.business.findFirst({
      where: { slug, active: true }
    });

    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    // Cargar staff y servicios disponibles en esta sucursal
    const { staff, services } = await loadLocationCatalog(prisma, business.id);

    // Resolver staff — por nombre o el primero disponible
    let selectedStaff = staff[0];
    if (staffName) {
      const found = staff.find((s: any) =>
        s.name.toLowerCase().includes(staffName.toLowerCase())
      );
      if (found) selectedStaff = found;
    }

    if (!selectedStaff) {
      return NextResponse.json({ success: false, message: "No barbers available" }, { status: 400 });
    }

    // Resolver servicio — por nombre o el primero disponible
    let selectedService = services[0];
    if (serviceName) {
      const found = services.find((s: any) =>
        s.name.toLowerCase().includes(serviceName.toLowerCase())
      );
      if (found) selectedService = found;
    }

    if (!selectedService) {
      return NextResponse.json({ success: false, message: "No services available" }, { status: 400 });
    }

    // Crear el appointment
    const appointmentDate = utcFromYmdAndTime(resolvedDate, resolvedTime);

    // Validar que la cita no sea en el pasado
    const now = new Date();
    if (appointmentDate < now) {
      return NextResponse.json({
        success: false,
        message: `That time has already passed. Please choose a future time.`
      }, { status: 400 });
    }

    const serviceDuration = selectedService.duration || 30;
    const appointmentEnd = new Date(appointmentDate.getTime() + serviceDuration * 60000);

    const overlap = await findStaffOverlappingAppointment(prisma, {
      staffId: selectedStaff.id,
      start: appointmentDate,
      end: appointmentEnd,
    });
    if (overlap) {
      return NextResponse.json(
        {
          success: false,
          message: `${selectedStaff.name} is busy at that time. Please choose a different time or barber.`,
        },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId: selectedStaff.id,
        serviceId: selectedService.id,
        clientName,
        clientPhone,
        clientEmail: null,
        date: appointmentDate,
        status: "confirmed",
        source: "phone",
      }
    });

    // Emitir al display en tiempo real via internal emit
    try {
      const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/internal/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: `display-${business.slug}`,
          event: "new-appointment",
          data: appointment,
        }),
      });
    } catch (emitError) {
      console.error("Emit error:", emitError);
    }

    try {
      const bookingLink = await buildPublicBookingAbsUrl(prisma, business);
      await notifyClientBookingConfirmed({
        source: "phone",
        clientPhone: clientPhone,
        clientEmail: null,
        clientName,
        businessName: business.name,
        businessAddress: business.address,
        googleMapsPlaceUrl: business.googleMapsPlaceUrl,
        staffName: selectedStaff.name,
        serviceName: selectedService.name,
        date: resolvedDate,
        time: resolvedTime,
        bookingLink,
      });
    } catch (notifyErr) {
      console.error("Retell client SMS notify error:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      message: `Appointment confirmed for ${clientName} on ${resolvedDate} at ${resolvedTime} with ${selectedStaff.name} for ${selectedService.name}.`,
      appointmentId: appointment.id,
    });

  } catch (error) {
    console.error("Retell webhook error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// GET para obtener info dinámica del negocio (servicios, barbers, horarios)
// Retell puede llamar esto al inicio de la llamada para inyectar variables en el prompt
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const business = await prisma.business.findFirst({
      where: { slug, active: true }
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const { staff, services } = await loadLocationCatalog(prisma, business.id);

    const staffNames = staff.map((s: any) => s.name).join(", ");
    const serviceList = services.map((s: any) => `${s.name} ($${s.price}, ${s.duration} min)`).join(" | ");
    const currentYear = new Date().getFullYear();

    return NextResponse.json({
      businessName: business.name,
      currentYear,
      staffNames,
      serviceList,
    });

  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
