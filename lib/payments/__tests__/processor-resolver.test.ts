import { describe, expect, it } from "vitest";
import { classifyNmiResult } from "../nmi-adapter";
import { isNmiForced, mapAccountRow, selectAccount } from "../resolver";
import {
  assertValidMoney,
  formatMinorUnits,
  toMajorUnits,
  toMinorUnits,
  type ProcessorAccount,
} from "../types";

function account(overrides: Partial<ProcessorAccount> = {}): ProcessorAccount {
  return {
    id: "acct-1",
    merchantId: "merchant-1",
    locationId: null,
    processor: "valor",
    purpose: "online_order",
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
    fees: {
      scheduleId: null,
      discRatePercent: null,
      residualBps: null,
      surchargePercent: null,
    },
    nmi: { merchantId: null, customerVaultId: null },
    webhookSecretEncrypted: null,
    ...overrides,
  };
}

describe("selectAccount", () => {
  it("ignores rows that are not active and primary", () => {
    // C1 allows an NMI and a Valor row to be active at once during dual-run;
    // is_primary is the flag that says which one actually takes the charge.
    const accounts = [
      account({ id: "inactive", isActive: false }),
      account({ id: "not-primary", isPrimary: false }),
    ];
    expect(selectAccount(accounts)).toBeNull();
  });

  it("prefers a location-scoped account over the merchant-global one", () => {
    const accounts = [
      account({ id: "global", locationId: null }),
      account({ id: "scoped", locationId: "loc-1" }),
    ];
    expect(selectAccount(accounts, { locationId: "loc-1" })?.id).toBe("scoped");
  });

  it("falls back to the merchant-global account for an unlisted location", () => {
    const accounts = [
      account({ id: "global", locationId: null }),
      account({ id: "other-location", locationId: "loc-2" }),
    ];
    expect(selectAccount(accounts, { locationId: "loc-1" })?.id).toBe("global");
  });

  it("never charges through another location's account", () => {
    // Without a merchant-global fallback there is no correct answer, and
    // silently using loc-2's Valor credentials would bill the wrong MID.
    const accounts = [account({ id: "other-location", locationId: "loc-2" })];
    expect(selectAccount(accounts, { locationId: "loc-1" })).toBeNull();
  });

  it("returns the NMI account under the kill switch even when Valor is primary", () => {
    // Cutover matrix rollback: PAYMENTS_FORCE_NMI reverts without a deploy.
    const accounts = [
      account({ id: "valor", processor: "valor" }),
      account({ id: "nmi", processor: "nmi" }),
    ];
    expect(selectAccount(accounts, { forceNmi: true })?.id).toBe("nmi");
    expect(selectAccount(accounts)?.id).toBe("valor");
  });

  it("prefers the location-scoped NMI account under the kill switch", () => {
    // The switch narrows by processor first, so it must not fall back to a
    // merchant-global NMI row when a location-scoped NMI row exists.
    const accounts = [
      account({ id: "nmi-global", processor: "nmi", locationId: null }),
      account({ id: "nmi-scoped", processor: "nmi", locationId: "loc-1" }),
      account({ id: "valor-scoped", processor: "valor", locationId: "loc-1" }),
    ];
    expect(selectAccount(accounts, { locationId: "loc-1", forceNmi: true })?.id).toBe(
      "nmi-scoped"
    );
  });

  it("returns null under the kill switch when the merchant has no NMI account", () => {
    // A merchant boarded directly onto Valor has nothing to roll back to;
    // null sends the caller down the legacy path rather than charging Valor.
    const accounts = [account({ id: "valor", processor: "valor" })];
    expect(selectAccount(accounts, { forceNmi: true })).toBeNull();
  });

  it("returns null when the merchant has no accounts at all", () => {
    expect(selectAccount([])).toBeNull();
  });
});

describe("mapAccountRow", () => {
  const row = {
    id: "acct-1",
    merchant_id: "merchant-1",
    location_id: "loc-1",
    processor: "valor",
    purpose: "online_order",
    is_active: true,
    is_primary: true,
    valor_merchant_id: "VM1",
    valor_store_id: "VS1",
    valor_epi: "2001",
    valor_appid: "app-id",
    valor_appkey_encrypted: "enc",
    valor_customer_profile_id: null,
    valor_payment_profile_id: null,
    fee_schedule_id: "fs-default",
    disc_rate_percent: 2.75,
    residual_bps: 30,
    surcharge_percent: 3.5,
    nmi_merchant_id: null,
    nmi_customer_vault_id: null,
    webhook_secret_encrypted: "enc-hook",
  };

  it("groups columns by owner", () => {
    const mapped = mapAccountRow(row);
    expect(mapped?.valor.epi).toBe("2001");
    expect(mapped?.fees.residualBps).toBe(30);
    expect(mapped?.locationId).toBe("loc-1");
  });

  it("drops rows whose processor is outside the supported union", () => {
    // Guards against a widened check constraint routing a charge through an
    // adapter that does not exist.
    expect(mapAccountRow({ ...row, processor: "stripe" })).toBeNull();
  });

  it("drops rows whose purpose is outside the supported union", () => {
    expect(mapAccountRow({ ...row, purpose: "payout" })).toBeNull();
  });
});

describe("isNmiForced", () => {
  it("engages only on the exact string true", () => {
    expect(isNmiForced({ PAYMENTS_FORCE_NMI: "true" })).toBe(true);
    expect(isNmiForced({ PAYMENTS_FORCE_NMI: "1" })).toBe(false);
    expect(isNmiForced({})).toBe(false);
  });
});

describe("classifyNmiResult", () => {
  it("treats a gateway 5xx as retryable error, not a decline", () => {
    // Telling a customer their good card was declined during an NMI outage is
    // the failure this distinction exists to prevent.
    expect(classifyNmiResult({ success: false, status: 502 })).toBe("error");
    expect(classifyNmiResult({ success: false, status: 402 })).toBe("declined");
    expect(classifyNmiResult({ success: true, status: 200 })).toBe("approved");
  });

  it("treats a status of 0 (transport failure) as error", () => {
    expect(classifyNmiResult({ success: false, status: 0 })).toBe("error");
  });
});

describe("money helpers", () => {
  it("round-trips major and minor units", () => {
    expect(toMinorUnits(25.5)).toBe(2550);
    expect(toMajorUnits(2550)).toBe(25.5);
    expect(formatMinorUnits(2550)).toBe("25.50");
  });

  it("converts values that float arithmetic would round down", () => {
    // 1.15 * 100 === 114.99999999999999 in IEEE 754.
    expect(toMinorUnits(1.15)).toBe(115);
    expect(toMinorUnits(8.115)).toBe(812);
  });

  it("rejects fractional minor units", () => {
    // A fractional cent means a caller passed dollars where cents were wanted.
    expect(() =>
      assertValidMoney({ amountMinor: 25.5, currency: "USD" })
    ).toThrow(RangeError);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      assertValidMoney({ amountMinor: -100, currency: "USD" })
    ).toThrow(RangeError);
  });
});
