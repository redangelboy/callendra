import { Resend } from "resend";
import { sendSMS, normalizePhoneForSms } from "./sms";
import { sendBookingConfirmation } from "@/lib/email/send";
import { resolveGoogleMapsDirectionsUrl } from "@/lib/google-maps-link";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  const whenLine = timePart ? `${date} at ${timePart} (Central)` : date;
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
        time,
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
  const dateStr = new Date(date).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });

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
