import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromPhone) {
  console.warn(
    "Twilio credentials not configured. SMS sending will fail. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
  );
}

// Only create client if credentials are valid (starts with AC for account SID)
const client = accountSid?.startsWith("AC") && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send an SMS message via Twilio
 */
export async function sendSMS(
  to: string,
  body: string
): Promise<{ sid: string } | { error: string }> {
  console.log("[sendSMS] Starting SMS send:", { to, fromPhone, hasClient: !!client });

  if (!client || !fromPhone) {
    const error = "Twilio not configured";
    console.error("[sendSMS]", error, {
      accountSid: accountSid ? "***" : "missing",
      authToken: authToken ? "***" : "missing",
      fromPhone,
    });
    return { error };
  }

  if (!to) {
    const error = "Recipient phone (to) is missing";
    console.error("[sendSMS]", error);
    return { error };
  }

  if (!body) {
    const error = "Message body is missing";
    console.error("[sendSMS]", error);
    return { error };
  }

  try {
    console.log("[sendSMS] Creating message via Twilio:", { from: fromPhone, to });

    const message = await client.messages.create({
      body,
      from: fromPhone,
      to,
    });

    console.log("[sendSMS] Message sent successfully:", { sid: message.sid, to, status: message.status });
    return { sid: message.sid };
  } catch (error: any) {
    console.error("[sendSMS] Exception:", {
      message: error.message,
      code: error.code,
      status: error.status,
      full: error.toString(),
    });
    return { error: error.message || "Failed to send SMS" };
  }
}

/**
 * Verify if SMS recipient is valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Basic validation: should start with + or digit, contain 10+ digits
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length >= 10;
}
