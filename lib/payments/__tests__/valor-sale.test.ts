import { describe, expect, it } from "vitest";
import {
  isValidEpi,
  readValorEnvironment,
  resolveValorEndpoints,
} from "../valor/config";
import {
  buildSaleRequestBody,
  isValorSuccess,
  toProcessorTransaction,
} from "../valor/saleApi";

const credentials = {
  appId: "a".repeat(32),
  appKey: "b".repeat(32),
  epi: "2000000001",
};

const baseParams = {
  money: { amountMinor: 2550, currency: "USD" },
  token: "card-token-1",
  invoiceNumber: "INV-1",
  productLines: [{ product_id: "latte", qty: 1 }],
};

describe("resolveValorEndpoints", () => {
  it("defaults to sandbox when VALOR_ENV is unset", () => {
    const endpoints = resolveValorEndpoints({});
    expect(endpoints.environment).toBe("sandbox");
    expect(endpoints.isDemo).toBe(true);
  });

  it("puts client-token and transaction calls on different ports", () => {
    // Doc drift: the arch parent records one sandbox base URL, but
    // GetClientToken is on :4430 and Direct Sale Token on :443.
    const endpoints = resolveValorEndpoints({});
    expect(endpoints.clientTokenBaseUrl).toContain(":4430");
    expect(endpoints.transactionBaseUrl).toContain(":443");
  });

  it("refuses production without an explicit base URL", () => {
    // Guessing a production hostname in a module that moves money is the
    // failure this guard exists to prevent.
    expect(() => resolveValorEndpoints({ VALOR_ENV: "production" })).toThrow(
      /VALOR_BASE_URL/
    );
  });

  it("accepts production with all explicit host URLs and disables demo mode", () => {
    // Production needs all four hosts supplied — the APIs are spread across
    // transaction, vault and boarding hosts and none may be guessed.
    const endpoints = resolveValorEndpoints({
      VALOR_ENV: "production",
      VALOR_BASE_URL: "https://securelink.example.com/",
      VALOR_VAULT_BASE_URL: "https://vault.example.com/",
      VALOR_BOARDING_BASE_URL: "https://boarding.example.com/",
    });
    expect(endpoints.isDemo).toBe(false);
    expect(endpoints.transactionBaseUrl).toBe("https://securelink.example.com");
    expect(endpoints.clientTokenBaseUrl).toBe("https://securelink.example.com");
    expect(endpoints.vaultBaseUrl).toBe("https://vault.example.com");
    expect(endpoints.boardingBaseUrl).toBe("https://boarding.example.com");
  });

  it("treats any unrecognized VALOR_ENV as sandbox", () => {
    // Failing closed toward sandbox keeps a typo from charging real cards.
    expect(readValorEnvironment({ VALOR_ENV: "staging" })).toBe("sandbox");
    expect(readValorEnvironment({ VALOR_ENV: "PRODUCTION" })).toBe("sandbox");
  });
});

describe("isValidEpi", () => {
  it("accepts a 10-digit EPI starting with 2", () => {
    expect(isValidEpi("2000000001")).toBe(true);
  });

  it("rejects wrong length or wrong leading digit", () => {
    expect(isValidEpi("250115757")).toBe(false);
    expect(isValidEpi("20000000010")).toBe(false);
    expect(isValidEpi("3501157577")).toBe(false);
    expect(isValidEpi("20000000a1")).toBe(false);
  });
});

