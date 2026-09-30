import { describe, expect, it } from "vitest";
import type { ValorEndpoints } from "../valor/config";
import {
  getPaymentProfiles,
  readPaymentProfiles,
  ValorVaultError,
} from "../valor/customerProfileApi";

/**
 * Get Payment Profile. Fetch is injected, so no request leaves the machine.
 * The bodies below are the shapes the sandbox returned on 2026-09-29, with the
 * card token and cardholder replaced.
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

const SUCCESS_BODY = {
  code: 200,
  status: "OK",
  message: "Success",
  data: [
    {
      payment_id: 124285,
      masked_pan: "XXXX5439",
      token: "tok-not-for-display",
      card_type: "C",
      card_brand: "Visa",
      cardholder_name: "Jane Doe",
      status: "active",
    },
  ],
};

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function stubFetch(response: { status: number; body: unknown }) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("readPaymentProfiles", () => {
  it("keeps brand and funding type apart", () => {
    // card_type is "C"/"D"; treating it as the brand is what stored a generic
    // type on billing profiles.
    const [profile] = readPaymentProfiles(SUCCESS_BODY);
    expect(profile).toEqual({
      paymentId: "124285",
      maskedPan: "XXXX5439",
      cardType: "C",
      cardBrand: "Visa",
      cardholderName: "Jane Doe",
      status: "active",
    });
  });

  it("never carries the card token", () => {
    const [profile] = readPaymentProfiles(SUCCESS_BODY);
    expect(JSON.stringify(profile)).not.toContain("tok-not-for-display");
  });

  it("returns nothing for a body without a data array", () => {
    expect(readPaymentProfiles({ code: 200, status: "OK" })).toEqual([]);
    expect(readPaymentProfiles({ code: 200, data: "nope" })).toEqual([]);
  });

  it("skips entries that have no payment id to match on", () => {
    expect(
      readPaymentProfiles({ data: [{ masked_pan: "XXXX1111" }, null] })
    ).toEqual([]);
  });
});

describe("getPaymentProfiles", () => {
  it("GETs the vault host with header credentials and no body", async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, body: SUCCESS_BODY });

    const profiles = await getPaymentProfiles(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      "130618"
    );

    expect(profiles).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://vault.test/api/valor-vault/getpaymentprofile/130618"
    );
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Valor-App-ID"]).toBe("app-id");
    expect(headers["Valor-App-Key"]).toBe("app-key");
  });

  it("encodes the vault id into the path", async () => {
    const { fetchImpl, calls } = stubFetch({ status: 200, body: SUCCESS_BODY });

    await getPaymentProfiles(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      "13/06"
    );

    expect(calls[0].url).toBe(
      "https://vault.test/api/valor-vault/getpaymentprofile/13%2F06"
    );
  });

  it("raises Valor's own message when the customer does not exist", async () => {
    const { fetchImpl } = stubFetch({
      status: 400,
      body: { code: 400, status: "FAILED", errors: ["Customer not exist"] },
    });

    const attempt = getPaymentProfiles(
      { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
      "999999999"
    );

    await expect(attempt).rejects.toBeInstanceOf(ValorVaultError);
    await expect(attempt).rejects.toThrow("Customer not exist");
  });

  it("treats an HTTP 200 carrying a failure code as a failure", async () => {
    const { fetchImpl } = stubFetch({
      status: 200,
      body: { code: 400, status: "FAILED", errors: ["Customer not exist"] },
    });

    await expect(
      getPaymentProfiles(
        { credentials: CREDS, endpoints: ENDPOINTS, fetchImpl },
        "130618"
      )
    ).rejects.toBeInstanceOf(ValorVaultError);
  });
});
