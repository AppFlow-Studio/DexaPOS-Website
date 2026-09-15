import { describe, expect, it } from "vitest";

import {
  MERCHANT_ASSET_CATEGORIES,
  isValidAssetCategory,
} from "@/supabase/functions/_shared/cdn-asset-policy";

describe("CDN asset category policy", () => {
  it("keeps kiosk in the merchant runtime allowlist", () => {
    expect(MERCHANT_ASSET_CATEGORIES).toContain("kiosk");
    expect(isValidAssetCategory("merchant", "kiosk")).toBe(true);
  });

  it("does not expose kiosk assets to organization scope", () => {
    expect(isValidAssetCategory("organization", "kiosk")).toBe(false);
  });

  it("rejects unknown and non-string categories", () => {
    expect(isValidAssetCategory("merchant", "../kiosk")).toBe(false);
    expect(isValidAssetCategory("unknown", "logos")).toBe(false);
    expect(isValidAssetCategory("merchant", null)).toBe(false);
  });
});
