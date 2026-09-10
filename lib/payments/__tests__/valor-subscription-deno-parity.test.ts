import { describe, expect, it } from "vitest";
import { buildAddSubscriptionBody as nodeBuildAddSubscriptionBody } from "../valor/subscriptionApi";
import { buildValorRecurringBody as denoBuildValorRecurringBody } from "../../../supabase/functions/_shared/valor";

/**
 * [C2] payment_info key-name parity between the Node subscription builder
 * (lib/payments/valor/subscriptionApi.ts, source of truth) and the Deno edge
 * builder (supabase/functions/_shared/valor.ts) used by
 * billing-charge-subscription.
 *
 * Valor's add_subscription contract names the vault reference
 * `CustomerProfileID` / `PaymentProfileID`. Sending the wrong keys
 * (`vault_id` / `payment_id`) makes the gateway see no vault reference and
 * return `A44 INVALID PAYMENT INFO` — the defect this pins against. The two
 * builders diverge intentionally on other fields (the Deno recurring body
 * always carries `failure_notification` / `retry_count`), so only the
 * `payment_info` object is compared here — that is the part that must never
 * drift again.
 */

const nodeParams = {
  money: { amountMinor: 9999, currency: "USD" as const },
  interval: "monthly" as const,
  chargeOn: 15,
  startsOn: new Date("2026-09-15T12:00:00.000Z"),
  vaultCustomerId: "vault-123",
  paymentProfileId: "payment-456",
  billingCustomerName: "Test Merchant",
  billingZip: "85284",
};

const denoParams = {
  amountMinor: 9999,
  vaultCustomerId: "vault-123",
  paymentProfileId: "payment-456",
  billingCustomerName: "Test Merchant",
  billingZip: "85284",
  startsOn: new Date("2026-09-15T12:00:00.000Z"),
  chargeOn: 15,
};

describe("Valor subscription payment_info Node/Deno parity", () => {
  it("emits the documented CustomerProfileID / PaymentProfileID keys in both builders", () => {
    const nodeInfo = nodeBuildAddSubscriptionBody(nodeParams).payment_info;
    const denoInfo = (
      denoBuildValorRecurringBody(denoParams) as {
        payment_info: Record<string, unknown>;
      }
    ).payment_info;

    const expected = {
      CustomerProfileID: "vault-123",
      PaymentProfileID: "payment-456",
    };
    expect(nodeInfo).toEqual(expected);
    expect(denoInfo).toEqual(expected);
    expect(denoInfo).toEqual(nodeInfo);
  });

  it("never re-introduces the legacy vault_id / payment_id keys (A44 guard)", () => {
    const nodeInfo = nodeBuildAddSubscriptionBody(nodeParams).payment_info;
    const denoInfo = (
      denoBuildValorRecurringBody(denoParams) as {
        payment_info: Record<string, unknown>;
      }
    ).payment_info;

    for (const info of [nodeInfo, denoInfo]) {
      expect("vault_id" in info).toBe(false);
      expect("payment_id" in info).toBe(false);
    }
  });

  it("omits PaymentProfileID in both builders when no payment profile id exists", () => {
    const nodeInfo = nodeBuildAddSubscriptionBody({
      ...nodeParams,
      paymentProfileId: undefined,
    }).payment_info;
    const denoInfo = (
      denoBuildValorRecurringBody({
        ...denoParams,
        paymentProfileId: null,
      }) as { payment_info: Record<string, unknown> }
    ).payment_info;

    expect(nodeInfo).toEqual({ CustomerProfileID: "vault-123" });
    expect(denoInfo).toEqual({ CustomerProfileID: "vault-123" });
  });
});
