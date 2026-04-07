import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

/** Best-effort E.164; US 10-digit → +1… */
export function normalizePhoneForSms(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.startsWith("+")) return t;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSMS(to: string, body: string) {
  if (!to || !process.env.TWILIO_PHONE_NUMBER) return;
  try {
    const msg = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log("SMS sent:", msg.sid);
  } catch (err) {
    console.error("SMS error:", JSON.stringify(err));
  }
}
