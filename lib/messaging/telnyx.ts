import Telnyx from "telnyx";
import { normalizePhone as normalizeToE164, isValidPhone as isValidPhoneShared } from "@/lib/phone";

const apiKey = process.env.TELNYX_API_KEY;
const fromPhone = process.env.TELNYX_FROM_NUMBER;
const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
const webhookUrl = process.env.TELNYX_WEBHOOK_URL;
const webhookFailoverUrl = process.env.TELNYX_WEBHOOK_FAILOVER_URL;

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
): Promise<SmsSendResult> {
  if (!client) {
    const error = "Telnyx not configured";
    console.error("[telnyx.sendSMS]", error);
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
      return { error: "Invalid phone number" };
    }

    const params: {
      to: string;
      text: string;
      from?: string;
      messaging_profile_id?: string;
      use_profile_webhooks?: boolean;
      webhook_url?: string;
      webhook_failover_url?: string;
    } = {
      to: normalizedTo,
      text: body,
      use_profile_webhooks: true,
    };
    if (fromPhone) params.from = fromPhone;
    else if (messagingProfileId) params.messaging_profile_id = messagingProfileId;
    if (webhookUrl) params.webhook_url = webhookUrl;
    if (webhookFailoverUrl) params.webhook_failover_url = webhookFailoverUrl;

    const response = await client.messages.send(params);
    const data = response?.data;
    if (!data?.id) return { error: "Telnyx response did not include a message ID" };

    const responseFrom = data.from?.phone_number ?? fromPhone ?? null;
    const responseProfile = data.messaging_profile_id ?? messagingProfileId ?? null;
    const providerStatus = data.to?.[0]?.status ?? "sent";
    if (["sending_failed", "delivery_failed"].includes(providerStatus)) {
      const firstError = data.errors?.[0];
      return {
        error: firstError?.detail ?? firstError?.title ?? "Telnyx rejected the SMS",
        errorCode: firstError?.code ?? null,
        id: data.id,
        status: providerStatus,
        fromNumber: responseFrom,
        messagingProfileId: responseProfile,
      };
    }

    return {
      id: data.id,
      status: providerStatus,
      fromNumber: responseFrom,
      messagingProfileId: responseProfile,
    };
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string | number; status?: number };
    console.error("[telnyx.sendSMS] Exception:", {
      code: err?.code,
      status: err?.status,
    });
    return {
      error: err?.message || "Failed to send SMS",
      errorCode: err?.code == null ? null : String(err.code),
    };
  }
}

export interface SmsSendSuccess {
  id: string;
  status: string;
  fromNumber: string | null;
  messagingProfileId: string | null;
}

export interface SmsSendFailure {
  error: string;
  errorCode?: string | null;
  id?: string;
  status?: string;
  fromNumber?: string | null;
  messagingProfileId?: string | null;
}

export type SmsSendResult = SmsSendSuccess | SmsSendFailure;

/** Re-export shared validation so existing imports keep working. */
export const isValidPhoneNumber = isValidPhoneShared;
