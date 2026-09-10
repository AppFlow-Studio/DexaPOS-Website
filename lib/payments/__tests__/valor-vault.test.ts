import { describe, expect, it } from "vitest";
import { extractValorError, isValorSuccess } from "../valor/client";
import {
  buildAddCustomerBody,
  readPaymentProfileId,
  sanitizeCustomerName,
} from "../valor/customerProfileApi";
import {
  assertValidChargeOn,
  buildAddSubscriptionBody,
  formatSubscriptionDate,
  RECURRING_TYPE,
} from "../valor/subscriptionApi";
import {
  buildHostedPageBody,
  readHostedPageUrl,
} from "../valor/hostedPageApi";

describe("isValorSuccess", () => {
  it("accepts both success dialects Valor uses", () => {
    // securelink hosts answer error_no/error_code; the vault host answers
    // code/status. One helper has to understand both.
    expect(isValorSuccess({ error_no: "S00", error_code: "00" })).toBe(true);
    expect(isValorSuccess({ code: 201, status: "OK" })).toBe(true);
    expect(isValorSuccess({ code: 400 })).toBe(false);
    expect(isValorSuccess({})).toBe(false);
  });
});

describe("extractValorError", () => {
  it("reads the vault's error array", () => {
    expect(extractValorError({ error: ["Customer name already exist"] })).toBe(
      "Customer name already exist"
    );
    expect(extractValorError({ errors: ["Customer name already exist"] })).toBe(
      "Customer name already exist"
    );
  });

  it("falls back through the flat message fields", () => {
    expect(extractValorError({ error_message: "Do not honor" })).toBe(
      "Do not honor"
    );
    expect(extractValorError({})).toBeNull();
  });
});

describe("sanitizeCustomerName", () => {
  it("strips characters Valor's letters-only rule rejects", () => {
    // Valor caps customer_name at 25 chars, alphabet only. Real names have
    // apostrophes and hyphens, so unsanitized input fails at the gateway.
    expect(sanitizeCustomerName("O'Brien-Smith")).toBe("OBrienSmith");
    expect(sanitizeCustomerName("Acme Café 123")).toBe("Acme Cafe");
  });

  it("keeps accented letters as their base letter", () => {
    expect(sanitizeCustomerName("José")).toBe("Jose");
  });

  it("truncates to 25 characters without leaving a trailing space", () => {
    const result = sanitizeCustomerName("A".repeat(20) + " " + "B".repeat(20));
    expect(result.length).toBeLessThanOrEqual(25);
    expect(result).toBe(result.trim());
  });
});

describe("buildAddCustomerBody", () => {
  it("always sends at least one labelled address", () => {
    const body = buildAddCustomerBody({ customerName: "Jane Doe" });
    expect(body.address_details).toHaveLength(1);
    expect(body.address_details[0].address_label).toBe("primary");
  });

  it("strips non-digits from the phone", () => {
    const body = buildAddCustomerBody({
      customerName: "Jane Doe",
      phone: "(480) 555-0100",
    });
    expect(body.customer_phone).toBe("4805550100");
  });

  it("throws when the name sanitizes away to nothing", () => {
    // "12345" has no letters, so Valor would reject an empty customer_name
    // with an opaque error. Fail here instead, where the cause is obvious.
    expect(() => buildAddCustomerBody({ customerName: "12345" })).toThrow(
      RangeError
    );
  });
});

describe("readPaymentProfileId", () => {
  it("probes the plausible key names", () => {
    expect(readPaymentProfileId({ payment_id: 88 })).toBe("88");
    expect(readPaymentProfileId({ vault_payment_id: "vp-1" })).toBe("vp-1");
  });

  it("returns null rather than inventing an id", () => {
    // Valor documents an empty response body here, so the real key is unknown.
    // Null forces the caller to notice; a fabricated id would be stored.
    expect(readPaymentProfileId({ unrelated: "x" })).toBeNull();
  });
});

describe("formatSubscriptionDate", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(formatSubscriptionDate(new Date("2026-09-01T00:00:00Z"))).toBe(
      "2026-09-01"
    );
  });

  it("zero-pads month and day", () => {
    expect(formatSubscriptionDate(new Date("2026-01-05T00:00:00Z"))).toBe(
      "2026-01-05"
    );
  });

  it("rejects an invalid date", () => {
    expect(() => formatSubscriptionDate(new Date("nope"))).toThrow(RangeError);
  });
});

describe("assertValidChargeOn", () => {
  it("treats charge_on as day-of-week for weekly intervals", () => {
    // Valor overloads one field with two meanings depending on recurring_type,
    // so 15 is valid monthly but nonsense weekly.
    expect(() => assertValidChargeOn("weekly", 6)).not.toThrow();
    expect(() => assertValidChargeOn("weekly", 15)).toThrow(RangeError);
    expect(() => assertValidChargeOn("biWeekly", 7)).toThrow(RangeError);
  });

  it("treats charge_on as day-of-month otherwise", () => {
    expect(() => assertValidChargeOn("monthly", 15)).not.toThrow();
    expect(() => assertValidChargeOn("monthly", 0)).toThrow(RangeError);
    expect(() => assertValidChargeOn("monthly", 31)).toThrow(RangeError);
  });
});

