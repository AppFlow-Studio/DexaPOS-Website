import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNmiSale,
  createNmiVaultCustomer,
  createNmiVaultSale,
  getNmiTransaction,
  refundNmiSale,
  voidNmiSale,
} from "../nmi";

/**
 * Characterization tests for the existing NMI client.
 *
 * C2 requires the NMI call sites to keep passing regression tests through the
 * `PaymentProcessor` refactor — but no tests covered `nmi.ts`. These pin down
 * what NMI actually receives today, so "no functional change" is a verifiable
 * claim rather than an assertion.
 *
 * They stub global fetch; no request leaves the machine.
 */

interface RecordedCall {
  url: string;
  init: RequestInit;
}

let calls: RecordedCall[] = [];
const realFetch = globalThis.fetch;

function stubFetch(responses: Array<{ status: number; body: string }>) {
  let index = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(response.body, { status: response.status });
  }) as unknown as typeof fetch;
}

function formBody(index = 0): URLSearchParams {
  return new URLSearchParams(String(calls[index].init.body));
}

function jsonBody(index = 0): Record<string, unknown> {
  return JSON.parse(String(calls[index].init.body)) as Record<string, unknown>;
}

const config = { apiKey: "test-key" };
const APPROVED_CLASSIC =
  "response=1&responsetext=SUCCESS&authcode=123456&transactionid=987654&orderid=ORDER-1";
const APPROVED_JSON = JSON.stringify({
  response_code: "100",
  response_text: "Approved",
  authcode: "654321",
  transactionid: "111222",
});

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("createNmiSale endpoint selection", () => {
  it("uses the classic form endpoint when any billing field is present", () => {
    // The classic endpoint is preferred whenever order or billing data exists,
    // because the v5 JSON API rejects those submissions.
    stubFetch([{ status: 200, body: APPROVED_CLASSIC }]);

    return createNmiSale(config, {
      amount: 25.5,
      paymentToken: "tok",
      orderId: "ORDER-1",
    }).then(() => {
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/api/transact.php");
      expect(formBody().get("type")).toBe("sale");
      expect(formBody().get("security_key")).toBe("test-key");
    });
  });

  it("formats the classic amount to exactly two decimals", async () => {
    stubFetch([{ status: 200, body: APPROVED_CLASSIC }]);
    await createNmiSale(config, {
      amount: 25.5,
      paymentToken: "tok",
      orderId: "O",
    });
    expect(formBody().get("amount")).toBe("25.50");
  });

  it("uses the v5 JSON endpoint when no billing fields are present", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await createNmiSale(config, { amount: 10, paymentToken: "tok" });

    expect(calls[0].url).toContain("/api/v5/payments/sale");
    expect(jsonBody().amount).toBe(10);
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization
    ).toBe("test-key");
  });

  it("defaults currency to USD and industry to ecommerce", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await createNmiSale(config, { amount: 10, paymentToken: "tok" });
    expect(jsonBody().currency).toBe("USD");
    expect(jsonBody().industry).toBe("ecommerce");
  });

  it("retries on the classic endpoint when v5 rejects the submission", async () => {
    // Documented fallback: a 400 carrying E_INVALID_SUBMISSION re-runs the
    // charge as a classic form post rather than surfacing a failure.
    stubFetch([
      { status: 400, body: JSON.stringify({ code: "E_INVALID_SUBMISSION" }) },
      { status: 200, body: APPROVED_CLASSIC },
    ]);

    const result = await createNmiSale(config, {
      amount: 10,
      paymentToken: "tok",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("/api/transact.php");
    expect(result.success).toBe(true);
  });

  it("does not retry a 400 that is not an invalid submission", async () => {
    stubFetch([{ status: 400, body: JSON.stringify({ response_code: "200" }) }]);
    await createNmiSale(config, { amount: 10, paymentToken: "tok" });
    expect(calls).toHaveLength(1);
  });
});

describe("approval detection", () => {
  it("treats response=1 as approved", async () => {
    stubFetch([{ status: 200, body: APPROVED_CLASSIC }]);
    const result = await createNmiSale(config, {
      amount: 10,
      paymentToken: "tok",
      orderId: "O",
    });
    expect(result.success).toBe(true);
    expect(result.details.authCode).toBe("123456");
    expect(result.details.transactionId).toBe("987654");
  });

  it("treats response_code=100 as approved", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    const result = await createNmiSale(config, {
      amount: 10,
      paymentToken: "tok",
    });
    expect(result.success).toBe(true);
  });

  it("treats a declined response as not successful", async () => {
    stubFetch([
      {
        status: 200,
        body: "response=2&responsetext=DECLINE&transactionid=555",
      },
    ]);
    const result = await createNmiSale(config, {
      amount: 10,
      paymentToken: "tok",
      orderId: "O",
    });
    expect(result.success).toBe(false);
    expect(result.details.responseText).toBe("DECLINE");
  });
});

describe("void / refund / lookup", () => {
  it("posts to the void path", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await voidNmiSale(config, "TX1", "customer cancelled");
    expect(calls[0].url).toContain("/api/v5/payments/TX1/void");
    expect(jsonBody().void_reason).toBe("customer cancelled");
  });

  it("posts to the refund path and includes a partial amount", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await refundNmiSale(config, "TX1", { amount: 5 });
    expect(calls[0].url).toContain("/api/v5/payments/TX1/refund");
    expect(jsonBody().amount).toBe(5);
  });

  it("omits the amount for a full refund", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await refundNmiSale(config, "TX1");
    expect("amount" in jsonBody()).toBe(false);
  });

  it("looks a transaction up with GET", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await getNmiTransaction(config, "TX1");
    expect(calls[0].url).toContain("/api/v5/payments/TX1");
    expect(calls[0].init.method).toBe("GET");
  });
});

describe("customer vault", () => {
  it("extracts the vault id from a nested customer object", async () => {
    stubFetch([
      {
        status: 200,
        body: JSON.stringify({
          customer: { id: "CUST-1" },
          transaction_id: "TX-9",
        }),
      },
    ]);

    const result = await createNmiVaultCustomer(config, { paymentToken: "tok" });
    expect(result.success).toBe(true);
    expect(result.vault.customerVaultId).toBe("CUST-1");
    expect(result.vault.initialTransactionId).toBe("TX-9");
  });

  it("falls back to the classic add_customer form on invalid submission", async () => {
    stubFetch([
      { status: 400, body: JSON.stringify({ code: "E_INVALID_SUBMISSION" }) },
      { status: 200, body: "response=1&customer_vault_id=CUST-2" },
    ]);

    const result = await createNmiVaultCustomer(config, { paymentToken: "tok" });
    expect(calls).toHaveLength(2);
    expect(formBody(1).get("customer_vault")).toBe("add_customer");
    expect(result.vault.customerVaultId).toBe("CUST-2");
  });

  it("charges a stored vault id", async () => {
    stubFetch([{ status: 200, body: APPROVED_JSON }]);
    await createNmiVaultSale(config, { amount: 99, customerVaultId: "CUST-1" });

    const payload = jsonBody().payment_details as Record<string, unknown>;
    expect(payload.customer_vault_id).toBe("CUST-1");
  });
});
