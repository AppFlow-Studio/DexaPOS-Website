import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSaleRequestBody as nodeBuildSaleRequestBody } from "../valor/saleApi";
import {
  buildRefundRequestBody as nodeBuildRefundRequestBody,
  buildVoidRequestBody as nodeBuildVoidRequestBody,
} from "../valor/refundApi";
import {
  buildRefundRequestBody as denoBuildRefundRequestBody,
  buildSaleRequestBody as denoBuildSaleRequestBody,
  buildVoidRequestBody as denoBuildVoidRequestBody,
  resolveValorSurchargeIndicator as denoResolveValorSurchargeIndicator,
  toReversalResult,
  toSaleResult,
} from "../../../supabase/functions/_shared/valor";

/**
 * [C3] Golden-body parity: the create-online-order edge function charges through
 * a Deno port of the Valor sale call (supabase/functions/_shared/valor.ts). The
 * Node source of truth is lib/payments/valor/saleApi.ts. If the two request
 * bodies ever diverge, a storefront charge would be shaped differently from every
 * other Valor rail — so this test pins them equal. Only the amount input differs
 * (Node carries `money: Money`, Deno carries `amountMinor`); every emitted field
 * must match byte-for-byte.
 */

const CREDS = { appId: "app-123", appKey: "key-456", epi: "2000000001" };

/** Same inputs, expressed in each module's param shape. */
function cases() {
  return [
    {
      name: "full order with tip + tax + contact + lines",
      amountMinor: 4599,
      shared: {
        token: "passage-tok",
        invoiceNumber: "dexa-abc-123",
        productLines: [{ product_id: "item-1", qty: 2 }],
        taxMinor: 380,
        tipMinor: 700,
        orderDescription: "Online order dexa-abc-123",
        email: "jane@example.com",
        phone: "5125550123",
        address1: "1 Main St",
        zip: "85284",
        shippingCountry: "US",
      },
    },
    {
      name: "minimal: no tip / tax / contact",
      amountMinor: 1000,
      shared: {
        token: "tok-2",
        invoiceNumber: "inv-2",
        productLines: [],
      },
    },
    {
      name: "tip present, tax absent",
      amountMinor: 2550,
      shared: {
        token: "tok-3",
        invoiceNumber: "inv-3",
        productLines: [],
        tipMinor: 250,
      },
    },
  ];
}

describe("Valor storefront Deno/Node sale-body parity", () => {
  for (const c of cases()) {
    it(c.name, () => {
      const nodeBody = nodeBuildSaleRequestBody(CREDS, {
        money: { amountMinor: c.amountMinor, currency: "USD" },
        ...c.shared,
      });
      const denoBody = denoBuildSaleRequestBody(CREDS, {
        amountMinor: c.amountMinor,
        ...c.shared,
      });
      expect(denoBody).toEqual(nodeBody);
    });
  }

  it("defaults the surcharge indicator to string '0'", () => {
    const body = denoBuildSaleRequestBody(CREDS, {
      amountMinor: 1000,
      token: "t",
      invoiceNumber: "i",
      productLines: [],
    });
    expect(body.surchargeIndicator).toBe("0");
    expect(body.amount).toBe("10.00");
  });

  it("rejects a zero / negative / non-integer amount", () => {
    for (const bad of [0, -1, 10.5]) {
      expect(() =>
        denoBuildSaleRequestBody(CREDS, {
          amountMinor: bad,
          token: "t",
          invoiceNumber: "i",
          productLines: [],
        }),
      ).toThrow(RangeError);
    }
  });
});

