import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerName, customerPhone, service, date, time, businessSlug, locationSlug } = body;

    const business = await prisma.business.findFirst({
      where: { slug: locationSlug || businessSlug }
    });

    if (!business) {
      return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
    }

    const serviceRecord = await prisma.service.findFirst({
      where: {
        businessId: business.id,
        name: { contains: service, mode: "insensitive" }
      }
    });

    const staff = await prisma.staff.findFirst({
      where: { businessId: business.id }
    });

    if (!staff) {
      return NextResponse.json({ success: false, error: "No staff available" }, { status: 404 });
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId: staff.id,
        serviceId: serviceRecord?.id || null,
        customerName,
        customerPhone,
        date: new Date(date),
        time,
        status: "confirmed"
      }
    });

    return NextResponse.json({ 
      success: true, 
      appointmentId: appointment.id,
      message: `Appointment confirmed for ${customerName} on ${date} at ${time}`
    });

  } catch (error) {
    console.error("Retell booking error:", error);
    return NextResponse.json({ success: false, error: "Booking failed" }, { status: 500 });
  }
}
