import { Resend } from "resend";
import { resolveGoogleMapsDirectionsUrl } from "@/lib/google-maps-link";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendBookingConfirmation({
  clientEmail,
  clientName,
  businessName,
  staffName,
  serviceName,
  date,
  time,
  bookingLink,
  businessEmail,
  businessAddress,
  googleMapsPlaceUrl,
}: {
  clientEmail: string;
  clientName: string;
  businessName: string;
  staffName: string;
  serviceName: string;
  date: string;
  time: string;
  bookingLink: string;
  businessEmail?: string;
  businessAddress?: string | null;
  googleMapsPlaceUrl?: string | null;
}) {
  const mapsUrl = resolveGoogleMapsDirectionsUrl(
    googleMapsPlaceUrl ?? undefined,
    businessName,
    businessAddress ?? undefined
  );
  const addressBlock = mapsUrl
    ? `
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Location</td>
                  <td style="padding: 8px 0; color: #111; text-align: right;">
                    ${businessAddress?.trim() ? `<div style="font-weight: bold;">${escapeHtml(businessAddress.trim())}</div>` : ""}
                    <a href="${escapeHtml(mapsUrl)}" style="color: #2563eb; font-size: 14px; font-weight: 600;">Open in Google Maps →</a>
                  </td>
                </tr>`
    : "";
  try {
    await resend.emails.send({
      from: "Callendra <callendra@voxproai.com>",
      replyTo: businessEmail || undefined,
      to: clientEmail,
      subject: `Appointment confirmed at ${businessName.replace(/[\r\n]/g, " ").slice(0, 200)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
          <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            
            <h1 style="color: #111; font-size: 24px; margin-bottom: 8px;">Appointment Confirmed ✅</h1>
            <p style="color: #666; margin-bottom: 32px;">Hi ${escapeHtml(clientName)}, your appointment has been confirmed.</p>
            
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Business</td>
                  <td style="padding: 8px 0; color: #111; font-weight: bold; text-align: right;">${escapeHtml(businessName)}</td>
                </tr>
              ${addressBlock}
              <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Service</td>
                  <td style="padding: 8px 0; color: #111; font-weight: bold; text-align: right;">${escapeHtml(serviceName)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">With</td>
                  <td style="padding: 8px 0; color: #111; font-weight: bold; text-align: right;">${escapeHtml(staffName)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Date</td>
                  <td style="padding: 8px 0; color: #111; font-weight: bold; text-align: right;">${escapeHtml(date)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Time</td>
                  <td style="padding: 8px 0; color: #111; font-weight: bold; text-align: right;">${escapeHtml(time)}</td>
                </tr>
              </table>
            </div>

            <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
              Need to reschedule? Book a new appointment at the link below and cancel this one by contacting the business.
            </p>

            <a href="${bookingLink}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
              Book Another Appointment
            </a>

            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              Powered by Callendra · This is an automated confirmation email
            </p>
          </div>
        </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Email error:", error);
  }
}
