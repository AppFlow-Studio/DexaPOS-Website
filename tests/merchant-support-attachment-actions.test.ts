import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  audit: vi.fn(),
  notifyCreated: vi.fn(),
  notifyMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(async () =>
          table === "merchants"
            ? {
                data: {
                  id: "11111111-1111-4111-8111-111111111111",
                  carrier_id: null,
                },
                error: null,
              }
            : { data: { id: "ticket-1", status: "open" }, error: null },
        ),
      };
      return chain;
    },
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () => ({
    id: "user-1",
    fullName: "Merchant User",
    firstName: "Merchant",
    emailAddresses: [{ emailAddress: "merchant@example.com" }],
  }),
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: mocks.audit,
}));

vi.mock("@/lib/support/ticket-notification-request", () => ({
  requestSupportTicketCreatedNotification: mocks.notifyCreated,
  requestSupportTicketMessageNotification: mocks.notifyMessage,
}));

import {
  AddMessage,
  CreateTicket,
  GetSupportUploadUrl,
} from "@/app/dashboard/actions/support";

const MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MERCHANT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const FILE_ID = "44444444-4444-4444-8444-444444444444";

function attachment(merchantId = MERCHANT_ID) {
  return {
    file_name: "evidence.pdf",
    file_path: `${merchantId}/tickets/${SESSION_ID}/${FILE_ID}_evidence.pdf`,
    file_size: 2048,
    file_type: "application/pdf",
  };
}

describe("merchant support action attachment gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("BUNNY_CDN_HOSTNAME", "cdn.test");
    mocks.rpc.mockResolvedValue({
      data: { ticket_id: "ticket-1", ticket_number: "SUP-1" },
      error: null,
    });
    mocks.notifyCreated.mockResolvedValue({ ok: true });
    mocks.notifyMessage.mockResolvedValue({ ok: true });
  });

  it("routes video uploads to the merchant's CDN support namespace", async () => {
    const result = await GetSupportUploadUrl(
      "org-1",
      "screen recording.mp4",
      FILE_ID,
      SESSION_ID,
      "video/mp4",
    );

    expect(result.target).toEqual(
      expect.objectContaining({
        provider: "cdn",
        method: "POST",
        upload_url: "https://project.supabase.co/functions/v1/cdn-upload",
        file_path:
          `https://cdn.test/merchants/${MERCHANT_ID}/support/` +
          `${SESSION_ID}_${FILE_ID}_screen_recording.mp4`,
        headers: expect.objectContaining({
          "x-cdn-scope": "merchant",
          "x-cdn-merchant-id": MERCHANT_ID,
          "x-cdn-category": "support",
          "x-cdn-content-type": "video/mp4",
        }),
      }),
    );
  });

  it("blocks invalid attachment metadata before creating a ticket", async () => {
    const result = await CreateTicket("org-1", {
      subject: "Receipt printer issue",
      description: "The receipt printer is not responding.",
      category: "hardware",
      attachments: [attachment(OTHER_MERCHANT_ID)],
    });

    expect(result.error).toBe("One or more attachment paths are invalid");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("blocks invalid attachment metadata before adding a reply", async () => {
    const result = await AddMessage("org-1", "ticket-1", "See the file", [
      { ...attachment(), file_type: "text/html" },
    ]);

    expect(result.error).toBeDefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes parsed merchant-scoped attachments to the ticket RPC", async () => {
    const validAttachment = attachment();
    await CreateTicket("org-1", {
      subject: "Receipt printer issue",
      description: "The receipt printer is not responding.",
      category: "hardware",
      attachments: [validAttachment],
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_support_ticket",
      expect.objectContaining({ p_attachments: [validAttachment] }),
    );
  });
});
