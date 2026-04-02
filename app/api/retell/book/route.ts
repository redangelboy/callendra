import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime } from "@/lib/business-timezone";

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

    // Resolver fecha — si viene sin año, agregar el año actual
    const currentYear = new Date().getFullYear();
    let resolvedDate = date;
    // Si el date tiene formato MM-DD o MM/DD sin año, agregar año actual
    if (/^\d{1,2}[\/\-]\d{1,2}$/.test(date)) {
      resolvedDate = `${currentYear}-${date.replace(/\//g, "-").split("-").map((p: string) => p.padStart(2, "0")).join("-")}`;
      // Convertir MM-DD a YYYY-MM-DD
      const parts = date.replace(/\//g, "-").split("-");
      resolvedDate = `${currentYear}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
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

    // Emitir al display en tiempo real
    if ((global as any).io) {
      (global as any).io.to(`display-${business.slug}`).emit("new-appointment", appointment);
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