describe("buildAddSubscriptionBody", () => {
  const base = {
    money: { amountMinor: 9900, currency: "USD" },
    interval: "monthly" as const,
    chargeOn: 1,
    startsOn: new Date("2026-09-01T00:00:00Z"),
    vaultCustomerId: "1234",
    billingCustomerName: "Joes Coffee",
    billingZip: "85284",
  };

  it("defaults subscriptions to the traditional MID", () => {
    const body = buildAddSubscriptionBody(base);
    expect(body.surchargeIndicator).toBe("0");
    expect(body.surchargeAmount).toBe("0.00");
  });

  it("maps billing input to Valor's documented billing and shipping fields", () => {
    const body = buildAddCustomerBody({
      customerName: "Jane Doe",
      address: {
        customer_name: "Jane Doe",
        street_number: "8320",
        street_name: "Main Street",
        unit: "1",
        city: "Tempe",
        state: "AZ",
        zip: "85284",
      },
    });
    expect(body.address_details[0]).toMatchObject({
      billing_customer_name: "Jane Doe",
      billing_street_no: "8320",
      billing_street_name: "Main Street",
      billing_unit: "1",
      billing_city: "Tempe",
      billing_state: "AZ",
      billing_zip: "85284",
      shipping_customer_name: "Jane Doe",
      shipping_street_no: "8320",
      shipping_street_name: "Main Street",
      shipping_unit: "1",
      shipping_city: "Tempe",
      shipping_state: "AZ",
      shipping_zip: "85284",
    });
    expect(body.address_details[0]).not.toHaveProperty("street_number");
    expect(body.address_details[0]).not.toHaveProperty("zip");
  });

  it("supports an explicitly resolved sandbox surcharge MID", () => {
    const body = buildAddSubscriptionBody(base, "1");
    expect(body.surchargeIndicator).toBe("1");
    expect(body.surchargeAmount).toBe("0.00");
  });

  it("maps the interval to Valor's numeric enum", () => {
    expect(buildAddSubscriptionBody(base).recurring_type).toBe(
      RECURRING_TYPE.monthly
    );
    expect(
      buildAddSubscriptionBody({ ...base, interval: "weekly", chargeOn: 1 })
        .recurring_type
    ).toBe(RECURRING_TYPE.weekly);
  });

  it("defaults to charging immediately and never expiring", () => {
    const body = buildAddSubscriptionBody(base);
    expect(body.is_validate_card).toBe("0");
    expect(body.charge_until).toBe("never_expired");
  });

  it("supports a validate-only dry run", () => {
    expect(buildAddSubscriptionBody({ ...base, validateOnly: true }).is_validate_card).toBe("1");
  });

  it("falls back to billing details for shipping", () => {
    const body = buildAddSubscriptionBody(base);
    expect(body.shipping_customer_name).toBe("Joes Coffee");
    expect(body.shipping_zip).toBe("85284");
  });

  it("omits payment_id when no payment profile id was returned", () => {
    // Valor's addpaymentprofiletoken response is undocumented, so the id may
    // legitimately be absent; sending `undefined` would be worse than omitting.
    const body = buildAddSubscriptionBody(base);
    expect("payment_id" in body.payment_info).toBe(false);
    expect(body.payment_info.vault_id).toBe("1234");
  });

  it("rejects a zero-amount subscription", () => {
    expect(() =>
      buildAddSubscriptionBody({
        ...base,
        money: { amountMinor: 0, currency: "USD" },
      })
    ).toThrow(RangeError);
  });
});

describe("buildHostedPageBody", () => {
  const base = {
    money: { amountMinor: 2500, currency: "USD" },
    customerName: "Jane Doe",
  };

  it("sends amount as a number, not a string", () => {
    // Direct Sale Token wants "25.00"; Hosted Page wants 25. Valor is
    // inconsistent across endpoints and the wire format must match each.
    const body = buildHostedPageBody(base);
    expect(body.amount).toBe(25);
    expect(typeof body.amount).toBe("number");
  });

  it("always sets epage to 1", () => {
    expect(buildHostedPageBody(base).epage).toBe(1);
  });

  it("requires a customer name", () => {
    expect(() =>
      buildHostedPageBody({ ...base, customerName: "   " })
    ).toThrow(RangeError);
  });

  it("rejects a zero-amount page", () => {
    expect(() =>
      buildHostedPageBody({ ...base, money: { amountMinor: 0, currency: "USD" } })
    ).toThrow(RangeError);
  });
});

describe("readHostedPageUrl", () => {
  it("finds the URL under a known key", () => {
    expect(readHostedPageUrl({ payment_url: "https://pay.valor/abc" })).toBe(
      "https://pay.valor/abc"
    );
  });

  it("falls back to any URL-shaped value", () => {
    // The response schema is undocumented, so an unknown key is likely.
    expect(readHostedPageUrl({ mystery_field: "https://pay.valor/xyz" })).toBe(
      "https://pay.valor/xyz"
    );
  });

  it("returns null rather than a non-URL string", () => {
    // Returning "OK" here would put a broken link in a customer's invoice.
    expect(readHostedPageUrl({ status: "OK", code: 200 })).toBeNull();
  });
});
