import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/messaging/app-url", () => ({
  resolveAppUrl: vi.fn(async () => "https://dashboard.example.com"),
}));

import { requestSupportTicketCreatedNotification } from
  "@/lib/support/ticket-notification-request";

describe("website support ticket notification fallback", () => {
  beforeEach(() => {
    process.env.INTERNAL_NOTIFICATION_SECRET = "test-secret";
    vi.restoreAllMocks();
  });

  it("calls the protected idempotent notification endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await requestSupportTicketCreatedNotification(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result).toEqual({ ok: true, skipped: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashboard.example.com/api/internal/support-ticket-created",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-internal-secret": "test-secret",
        }),
        body: JSON.stringify({
          ticket_id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
  });

  it("reports missing configuration without blocking ticket creation", async () => {
    delete process.env.INTERNAL_NOTIFICATION_SECRET;

    await expect(
      requestSupportTicketCreatedNotification(
        "11111111-1111-4111-8111-111111111111",
      ),
    ).resolves.toEqual({
      ok: false,
      error: "INTERNAL_NOTIFICATION_SECRET is not configured",
    });
  });
});
