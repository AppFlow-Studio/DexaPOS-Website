import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { logSmsSendResult } from "@/lib/messaging/message-log";

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe("logSmsSendResult", () => {
  it("records provider metadata for successful sends", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    const result = await logSmsSendResult(
      clientWithRpc(rpc),
      {
        merchantId: "merchant-id",
        customerId: "customer-id",
        toNumber: "+15555550100",
        body: "Receipt ready",
      },
      {
        id: "message-id",
        status: "queued",
        fromNumber: "+15555550200",
        messagingProfileId: "profile-id",
      },
    );

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("log_outbound_message", {
      p_merchant_id: "merchant-id",
      p_to_number: "+15555550100",
      p_body: "Receipt ready",
      p_telnyx_message_id: "message-id",
      p_channel: "sms",
      p_customer_id: "customer-id",
      p_campaign_id: null,
      p_recipient_id: null,
      p_status: "sent",
      p_error_code: null,
      p_from_number: "+15555550200",
      p_messaging_profile_id: "profile-id",
    });
  });

  it("records provider failures without inventing a message ID", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    await logSmsSendResult(
      clientWithRpc(rpc),
      {
        merchantId: "merchant-id",
        toNumber: "+15555550100",
        body: "Receipt ready",
      },
      {
        error: "Rejected",
        errorCode: "40001",
        id: "failed-message-id",
        status: "sending_failed",
        fromNumber: "+15555550200",
        messagingProfileId: "profile-id",
      },
    );

    expect(rpc).toHaveBeenCalledWith(
      "log_outbound_message",
      expect.objectContaining({
        p_telnyx_message_id: "failed-message-id",
        p_status: "failed",
        p_error_code: "40001",
        p_from_number: "+15555550200",
        p_messaging_profile_id: "profile-id",
      }),
    );
  });
});
