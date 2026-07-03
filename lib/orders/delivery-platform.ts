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

const KNOWN_PLATFORMS: Record<
  Exclude<DeliveryPlatformKey, "online">,
  { label: string; logoSrc: string; aliases: string[] }
> = {
  grubhub: {
    label: "Grubhub",
    logoSrc: "/grubhub.png",
    aliases: ["grubhub", "grubhubmarketplace", "grubhubdelivery", "grub"],
  },
  doordash: {
    label: "DoorDash",
    logoSrc: "/doordash.png",
    aliases: ["doordash", "doordashmarketplace", "doordashdelivery", "dash"],
  },
  ubereats: {
    label: "Uber Eats",
    logoSrc: "/uber-eats.png",
    aliases: ["ubereats", "ubereatsmarketplace", "ubereatsdelivery", "uber"],
  },
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

function normalizePlatformValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveKnownPlatform(value: string) {
  const normalized = normalizePlatformValue(value);

  for (const [key, config] of Object.entries(KNOWN_PLATFORMS)) {
    if (config.aliases.includes(normalized)) {
      return {
        key: key as Exclude<DeliveryPlatformKey, "online">,
        label: config.label,
        logoSrc: config.logoSrc,
      };
    }
  }

  return null;
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

export function resolveDeliveryPlatformLogo(
  order: OrderPlatformSource | null | undefined
): ResolvedDeliveryPlatform | null {
  if (!order) return null;

  const metadata = readRecord(order.metadata);
  const orderSource = readString(order.order_source);
  const normalizedOrderSource = orderSource
    ? normalizePlatformValue(orderSource)
    : null;

  const candidates: Array<{ value: string | null; sourceField: string }> = [
    { value: readString(order.delivery_platform), sourceField: "delivery_platform" },
    { value: readString(metadata.delivery_company), sourceField: "metadata.delivery_company" },
    { value: readString(metadata.delivery_platform), sourceField: "metadata.delivery_platform" },
    { value: readString(metadata.online_order_provider), sourceField: "metadata.online_order_provider" },
    { value: readString(order.online_order_provider), sourceField: "online_order_provider" },
    { value: readString(order.delivery_company), sourceField: "delivery_company" },
    { value: orderSource, sourceField: "order_source" },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const known = resolveKnownPlatform(candidate.value);
    if (known) {
      return {
        ...known,
        isFallback: false,
        rawValue: candidate.value,
        sourceField: candidate.sourceField,
      };
    }

    const normalized = normalizePlatformValue(candidate.value);
    if (FIRST_PARTY_ALIASES.has(normalized)) {
      return buildOnlineFallback("Online Order", candidate.sourceField);
    }

    if (POS_ALIASES.has(normalized)) {
      continue;
    }

    if (candidate.sourceField !== "order_source" || !POS_ALIASES.has(normalized)) {
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
