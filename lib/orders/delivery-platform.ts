import {
  canonicalizePlatform,
  FIRST_PARTY_SLUG,
  getPlatformLabel,
  getPlatformLogo,
  normalizePlatformSlug,
  OTHER_SLUG,
  type PlatformSlug,
} from "@/lib/orderout/platform";

export type DeliveryPlatformKey = "grubhub" | "doordash" | "ubereats" | "online";

export interface ResolvedDeliveryPlatform {
  key: DeliveryPlatformKey;
  label: string;
  logoSrc?: string;
  isFallback: boolean;
  rawValue: string;
  sourceField: string;
}

type OrderPlatformSource = {
  delivery_platform?: unknown;
  delivery_company?: unknown;
  online_order_provider?: unknown;
  order_source?: unknown;
  order_type?: unknown;
  metadata?: unknown;
};

const FIRST_PARTY_ALIASES = new Set([
  "app",
  "dexa",
  "dexapos",
  "direct",
  "firstparty",
  "mobile",
  "mobileapp",
  "online",
  "onlineordering",
  "onlinestore",
  "storefront",
  "web",
  "website",
]);

const POS_ALIASES = new Set([
  "counter",
  "instore",
  "inrestaurant",
  "phone",
  "pos",
  "register",
  "restaurant",
  "tablet",
]);

const AGGREGATOR_PLACEHOLDER_ALIASES = new Set(["orderout", "deliveryapp"]);

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildOnlineFallback(rawValue: string, sourceField: string): ResolvedDeliveryPlatform {
  return {
    key: "online",
    label: toTitleLabel(rawValue) || "Online Order",
    isFallback: true,
    rawValue,
    sourceField,
  };
}

function resolveCandidateSlug(
  value: string,
  sourceField: string,
): PlatformSlug {
  if (sourceField === "order_source") {
    return canonicalizePlatform({ orderSource: value });
  }

  if (
    sourceField === "metadata.provider" ||
    sourceField === "metadata.online_order_provider" ||
    sourceField === "online_order_provider"
  ) {
    return canonicalizePlatform({ provider: value });
  }

  return canonicalizePlatform({
    deliveryPlatform: value,
    deliveryCompany: value,
  });
}

export function resolveDeliveryPlatformLogo(
  order: OrderPlatformSource | null | undefined
): ResolvedDeliveryPlatform | null {
  if (!order) return null;

  const metadata = readRecord(order.metadata);
  const orderSource = readString(order.order_source);
  const normalizedOrderSource = orderSource
    ? normalizePlatformSlug(orderSource)
    : null;

  const candidates: Array<{ value: string | null; sourceField: string }> = [
    { value: readString(order.delivery_platform), sourceField: "delivery_platform" },
    { value: readString(metadata.delivery_company), sourceField: "metadata.delivery_company" },
    { value: readString(metadata.delivery_platform), sourceField: "metadata.delivery_platform" },
    { value: readString(metadata.provider), sourceField: "metadata.provider" },
    { value: readString(metadata.online_order_provider), sourceField: "metadata.online_order_provider" },
    { value: readString(order.online_order_provider), sourceField: "online_order_provider" },
    { value: readString(order.delivery_company), sourceField: "delivery_company" },
    { value: orderSource, sourceField: "order_source" },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const normalized = normalizePlatformSlug(candidate.value);
    if (POS_ALIASES.has(normalized) || AGGREGATOR_PLACEHOLDER_ALIASES.has(normalized)) {
      continue;
    }

    const slug = resolveCandidateSlug(candidate.value, candidate.sourceField);
    if (slug !== FIRST_PARTY_SLUG && slug !== OTHER_SLUG) {
      return {
        key: slug as Exclude<DeliveryPlatformKey, "online">,
        label: getPlatformLabel(slug),
        logoSrc: getPlatformLogo(slug) ?? undefined,
        isFallback: false,
        rawValue: candidate.value,
        sourceField: candidate.sourceField,
      };
    }

    if (slug === FIRST_PARTY_SLUG || FIRST_PARTY_ALIASES.has(normalized)) {
      return buildOnlineFallback("Online Order", candidate.sourceField);
    }

    if (candidate.sourceField !== "order_source") {
      return buildOnlineFallback(candidate.value, candidate.sourceField);
    }
  }

  if (normalizedOrderSource && POS_ALIASES.has(normalizedOrderSource)) {
    return null;
  }

  if (readString(order.order_type) === "online") {
    return buildOnlineFallback("Online Order", "order_type");
  }

  return null;
}
