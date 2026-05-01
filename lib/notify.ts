import { Resend } from "resend";
import { DateTime } from "luxon";
import { sendSMS, normalizePhoneForSms } from "./sms";
import { sendBookingConfirmation } from "@/lib/email/send";
import { resolveGoogleMapsDirectionsUrl } from "@/lib/google-maps-link";
import { BUSINESS_TIMEZONE, formatHhmmForDisplay, formatInstantInBusinessTz } from "@/lib/business-timezone";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStaffAppointmentWhen(date: Date): string {
  const dt = DateTime.fromJSDate(date).setZone(BUSINESS_TIMEZONE);
  return `${dt.toFormat("ccc, LLL d, yyyy")} · ${dt.toFormat("h:mm a").toLowerCase()}`;
}

function formatBookingTimeForNotify(time: string): string {
  const t = String(time ?? "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return formatHhmmForDisplay(t);
  return t;
}

function formatPriceUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

/**
 * When an appointment is confirmed: notify assigned staff by email and/or SMS if saved on their Staff row.
 * Omits client contact info — only client name, service, price, and time.
 */
export async function notifyStaffAppointmentConfirmed({
  staffEmail,
  staffPhone,
  staffName,
  businessName,
  clientName,
  serviceName,
  price,
  appointmentAt,
}: {
  staffEmail?: string | null;
  staffPhone?: string | null;
  staffName: string;
  businessName: string;
  clientName: string;
  serviceName: string;
  price: number;
  appointmentAt: Date;
}) {
  const emailTo = (staffEmail && String(staffEmail).trim()) || "";
  const whenStr = formatStaffAppointmentWhen(appointmentAt);
  const priceStr = formatPriceUsd(price);
  const safeBiz = escapeHtml(businessName);
  const safeStaff = escapeHtml(staffName);
  const safeClient = escapeHtml(clientName);
  const safeService = escapeHtml(serviceName);

  if (emailTo && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: "Callendra <callendra@voxproai.com>",
        to: emailTo,
        subject: `New appointment — ${businessName.replace(/[\r\n]/g, " ").slice(0, 120)}`,
        html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
        <p style="color: #9ca3af; margin: 0 0 8px 0;">Hi ${safeStaff},</p>
        <h2 style="color: #facc15; margin: 0 0 16px 0; font-size: 18px;">Appointment confirmed</h2>
        <p style="color: #d1d5db; margin: 0 0 20px 0;">${safeBiz}</p>
        <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px 0;"><strong>Client</strong> (name only): ${safeClient}</p>
          <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${safeService}</p>
          <p style="margin: 0 0 8px 0;"><strong>Price:</strong> ${escapeHtml(priceStr)}</p>
          <p style="margin: 0;"><strong>When:</strong> ${escapeHtml(whenStr)}</p>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin: 0;">Callendra · staff notification (no client phone or email included)</p>
      </div>`,
      });
    } catch (e) {
      console.error("Staff appointment confirmation email error:", e);
    }
  }

  const smsTo = normalizePhoneForSms(staffPhone);
  if (smsTo) {
    const smsBody = `Callendra: New appt at ${businessName.slice(0, 40)}${businessName.length > 40 ? "…" : ""}. Client: ${clientName.slice(0, 32)}${clientName.length > 32 ? "…" : ""}. ${serviceName.slice(0, 28)}${serviceName.length > 28 ? "…" : ""}. ${priceStr}. ${whenStr}`;
    try {
      await sendSMS(smsTo, smsBody.slice(0, 1500));
    } catch (e) {
      console.error("Staff appointment confirmation SMS error:", e);
    }
  }
}

/**
 * Client confirmation after booking: web/dashboard = email (if provided) + SMS (if phone).
 * Voice (phone) agent = SMS only.
 */
export async function notifyClientBookingConfirmed({
  source,
  clientEmail,
  clientPhone,
  clientName,
  businessName,
  businessAddress,
  googleMapsPlaceUrl,
  staffName,
  serviceName,
  date,
  time,
  bookingLink,
}: {
  source: "web" | "walk_in" | "dashboard" | "phone";
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientName: string;
  businessName: string;
  /** Saved business address → fallback Maps search */
  businessAddress?: string | null;
  /** Pasted Google Maps "Share" link for this location (preferred) */
  googleMapsPlaceUrl?: string | null;
  staffName: string;
  serviceName: string;
  date: string;
  time: string;
  bookingLink: string;
}) {
  const timePart = time || "";
  const timeDisplay = timePart ? formatBookingTimeForNotify(timePart) : "";
  const whenLine = timeDisplay ? `${date} at ${timeDisplay} (Central)` : date;
  const mapsUrl = resolveGoogleMapsDirectionsUrl(
    googleMapsPlaceUrl ?? undefined,
    businessName,
    businessAddress ?? undefined
  );
  const mapsSmsSuffix = mapsUrl ? `\nDirections: ${mapsUrl}` : "";

  if (source === "phone") {
    const to = normalizePhoneForSms(clientPhone);
    if (to) {
      await sendSMS(
        to,
        `Callendra: Hi ${clientName}, your appointment at ${businessName} is confirmed.\n${serviceName} with ${staffName}\n${whenLine}${mapsSmsSuffix}\n\nQuestions? Call the business.`
      );
    }
    return;
  }

  const email = (clientEmail && String(clientEmail).trim()) || "";
  if (email) {
    try {
      await sendBookingConfirmation({
        clientEmail: email,
        clientName,
        businessName,
        staffName,
        serviceName,
        date,
        time: timeDisplay || timePart,
        bookingLink,
        businessEmail: undefined,
        businessAddress,
        googleMapsPlaceUrl,
      });
    } catch (e) {
      console.error("Client confirmation email error:", e);
    }
  }

  const to = normalizePhoneForSms(clientPhone);
  if (to) {
    await sendSMS(
      to,
      `Callendra: Hi ${clientName}, your appointment at ${businessName} is confirmed.\n${serviceName} with ${staffName}\n${whenLine}${mapsSmsSuffix}\nBook again: ${bookingLink}`
    );
  }
}

export async function notifyCancelRequest({
  ownerEmail,
  ownerName,
  ownerPhone,
  businessPhone,
  businessName,
  clientName,
  serviceName,
  staffName,
  date,
  reason,
}: {
  ownerEmail: string;
  ownerName: string;
  ownerPhone?: string | null;
  businessPhone?: string | null;
  businessName: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  date: Date;
  reason: string;
}) {
  const dateStr = `${DateTime.fromJSDate(date).setZone(BUSINESS_TIMEZONE).toFormat("EEEE, LLLL d, yyyy")} · ${formatInstantInBusinessTz(date)}`;

  // Email
  await resend.emails.send({
    from: "Callendra <callendra@voxproai.com>",
    to: ownerEmail,
    subject: `⚠️ Cancel request — ${clientName} at ${businessName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #facc15; margin-bottom: 4px;">⚠️ Cancel Request</h2>
        <p style="color: #9ca3af; margin-bottom: 24px;">${businessName}</p>

        <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Barber:</strong> ${staffName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${dateStr}</p>
        </div>

        <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #facc15;">
          <p style="margin: 0 0 4px 0; color: #facc15; font-size: 12px;">REASON</p>
          <p style="margin: 0; color: #ffffff;">${reason}</p>
        </div>

        <a href="https://app.callendra.com/en/dashboard" 
           style="display: inline-block; background: #ffffff; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Review in Dashboard →
        </a>

        <p style="color: #4b5563; font-size: 12px; margin-top: 24px;">Callendra · appointment management</p>
      </div>
    `,
  });

  const smsTo =
    (ownerPhone && String(ownerPhone).trim()) ||
    (businessPhone && String(businessPhone).trim()) ||
    undefined;

  // SMS
  console.log("SMS DEBUG:", { smsTo, TWILIO_SID: process.env.TWILIO_ACCOUNT_SID?.slice(0,5) });
  if (smsTo) {
    await sendSMS(
      smsTo,
      `⚠️ Callendra: Cancel request at ${businessName}\nClient: ${clientName} | ${serviceName}\nBarber: ${staffName}\nDate: ${dateStr}\nReason: ${reason}\nReview: https://app.callendra.com/en/dashboard`
    );
  }
}