describe("Valor storefront Deno toSaleResult classification", () => {
  it("approved on error_no S00 + error_code 00", () => {
    const r = toSaleResult(200, {
      error_no: "S00",
      error_code: "00",
      txn_id: "T1",
      approval_code: "A1",
    });
    expect(r.outcome).toBe("approved");
    expect(r.success).toBe(true);
    expect(r.details.transactionId).toBe("T1");
    expect(r.details.authCode).toBe("A1");
  });

  it("declined on a 4xx business error (retry another card)", () => {
    const r = toSaleResult(400, {
      error_no: "E98",
      error_code: "05",
      msg: "Declined",
    });
    expect(r.outcome).toBe("declined");
    expect(r.success).toBe(false);
    expect(r.details.responseText).toBe("Declined");
  });

  it("keeps the sandbox surcharge request body identical in Node and Deno", () => {
    const nodeBody = nodeBuildSaleRequestBody(
      CREDS,
      {
        money: { amountMinor: 1000, currency: "USD" },
        token: "t",
        invoiceNumber: "i",
        productLines: [],
      },
      "1"
    );
    const denoBody = denoBuildSaleRequestBody(
      CREDS,
      {
        amountMinor: 1000,
        token: "t",
        invoiceNumber: "i",
        productLines: [],
      },
      "1"
    );
    expect(denoBody).toEqual(nodeBody);
  });

  it("supports the public sandbox EPI without a secret", () => {
    expect(
      denoResolveValorSurchargeIndicator("2412333540", {
        VALOR_ENV: "sandbox",
      })
    ).toBe("1");
    expect(
      denoResolveValorSurchargeIndicator("2412333540", {
        VALOR_ENV: "production",
      })
    ).toBe("0");
  });

  it("keeps an additional Deno QA override exact-EPI and sandbox-only", () => {
    const sandboxEnv = {
      VALOR_ENV: "sandbox",
      VALOR_QA_SURCHARGE_EPI: CREDS.epi,
    };
    expect(denoResolveValorSurchargeIndicator(CREDS.epi, sandboxEnv)).toBe("1");
    expect(denoResolveValorSurchargeIndicator("2000000002", sandboxEnv)).toBe("0");
    expect(
      denoResolveValorSurchargeIndicator(CREDS.epi, {
        ...sandboxEnv,
        VALOR_ENV: "production",
      })
    ).toBe("0");
  });

  it("reports the detailed cause for a 4xx gateway configuration error", () => {
    const r = toSaleResult(400, {
      error_no: "D06",
      msg: "PROCESSING ERROR",
      desc: "NOT A VALID APP ID",
    });
    expect(r.outcome).toBe("error");
    expect(r.details.responseCode).toBe("D06");
    expect(r.details.responseText).toBe("NOT A VALID APP ID");
  });

  it("error on 5xx transport failure (retry same card)", () => {
    const r = toSaleResult(502, {});
    expect(r.outcome).toBe("error");
    expect(r.success).toBe(false);
    expect(r.details.responseText).toMatch(/temporarily unavailable/i);
  });
});

describe("Valor storefront Deno/Node reversal-body parity", () => {
  it("builds the documented full refund body", () => {
    const nodeBody = nodeBuildRefundRequestBody(CREDS, {
      transactionId: "sale-123",
      money: { amountMinor: 4599, currency: "USD" },
      authCode: "AUTH1",
      rrn: "RRN1",
      invoiceNumber: "INV1",
    });
    const denoBody = denoBuildRefundRequestBody(CREDS, {
      transactionId: "sale-123",
      amountMinor: 4599,
      authCode: "AUTH1",
      rrn: "RRN1",
      invoiceNumber: "INV1",
    });

    expect(denoBody).toEqual(nodeBody);
    expect(denoBody.sale_refund).toBe("1");
    expect(denoBody.surchargeIndicator).toBe("0");
  });

  it("builds the documented void body", () => {
    const nodeBody = nodeBuildVoidRequestBody(CREDS, {
      transactionId: "sale-456",
    });
    const denoBody = denoBuildVoidRequestBody(CREDS, {
      transactionId: "sale-456",
    });

    expect(denoBody).toEqual(nodeBody);
    expect(denoBody.surchargeindicator).toBe("0");
  });

  it("keeps surcharge-mode refund and void bodies in parity", () => {
    const nodeRefund = nodeBuildRefundRequestBody(
      CREDS,
      {
        transactionId: "sale-123",
        money: { amountMinor: 500, currency: "USD" },
      },
      "1"
    );
    const denoRefund = denoBuildRefundRequestBody(
      CREDS,
      { transactionId: "sale-123", amountMinor: 500 },
      "1"
    );
    const nodeVoid = nodeBuildVoidRequestBody(CREDS, { transactionId: "sale-123" }, "1");
    const denoVoid = denoBuildVoidRequestBody(CREDS, { transactionId: "sale-123" }, "1");
    expect(denoRefund).toEqual(nodeRefund);
    expect(denoVoid).toEqual(nodeVoid);
  });

  it("rejects invalid refund amounts", () => {
    for (const bad of [0, -1, 10.5]) {
      expect(() =>
        denoBuildRefundRequestBody(CREDS, {
          transactionId: "sale-123",
          amountMinor: bad,
        }),
      ).toThrow(RangeError);
    }
  });
});

describe("Valor storefront Deno reversal classification", () => {
  it("recognizes a successful Valor reversal", () => {
    const result = toReversalResult(200, {
      error_no: "S00",
      error_code: "00",
      txnid: "refund-1",
      approval_code: "APPROVED",
      rrn: "rrn-1",
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("approved");
    expect(result.details.transactionId).toBe("refund-1");
    expect(result.details.rrn).toBe("rrn-1");
  });

  it("keeps a transport failure distinct from a decline", () => {
    expect(toReversalResult(502, {}).outcome).toBe("error");
    expect(
      toReversalResult(400, {
        error_no: "D01",
        error_code: "05",
        response_text: "Already settled",
      }).outcome,
    ).toBe("declined");
  });
});

describe("Valor storefront Deno module hygiene", () => {
  it("never logs the app key or card token", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, "../../../supabase/functions/_shared/valor.ts"),
      "utf8",
    );
    // No console call anywhere near a credential/token identifier.
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*app[kK]ey/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\btoken\b/);
  });
});
