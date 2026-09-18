import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260918120000_telnyx_message_ledger_go_live.sql",
);
const webhook = read("supabase/functions/telnyx-webhook/index.ts");

describe("Telnyx ledger go-live contract", () => {
  it("keeps RPCs service-role only and records sender metadata", () => {
    expect(migration).toContain("p_messaging_profile_id");
    expect(migration).toContain("p_from_number");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.log_outbound_message[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_telnyx_message\(jsonb\) TO service_role/,
    );
  });

  it("prevents duplicate DLQ rows and out-of-order status regression", () => {
    expect(migration).toContain("external_event_id");
    expect(migration).toContain("uq_webhook_dlq_source_external_event");
    expect(migration).toContain(
      "excluded.occurred_at >= message_log.occurred_at",
    );
    expect(migration).toContain("GREATEST(message_log.occurred_at");
    expect(migration).toContain("WHEN excluded.status = 'failed'");
    expect(migration).toContain("WHEN v_event_type = 'message.finalized'");
  });

  it("attributes legacy order sends and rejects silent null tenants", () => {
    expect(migration).toContain("FROM public.order_notifications o");
    expect(migration).toContain("WHERE o.provider_id = v_msg_id");
    expect(migration).toContain("unattributed_telnyx_outbound");
  });

  it("verifies raw signed payloads and dead-letters ledger failures", () => {
    expect(webhook.indexOf("await req.text()"))
      .toBeLessThan(webhook.indexOf("JSON.parse(rawBody)"));
    expect(webhook).toContain("telnyx-signature-ed25519");
    expect(webhook).toContain("telnyx-timestamp");
    expect(webhook).toContain("TIMESTAMP_TOLERANCE_SECONDS = 300");
    expect(webhook).toContain("source: 'telnyx'");
    expect(webhook).toContain("external_event_id: eventId");
    expect(webhook).toContain("dlqError.code === '23505'");
    expect(webhook).toContain("ledgerResult?.ok !== true");
  });

  it.each([
    "lib/messaging/order-notifications.ts",
    "app/actions/orders/send-receipt.ts",
    "lib/messaging/invoice-send-core.ts",
    "app/actions/notifications/waitlist.ts",
    "app/actions/notifications/reservation.ts",
    "app/dashboard/actions/marketing.ts",
    "lib/site-builder/reservations/notify.ts",
    "supabase/functions/notify-waitlist-guest/index.ts",
    "supabase/functions/notify-reservation-guest/index.ts",
    "supabase/functions/send-receipt/index.ts",
    "app/sites/auth-actions.ts",
  ])("connects %s to the outbound ledger", (path) => {
    expect(read(path)).toMatch(/logSmsSendResult|logOutboundMessage|log_outbound_message/);
  });

  it("uses profile webhooks and never stores storefront OTP values", () => {
    expect(read("lib/messaging/telnyx.ts")).toContain(
      "use_profile_webhooks: true",
    );
    expect(read("supabase/functions/_shared/telnyx.ts")).toContain(
      "use_profile_webhooks: true",
    );
    expect(read("app/sites/auth-actions.ts")).toContain("[REDACTED]");
  });

  it("removes the unused unauthenticated messaging stub", () => {
    expect(existsSync("supabase/functions/telnyx-messaging/index.ts")).toBe(false);
    expect(read("supabase/config.toml")).not.toContain(
      "[functions.telnyx-messaging]",
    );
  });
});
