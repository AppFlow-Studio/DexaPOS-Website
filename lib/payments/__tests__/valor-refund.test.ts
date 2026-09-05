import { describe, expect, it } from "vitest";
import {
  buildRefundRequestBody,
  buildVoidRequestBody,
  toReversalProcessorTransaction,
  createRefund,
  voidSale,
} from "../valor/refundApi";
import type { ValorRequestOptions } from "../valor/client";
import type { ValorEndpoints } from "../valor/config";

/**
 * [C5] Valor refund/void request-shape + outcome-classification tests. Fetch is
 * injected, so nothing leaves the machine. Schema pinned to Valor's docs
 * (2026-08-24): refund → /?refund txn_type "refund" { amount, ref_txn_id,
 * sale_refund, surchargeIndicator }; void → /?void txn_type "void" { ref_txn_id,
 * surchargeindicator }.
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
      typeof response.body === "string" ? response.body : JSON.stringify(response.body);
    return new Response(text, { status: response.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

describe("Valor refund/void request bodies", () => {
  it("builds a refund keyed by ref_txn_id with a required amount", () => {
    const body = buildRefundRequestBody(CREDS, {
      transactionId: "txn_1",
      money: { amountMinor: 4500, currency: "USD" },
    });
    expect(body.txn_type).toBe("refund");
    expect(body.ref_txn_id).toBe("txn_1");
    expect(body.amount).toBe("45.00");
    expect(body.sale_refund).toBe("1");
    expect(body.surchargeIndicator).toBe("0");
    expect(body).toMatchObject({ appid: "app-id", appkey: "app-key", epi: "2000000001" });
    // Never the sale's field name.
    expect(body.transaction_id).toBeUndefined();
  });

  it("carries the original auth_code + rrn when supplied (partial amount)", () => {
    const body = buildRefundRequestBody(CREDS, {
      transactionId: "txn_1",
      money: { amountMinor: 1250, currency: "USD" },
      authCode: "AUTH9",
      rrn: "RRN123",
    });
    expect(body.amount).toBe("12.50");
    expect(body.auth_code).toBe("AUTH9");
    expect(body.rrn).toBe("RRN123");
  });

  it("rejects a zero-amount or over-cap refund", () => {
    expect(() =>
      buildRefundRequestBody(CREDS, { transactionId: "t", money: { amountMinor: 0, currency: "USD" } })
    ).toThrow(RangeError);
    expect(() =>
      buildRefundRequestBody(CREDS, {
        transactionId: "t",
        money: { amountMinor: 10_000_000, currency: "USD" },
      })
    ).toThrow(RangeError);
  });

  it("builds a void keyed by ref_txn_id, amount optional", () => {
    const body = buildVoidRequestBody(CREDS, { transactionId: "txn_9" });
    expect(body.txn_type).toBe("void");
    expect(body.ref_txn_id).toBe("txn_9");
    expect(body.surchargeindicator).toBe("0");
    expect(body.amount).toBeUndefined();
  });

  it("keeps refund and void on the sale's resolved surcharge mode", () => {
    const refund = buildRefundRequestBody(
      CREDS,
      {
        transactionId: "txn_1",
        money: { amountMinor: 500, currency: "USD" },
      },
      "1"
    );
    const voidBody = buildVoidRequestBody(CREDS, { transactionId: "txn_1" }, "1");
    expect(refund.surchargeIndicator).toBe("1");
    expect(voidBody.surchargeindicator).toBe("1");
  });
});

describe("Valor reversal outcome classification", () => {
  it("approves on S00/00 and reads txnid or txn_id", () => {
    const tx = toReversalProcessorTransaction({
      status: 200,
      body: { error_no: "S00", error_code: "00", txnid: "5210759", approval_code: "111111", rrn: "R1" },
    });
    expect(tx.outcome).toBe("approved");
    expect(tx.transactionId).toBe("5210759");
    expect(tx.authCode).toBe("111111");
    expect(tx.processor).toBe("valor");
  });

  it("declines on a 4xx business error", () => {
    const tx = toReversalProcessorTransaction({
      status: 400,
      body: { error_no: "E01", error_code: "12", response_text: "Already reversed" },
    });
    expect(tx.outcome).toBe("declined");
    expect(tx.responseText).toBe("Already reversed");
  });

  it("errors on a 5xx transport failure", () => {
    const tx = toReversalProcessorTransaction({ status: 503, body: {} });
    expect(tx.outcome).toBe("error");
    expect(tx.responseText).toMatch(/could not be completed/i);
  });
});

describe("Valor refund/void transport", () => {
  it("posts a refund to the refund endpoint and approves", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { error_no: "S00", error_code: "00", txnid: "rev_1" } },
    ]);
    const options: ValorRequestOptions = { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl };

    const tx = await createRefund(options, {
      transactionId: "txn_orig",
      money: { amountMinor: 500, currency: "USD" },
    });

    expect(tx.outcome).toBe("approved");
    expect(tx.transactionId).toBe("rev_1");
    expect(calls[0].url).toBe("https://txn.test/?refund");
    expect(jsonBody(calls[0])).toMatchObject({
      txn_type: "refund",
      ref_txn_id: "txn_orig",
      amount: "5.00",
      sale_refund: "1",
    });
  });

  it("posts a void to the void endpoint", async () => {
    const { fetchImpl, calls } = stubFetch([
      { status: 200, body: { error_no: "S00", error_code: "00", txnid: "rev_2" } },
    ]);
    const options: ValorRequestOptions = { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl };

    await voidSale(options, { transactionId: "txn_orig" });
    expect(calls[0].url).toBe("https://txn.test/?void");
    expect(jsonBody(calls[0])).toMatchObject({ txn_type: "void", ref_txn_id: "txn_orig" });
  });
});
