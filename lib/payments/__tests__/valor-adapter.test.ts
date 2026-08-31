import { describe, expect, it } from "vitest";
import { createValorProcessor } from "../valor-adapter";
import { createProcessor } from "../index";
import { PaymentProcessorError, type ProcessorAccount } from "../types";
import { ValorConfigError } from "../valor/config";
import type { ValorEndpoints } from "../valor/config";

/**
 * Adapter tests for the Valor `PaymentProcessor`. Fetch is injected, so no
 * request leaves the machine; these pin the request shapes Valor receives and
 * the outcome classification, without a live sandbox.
 */

const ENDPOINTS: ValorEndpoints = {
  environment: "sandbox",
  clientTokenBaseUrl: "https://ct.test",
  transactionBaseUrl: "https://txn.test",
  vaultBaseUrl: "https://vault.test",
  boardingBaseUrl: "https://board.test",
  isDemo: true,
};

const CREDS = { epi: "2000000001", appId: "app-id", appKey: "app-key" };

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const text =
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    return new Response(text, { status: response.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

describe("createValorProcessor — construction", () => {
  it("advertises Valor's capabilities", () => {
    const { fetchImpl } = stubFetch([]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });
    expect(processor.name).toBe("valor");
    expect(processor.supports).toEqual({
      customerVault: true,
      hostedPage: true,
      subscriptions: true,
    });
  });

  it("rejects a malformed EPI at construction", () => {
    expect(() => createValorProcessor({ ...CREDS, epi: "123" })).toThrow(
      ValorConfigError
    );
  });
});

describe("createValorProcessor — sale", () => {
  it("charges the Passage.js Sale endpoint, card-only, and approves on S00/00", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { error_no: "S00", error_code: "00", txnid: "txn_1", approval_code: "AUTH1" } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const tx = await processor.sale({
      money: { amountMinor: 2500, currency: "USD" },
      paymentToken: "tok_abc",
      orderId: "INV-1",
      contact: { firstName: "Order", lastName: "Customer" },
    });

    expect(tx.outcome).toBe("approved");
    expect(tx.transactionId).toBe("txn_1");
    expect(tx.authCode).toBe("AUTH1");
    expect(tx.processor).toBe("valor");

    expect(calls[0].url).toBe("https://txn.test/?sale");
    const body = jsonBody(calls[0]);
    expect(body.surchargeIndicator).toBe("0");
    expect(body.amount).toBe("25.00");
    expect(body.token).toBe("tok_abc");
    expect(body.invoicenumber).toBe("INV1");
    expect(body.ecomm_channel).toBe("passagejs");
    expect(body.productIds).toBeUndefined();
    expect(body.cardholdername).toBeUndefined();
    expect(body.appid).toBe("app-id");
    expect(body.appkey).toBe("app-key");
    expect(body.epi).toBe("2000000001");
  });

  it("classifies a gateway answer of refusal as declined", async () => {
    const { fetchImpl } = stubFetch([
      { status: 400, body: { error_no: "E98", error_code: "05", msg: "Declined" } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const tx = await processor.sale({
      money: { amountMinor: 2500, currency: "USD" },
      paymentToken: "tok",
      orderId: "INV-2",
    });

    expect(tx.outcome).toBe("declined");
    expect(tx.responseText).toBe("Declined");
  });

  it("classifies a 5xx as error (retryable), not a decline", async () => {
    const { fetchImpl } = stubFetch([{ status: 503, body: "" }]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const tx = await processor.sale({
      money: { amountMinor: 2500, currency: "USD" },
      paymentToken: "tok",
      orderId: "INV-3",
    });

    expect(tx.outcome).toBe("error");
  });
});

describe("createValorProcessor — createCustomer", () => {
  it("creates a customer profile then attaches the token, using vault header auth", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { code: 201, status: "OK", vault_customer_id: 12345 } },
      { status: 200, body: { code: 201, status: "OK", vault_payment_id: "pp_1" } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const result = await processor.createCustomer!({
      paymentToken: "tok_card",
      contact: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    });

    expect(result.success).toBe(true);
    expect(result.customerVaultId).toBe("12345");
    expect(result.processor).toBe("valor");
    expect(result.initialTransactionId).toBeNull();
    // Payment-profile id is carried in raw for the C4 migration to persist.
    expect(JSON.stringify(result.raw)).toContain("pp_1");

    // addcustomer: vault host, header creds, no epi in the body.
    expect(calls[0].url).toBe("https://vault.test/api/valor-vault/addcustomer");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Valor-App-ID"]).toBe("app-id");
    expect(headers["Valor-App-Key"]).toBe("app-key");
    expect(jsonBody(calls[0])).not.toHaveProperty("epi");

    // addpaymentprofiletoken references the returned vault customer id.
    expect(calls[1].url).toBe(
      "https://vault.test/api/valor-vault/addpaymentprofiletoken/12345"
    );
    expect(jsonBody(calls[1]).token).toBe("tok_card");
  });

  it("returns success:false (not a throw) when the vault rejects", async () => {
    const { fetchImpl } = stubFetch([
      { status: 400, body: { code: 400, status: "FAILED", error: ["Customer name already exist"] } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const result = await processor.createCustomer!({
      paymentToken: "tok",
      contact: { firstName: "Jane", lastName: "Doe" },
    });

    expect(result.success).toBe(false);
    expect(result.customerVaultId).toBe("");
    expect(result.responseText).toContain("Customer name already exist");
  });
});

describe("createValorProcessor — refund / void / lookup", () => {
  it("voids a sale via the void endpoint and approves on S00/00", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { error_no: "S00", error_code: "00", txn_id: "rev_1" } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const tx = await processor.voidSale({ transactionId: "txn_orig", reason: "test" });

    expect(tx.outcome).toBe("approved");
    expect(tx.processor).toBe("valor");
    expect(calls[0].url).toBe("https://txn.test/?void");
    const body = jsonBody(calls[0]);
    expect(body.txn_type).toBe("void");
    expect(body.ref_txn_id).toBe("txn_orig");
  });

  it("refunds (partial) via the refund endpoint with a formatted amount", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { error_no: "S00", error_code: "00", txn_id: "rev_2", rrn: "RRN9" } },
    ]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    const tx = await processor.refund({
      transactionId: "txn_orig",
      money: { amountMinor: 1250, currency: "USD" },
    });

    expect(tx.outcome).toBe("approved");
    expect(tx.transactionId).toBe("rev_2");
    expect(calls[0].url).toBe("https://txn.test/?refund");
    const body = jsonBody(calls[0]);
    expect(body.txn_type).toBe("refund");
    expect(body.ref_txn_id).toBe("txn_orig");
    expect(body.amount).toBe("12.50");
    expect(body.sale_refund).toBe("1");
  });

  it("requires an explicit amount — Valor has no full-refund shorthand", async () => {
    const { fetchImpl } = stubFetch([]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });

    await expect(processor.refund({ transactionId: "txn_orig" })).rejects.toMatchObject({
      code: "unsupported_operation",
    });
  });

  it("still throws unsupported_operation for getTransaction", async () => {
    const { fetchImpl } = stubFetch([]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });
    await expect(processor.getTransaction("t")).rejects.toMatchObject({
      code: "unsupported_operation",
    });
  });

  it("omits chargeCustomer (Valor bills via the subscription rail)", () => {
    const { fetchImpl } = stubFetch([]);
    const processor = createValorProcessor({ ...CREDS, endpoints: ENDPOINTS, fetchImpl });
    expect(processor.chargeCustomer).toBeUndefined();
  });
});

describe("createProcessor wiring", () => {
  it("routes a valor account + valor credentials to the Valor adapter", () => {
    const account = {
      id: "acc-1",
      merchantId: "m-1",
      locationId: null,
      processor: "valor",
      purpose: "invoice",
      isActive: true,
      isPrimary: true,
      valor: {
        merchantId: null,
        storeId: null,
        epi: null,
        appId: null,
        appKeyEncrypted: null,
        customerProfileId: null,
        paymentProfileId: null,
      },
      fees: { scheduleId: null, discRatePercent: null, residualBps: null, surchargePercent: null },
      nmi: { merchantId: null, customerVaultId: null },
      webhookSecretEncrypted: null,
    } satisfies ProcessorAccount;

    const processor = createProcessor(account, {
      processor: "valor",
      appId: "app-id",
      appKey: "app-key",
      epi: "2000000001",
    });

    expect(processor.name).toBe("valor");
    expect(typeof processor.sale).toBe("function");
  });
});
