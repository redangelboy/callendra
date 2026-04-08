import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getPublicRegisterUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_URL?.replace(/\/$/, "") ||
    "https://callendra.com";
  return `${base}/en/register`;
}

/**
 * Subject per product request; body matches “clean HTML” spec.
 */
export async function sendInviteCodeEmail(to: string, code: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("sendInviteCodeEmail: RESEND_API_KEY missing, skipping email");
    return;
  }
  const registerUrl = getPublicRegisterUrl();
  const safeCode = escapeHtml(code);
  const safeUrl = escapeHtml(registerUrl);

  await resend.emails.send({
    from: "Callendra <callendra@voxproai.com>",
    to,
    subject: "You're invited to Callendra 🎉",
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 8px;text-align:center;">
              <p style="margin:0;font-size:17px;color:#18181b;line-height:1.5;">Here is your invite code:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 24px;text-align:center;">
              <div style="display:inline-block;padding:16px 28px;background:linear-gradient(135deg,#f4f4f5 0%,#e4e4e7 100%);border-radius:12px;border:2px dashed #71717a;font-size:22px;font-weight:700;letter-spacing:.08em;color:#18181b;font-family:ui-monospace,monospace;">${safeCode}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;text-align:center;">
              <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#18181b;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;">Create your account</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 32px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">This code is unique to you and can only be used once.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}
