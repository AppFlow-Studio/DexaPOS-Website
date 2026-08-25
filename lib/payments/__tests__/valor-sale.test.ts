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

  it("omits optional fields rather than sending empty strings", () => {
    const body = buildSaleRequestBody(credentials, baseParams);
    expect("email" in body).toBe(false);
    expect("tax_amount" in body).toBe(false);
    expect("tip" in body).toBe(false);
  });

  it("includes tax and tip when provided", () => {
    const body = buildSaleRequestBody(credentials, {
      ...baseParams,
      taxMinor: 225,
      tipMinor: 500,
    });
    expect(body.tax_amount).toBe("2.25");
    expect(body.tip).toBe("5.00");
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

  it("treats a 5xx as retryable error, not a decline", () => {
    expect(toProcessorTransaction({ status: 502, body: {} }).outcome).toBe("error");
  });

  it("treats a 400 with a failure code as a decline", () => {
    const tx = toProcessorTransaction({
      status: 400,
      body: { error_no: "F01", error_code: "05", error_message: "Do not honor" },
    });
    expect(tx.outcome).toBe("declined");
    expect(tx.responseText).toBe("Do not honor");
  });

  it("falls back to a customer-safe message when none is given", () => {
    const tx = toProcessorTransaction({ status: 400, body: {} });
    expect(tx.responseText).toMatch(/declined/i);
  });
});