describe("buildSaleRequestBody", () => {
  it("always sends surchargeIndicator '0' as a string", () => {
    // Web is card-only. Sending "1" would add an unauthorized surcharge to a
    // customer's card even though the merchant is boarded surcharge-enabled.
    const body = buildSaleRequestBody(credentials, baseParams);
    expect(body.surchargeIndicator).toBe("0");
    expect(typeof body.surchargeIndicator).toBe("string");
  });

  it("formats amounts as major-unit strings", () => {
    const body = buildSaleRequestBody(credentials, baseParams);
    expect(body.amount).toBe("25.50");
  });

  it("defaults shipping_country to US", () => {
    expect(buildSaleRequestBody(credentials, baseParams).shipping_country).toBe(
      "US"
    );
  });

  it("identifies tokenized checkout as Passage.js and omits empty product lines", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      productLines: [],
    });
    expect(body.ecomm_channel).toBe("passagejs");
    expect(body.productIds).toBeUndefined();
  });

  it("normalizes fields to Valor's documented Passage.js limits", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      invoiceNumber: "dexa-12345678-abcdef",
      orderDescription: "Online order: dexa-12345678-abcdef!",
      email: `${"a".repeat(55)}@example.com`,
      phone: "+1 (512) 555-0123",
      address1: "1 Main St ".repeat(20),
      zip: "85284-1234",
    });

    expect(body.invoicenumber).toBe("345678abcdef");
    expect(body.invoicenumber).toMatch(/^[A-Za-z0-9]{1,12}$/);
    expect("cardholdername" in body).toBe(false);
    expect(body.orderdescription).toBe("Online order dexa 12345678 abcdef");
    expect(body.email).toBeUndefined();
    expect(body.phone).toBe("5125550123");
    expect(body.address1).toHaveLength(100);
    expect(body.zip).toBe("85284");
  });

  it("omits malformed optional phone and ZIP values", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      phone: "123",
      zip: "12",
    });
    expect(body.phone).toBeUndefined();
    expect(body.zip).toBeUndefined();
  });

  it("rejects an invoice number with no alphanumeric characters", () => {
    expect(() =>
      buildSaleRequestBody(credentials, {
        ...baseParams,
        invoiceNumber: "---",
      })
    ).toThrow(/invoice number/i);
  });

  it("omits optional fields rather than sending empty strings", () => {
    const body = buildSaleRequestBody(credentials, baseParams);
    expect("email" in body).toBe(false);
    expect("tax_amount" in body).toBe(false);
    expect("tip" in body).toBe(false);
  });

  it("includes tax but leaves tip inside the grand total", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      taxMinor: 225,
      tipMinor: 500,
    });
    expect(body.tax_amount).toBe("2.25");
    expect("tip" in body).toBe(false);
  });

  it("rejects a zero-amount sale", () => {
    expect(() =>
      buildSaleRequestBody(credentials, {
        ...baseParams,
        money: { amountMinor: 0, currency: "USD" },
      })
    ).toThrow(RangeError);
  });

  it("rejects amounts above Valor's $99,999.99 cap", () => {
    expect(() =>
      buildSaleRequestBody(credentials, {
        ...baseParams,
        money: { amountMinor: 10_000_000, currency: "USD" },
      })
    ).toThrow(/99,999.99/);
  });

  it("accepts exactly the cap", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      money: { amountMinor: 9_999_999, currency: "USD" },
    });
    expect(body.amount).toBe("99999.99");
  });
});

describe("isValorSuccess", () => {
  it("requires both error_no S00 and error_code 00", () => {
    expect(isValorSuccess({ error_no: "S00", error_code: "00" })).toBe(true);
    expect(isValorSuccess({ error_no: "S00", error_code: "01" })).toBe(false);
    expect(isValorSuccess({})).toBe(false);
  });
});

describe("toProcessorTransaction", () => {
  it("maps a success response to approved", () => {
    const tx = toProcessorTransaction({
      status: 200,
      body: { error_no: "S00", error_code: "00", txn_id: "T1", approval_code: "A1" },
    });
    expect(tx.outcome).toBe("approved");
    expect(tx.transactionId).toBe("T1");
    expect(tx.authCode).toBe("A1");
    expect(tx.processor).toBe("valor");
  });

  it("maps Valor's documented Passage.js response field names", () => {
    const tx = toProcessorTransaction({
      status: 200,
      body: {
        error_no: "S00",
        error_code: "00",
        txnid: "10337052",
        approval_code: "TAS678",
        msg: "APPROVED",
      },
    });
    expect(tx.transactionId).toBe("10337052");
    expect(tx.responseText).toBe("APPROVED");
  });

  it("treats a 5xx as retryable error, not a decline", () => {
    expect(toProcessorTransaction({ status: 502, body: {} }).outcome).toBe("error");
  });

  it("treats a documented E98 card rejection as a decline", () => {
    const tx = toProcessorTransaction({
      status: 400,
      body: { error_no: "E98", error_code: "05", msg: "Do not honor" },
    });
    expect(tx.outcome).toBe("declined");
    expect(tx.responseText).toBe("Do not honor");
  });

  it("surfaces the detailed cause for Valor processing errors", () => {
    const tx = toProcessorTransaction({
      status: 400,
      body: {
        error_no: "D06",
        msg: "PROCESSING ERROR",
        desc: "NOT A VALID APP ID",
      },
    });
    expect(tx.outcome).toBe("error");
    expect(tx.responseCode).toBe("D06");
    expect(tx.responseText).toBe("NOT A VALID APP ID");
  });

  it("falls back to a customer-safe message when none is given", () => {
    const tx = toProcessorTransaction({ status: 400, body: {} });
    expect(tx.responseText).toMatch(/temporarily unavailable/i);
  });
});
