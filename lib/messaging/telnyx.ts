import Telnyx from "telnyx";
import { normalizePhone as normalizeToE164, isValidPhone as isValidPhoneShared } from "@/lib/phone";

const apiKey = process.env.TELNYX_API_KEY;
const fromPhone = process.env.TELNYX_FROM_NUMBER;
const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

if (!apiKey || (!fromPhone && !messagingProfileId)) {
  console.warn(
    "Telnyx credentials not configured. SMS sending will fail. Set TELNYX_API_KEY and either TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID."
  );
}

const client = apiKey ? new Telnyx({ apiKey }) : null;


/**
 * Send an SMS message via Telnyx.
 */
export async function sendSMS(
  to: string,
  body: string
): Promise<{ id: string } | { error: string }> {
  console.log("[telnyx.sendSMS] Starting SMS send:", {
    to,
    fromPhone,
    hasClient: !!client,
    hasProfile: !!messagingProfileId,
  });

  if (!client) {
    const error = "Telnyx not configured";
    console.error("[telnyx.sendSMS]", error, {
      apiKey: apiKey ? "***" : "missing",
      fromPhone,
      messagingProfileId: messagingProfileId ? "***" : "missing",
    });
    return { error };
  }

  if (!fromPhone && !messagingProfileId) {
    return {
      error:
        "Telnyx not configured: set TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID",
    };
  }

  if (!to) {
    return { error: "Recipient phone (to) is missing" };
  }

  if (!body) {
    return { error: "Message body is missing" };
  }

  try {
    const normalizedTo = normalizeToE164(to);
    if (!normalizedTo) {
      return { error: `Invalid phone number: ${to}` };
    }
    console.log("[telnyx.sendSMS] Normalized phone number:", {
      original: to,
      normalized: normalizedTo,
    });

    const params: {
      to: string;
      text: string;
      from?: string;
      messaging_profile_id?: string;
    } = {
      to: normalizedTo,
      text: body,
    };
    if (fromPhone) params.from = fromPhone;
    if (messagingProfileId) params.messaging_profile_id = messagingProfileId;

    const response = await client.messages.send(params);
    const id = (response as { data?: { id?: string } } | undefined)?.data?.id ?? "unknown";
    console.log("[telnyx.sendSMS] Message sent successfully:", {
      id,
      to: normalizedTo,
    });
    return { id };
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string | number; status?: number };
    console.error("[telnyx.sendSMS] Exception:", {
      message: err?.message,
      code: err?.code,
      status: err?.status,
      full: String(error),
    });
    return { error: err?.message || "Failed to send SMS" };
  }
}

/** Re-export shared validation so existing imports keep working. */
export const isValidPhoneNumber = isValidPhoneShared;
