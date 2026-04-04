import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

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
