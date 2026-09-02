import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveRail, mintClientToken } = vi.hoisted(() => ({
  resolveRail: vi.fn(),
  mintClientToken: vi.fn(),
}));

vi.mock("@/lib/invoices/payment-rail", () => ({
  resolveInvoicePaymentRailForPublicToken: resolveRail,
}));

vi.mock("@/lib/payments/valor/saleApi", () => ({
  getClientToken: mintClientToken,
}));

vi.mock("@/lib/payments/valor/config", () => ({
  resolveValorEndpoints: () => ({ isDemo: true }),
}));

import { getInvoicePaymentBootstrap } from "@/app/actions/invoices/invoice-payment-bootstrap";

const baseRail = {
  merchantId: "merchant-1",
  locationId: "location-1",
  billType: "merchant_to_customer",
  apiKey: null,
  webhookSecret: null,
  platformBillingConfigId: null,
};

describe("invoice payment bootstrap", () => {
  beforeEach(() => {
    resolveRail.mockReset();
    mintClientToken.mockReset();
  });

  it("preserves the NMI Collect.js bootstrap when no Valor invoice account is selected", async () => {
    resolveRail.mockResolvedValue({
      ...baseRail,
      kind: "location_payment_device",
      provider: "nmi",
      tokenizationKey: "public-nmi-key",
      paymentDeviceId: "device-1",
      processorAccountId: null,
      valorCredentials: null,
    });

    await expect(getInvoicePaymentBootstrap("invoice-token")).resolves.toEqual({
      provider: "nmi",
      tokenizationKey: "public-nmi-key",
      valorClientToken: null,
      valorEpi: null,
      valorIsDemo: false,
    });
    expect(mintClientToken).not.toHaveBeenCalled();
  });

  it("mints a short-lived Valor token without exposing the app key", async () => {
    const credentials = {
      appId: "app-id",
      appKey: "server-only-secret",
      epi: "2123456789",
    };
    resolveRail.mockResolvedValue({
      ...baseRail,
      kind: "merchant_processor_account",
      provider: "valor",
      tokenizationKey: null,
      paymentDeviceId: null,
      processorAccountId: "account-1",
      valorCredentials: credentials,
    });
    mintClientToken.mockResolvedValue({
      clientToken: "short-lived-browser-token",
      validity: "2026-08-26 12:00:00",
      error_no: "S00",
      error_code: "00",
    });

    const result = await getInvoicePaymentBootstrap("invoice-token");

    expect(mintClientToken).toHaveBeenCalledWith({ credentials });
    expect(result).toEqual({
      provider: "valor",
      tokenizationKey: null,
      valorClientToken: "short-lived-browser-token",
      valorEpi: "2123456789",
      valorIsDemo: true,
    });
    expect(JSON.stringify(result)).not.toContain("server-only-secret");
  });

  it("fails closed when a selected Valor account has incomplete credentials", async () => {
    resolveRail.mockResolvedValue({
      ...baseRail,
      kind: "merchant_processor_account",
      provider: "valor",
      tokenizationKey: null,
      paymentDeviceId: null,
      processorAccountId: "account-1",
      valorCredentials: null,
    });

    await expect(getInvoicePaymentBootstrap("invoice-token")).resolves.toEqual({
      provider: "valor",
      tokenizationKey: null,
      valorClientToken: null,
      valorEpi: null,
      valorIsDemo: false,
    });
    expect(mintClientToken).not.toHaveBeenCalled();
  });
});
