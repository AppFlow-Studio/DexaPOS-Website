import { describe, expect, it } from "vitest";
import { resolveDeliveryPlatformLogo } from "../delivery-platform";

describe("resolveDeliveryPlatformLogo", () => {
  it("renders known delivery platforms with brand logos regardless of casing", () => {
    expect(
      resolveDeliveryPlatformLogo({ delivery_platform: "GRUBHUB" }),
    ).toMatchObject({
      key: "grubhub",
      label: "Grubhub",
      logoSrc: "/grubhub.png",
      isFallback: false,
    });

    expect(
      resolveDeliveryPlatformLogo({ metadata: { delivery_company: "uber eats" } }),
    ).toMatchObject({
      key: "ubereats",
      label: "Uber Eats",
      logoSrc: "/uber-eats.png",
      isFallback: false,
    });
  });

  it("uses the storefront fallback for first-party website/app orders", () => {
    expect(resolveDeliveryPlatformLogo({ order_source: "online_store" })).toMatchObject({
      key: "online",
      label: "Online Order",
      isFallback: true,
    });

    expect(resolveDeliveryPlatformLogo({ metadata: { provider: "website" } })).toMatchObject({
      key: "online",
      label: "Online Order",
      isFallback: true,
    });
  });

  it("uses a generic fallback for unresolved online delivery platforms", () => {
    const result = resolveDeliveryPlatformLogo({
      order_source: "orderout",
      metadata: { delivery_company: "Foodpanda" },
    });

    expect(result).toMatchObject({
      key: "online",
      label: "Foodpanda",
      isFallback: true,
    });
    expect(result).not.toHaveProperty("logoSrc");
  });

  it("does not render a platform for in-store POS orders or OrderOut placeholders", () => {
    expect(resolveDeliveryPlatformLogo({ order_source: "pos" })).toBeNull();
    expect(
      resolveDeliveryPlatformLogo({
        order_source: "orderout",
        delivery_platform: "orderout",
      }),
    ).toBeNull();
  });
});
