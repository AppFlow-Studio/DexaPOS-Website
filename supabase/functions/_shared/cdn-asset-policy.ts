export const MERCHANT_ASSET_CATEGORIES = [
  "logos",
  "cfd-images",
  "menu-categories",
  "menu-items",
  "menus",
  "documents",
  "website",
  "kiosk",
] as const;

export const ORGANIZATION_ASSET_CATEGORIES = ["logos", "documents"] as const;

export type MerchantAssetCategory = (typeof MERCHANT_ASSET_CATEGORIES)[number];
export type OrganizationAssetCategory = (typeof ORGANIZATION_ASSET_CATEGORIES)[number];

const merchantCategorySet = new Set<string>(MERCHANT_ASSET_CATEGORIES);
const organizationCategorySet = new Set<string>(ORGANIZATION_ASSET_CATEGORIES);

export function isValidAssetCategory(scope: string, category: unknown): boolean {
  if (typeof category !== "string") return false;
  if (scope === "merchant") return merchantCategorySet.has(category);
  if (scope === "organization") return organizationCategorySet.has(category);
  return false;
}
