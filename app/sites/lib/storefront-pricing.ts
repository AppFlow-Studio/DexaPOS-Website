import { StorefrontItem } from "@/types/storefront";

const PRICE_EPSILON = 0.005;

export function getStorefrontBrowsePrice(item: StorefrontItem): number {
  return Number(item.price) || 0;
}

export function getStorefrontDeliveryPrice(item: StorefrontItem): number {
  return Number(item.delivery_price ?? item.price) || 0;
}

export function getStorefrontCashPrice(item: StorefrontItem): number {
  return Number(item.cash_price ?? item.price) || 0;
}

export function hasSeparateStorefrontDeliveryPrice(item: StorefrontItem): boolean {
  return (
    Math.abs(getStorefrontDeliveryPrice(item) - getStorefrontBrowsePrice(item)) >=
    PRICE_EPSILON
  );
}

export function getStorefrontDeliveryPriceLabel(
  item: StorefrontItem
): string | null {
  if (!hasSeparateStorefrontDeliveryPrice(item)) return null;
  return `Delivery $${getStorefrontDeliveryPrice(item).toFixed(2)}`;
}
