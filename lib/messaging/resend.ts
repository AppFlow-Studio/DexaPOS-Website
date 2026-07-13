import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL;

if (!apiKey || !fromEmail) {
  console.warn(
    "Resend credentials not configured. Email sending will fail. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
  );
}

const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Build a branded HTML email template
 */
export function buildEmailTemplate(
  merchantName: string,
  subject: string,
  body: string,
  unsubscribeUrl?: string
): string {
  const escapedBody = body.replace(/\n/g, "<br />");
  const escapedMerchant = merchantName.replace(/[<>]/g, "");
  const unsubscribeHref = unsubscribeUrl || "#";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      border: 1px solid #eee;
      border-radius: 8px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
      margin: -20px -20px 30px -20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 20px 0;
    }
    .content p {
      margin: 0 0 15px 0;
    }
    .footer {
      border-top: 1px solid #eee;
      padding-top: 20px;
      margin-top: 30px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapedMerchant}</h1>
    </div>
    <div class="content">
      ${escapedBody}
    </div>
    <div class="footer">
      <p>This is a message from ${escapedMerchant}</p>
      <p><a href="${unsubscribeHref}">Manage your preferences or unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send an email via Resend
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>
): Promise<{ id: string } | { error: string }> {
  console.log("[sendEmail] Starting email send:", { to, subject, fromEmail, hasApiKey: !!apiKey });

  if (!resend || !fromEmail) {
    const error = "Resend not configured";
    console.error("[sendEmail]", error, { apiKey: apiKey ? "***" : "missing", fromEmail });
    return { error };
  }

  if (!apiKey) {
    const error = "RESEND_API_KEY is missing";
    console.error("[sendEmail]", error);
    return { error };
  }

  if (!fromEmail) {
    const error = "RESEND_FROM_EMAIL is missing";
    console.error("[sendEmail]", error);
    return { error };
  }

  if (!to) {
    const error = "Recipient email (to) is missing";
    console.error("[sendEmail]", error);
    return { error };
  }

  try {
    console.log("[sendEmail] Sending via Resend:", { from: fromEmail, to });

    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      ...(headers ? { headers } : {}),
    });

    console.log("[sendEmail] Resend response:", { success: !result.error, error: result.error?.message });

    if (result.error) {
      const errorMsg = result.error.message;
      console.error("[sendEmail] Resend API error:", errorMsg);
      return { error: errorMsg };
    }

    const emailId = result.data?.id || "";
    console.log("[sendEmail] Email sent successfully:", { id: emailId, to });
    return { id: emailId };
  } catch (error: any) {
    console.error("[sendEmail] Exception:", {
      message: error.message,
      code: error.code,
      status: error.status,
      full: error,
    });
    return { error: error.message || "Failed to send email" };
  }
}

/**
 * Verify if email is valid (basic check)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
