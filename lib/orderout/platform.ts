// ============================================================================
// Delivery-platform + order-source vocabulary (single source of truth)
// ----------------------------------------------------------------------------
// Labels/colors for the delivery marketplaces reached via the OrderOut aggregator
// (Grubhub, DoorDash, Uber Eats, …) plus the canonical order-source taxonomy the
// dashboard surfaces. Consumed by the Orders list, Order Details, filters, and the
// Online Ordering report so the wording/colors never drift between surfaces.
//
// Note: `delivery_platform` on OrderOut orders is stored as the raw marketplace
// name (e.g. "Grubhub") — always normalize with normalizePlatformSlug() before
// looking anything up here.
// ============================================================================

import type { Database } from "@/database.types";

/** Canonical order-source taxonomy stored in orders.order_source. */
export type OrderSource = "pos" | "orderout" | "online_store" | "phone";

// ─── Delivery marketplaces (delivery_platform) ───

const PLATFORM_COLORS: Record<string, string> = {
  doordash: "hsl(0, 80%, 55%)",
  ubereats: "hsl(140, 70%, 40%)",
  grubhub: "hsl(25, 90%, 50%)",
  postmates: "hsl(210, 80%, 55%)",
  default: "hsl(var(--primary))",
};

const PLATFORM_LABELS: Record<string, string> = {
  direct: "Online Store (Direct)",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  grubhub: "Grubhub",
  foodpanda: "Foodpanda",
  postmates: "Postmates",
  seamless: "Seamless",
  caviar: "Caviar",
};

/**
 * Logo asset (in /public) per platform slug. Files supplied by Abubeckr. Platforms
 * without an asset fall through to a generic branded dot in the UI, so it's safe to
 * add a slug here before its file lands (e.g. foodpanda).
 */
const PLATFORM_LOGOS: Record<string, string> = {
  doordash: "/doordash.png",
  ubereats: "/uber-eats.png",
  grubhub: "/grubhub.png",
  foodpanda: "/food-panda.png",
};

/** Public path to a platform's logo, or null if none is mapped. */
export function platformLogo(raw: string | null | undefined): string | null {
  const slug = normalizePlatformSlug(raw);
  return PLATFORM_LOGOS[slug] ?? null;
}

/**
 * Whether `raw` is a real, nameable delivery marketplace (Grubhub, DoorDash, …) as
 * opposed to missing or a placeholder that just echoes the aggregator ('orderout').
 * OrderOut rows whose delivery_company was never set can carry 'orderout' (or null)
 * here; those should render as the generic "Delivery App" channel, not "Orderout".
 */
export function isKnownPlatform(raw: string | null | undefined): boolean {
  const slug = normalizePlatformSlug(raw);
  if (!slug || slug === "orderout") return false;
  return true;
}

/**
 * Normalize a raw platform value ("Uber Eats", "uber_eats", "GRUBHUB") to a stable
 * lookup slug ("ubereats", "grubhub"). Lowercases and strips spaces/underscores so
 * all label/color/logo lookups share one key space.
 */
export function normalizePlatformSlug(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Human label for a delivery marketplace. Accepts raw or slugged input. */
export function platformLabel(raw: string | null | undefined): string {
  const slug = normalizePlatformSlug(raw);
  if (!slug) return "";
  return (
    PLATFORM_LABELS[slug] ||
    // Title-case unknown platforms rather than dropping them.
    slug.charAt(0).toUpperCase() + slug.slice(1)
  );
}

/** Brand color (CSS color string) for a delivery marketplace. */
export function platformColor(raw: string | null | undefined): string {
  const slug = normalizePlatformSlug(raw);
  return PLATFORM_COLORS[slug] || PLATFORM_COLORS.default;
}

/** Marketplaces offered as Platform filter options on the Orders list. */
export const DELIVERY_PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "grubhub", label: "Grubhub" },
  { value: "doordash", label: "DoorDash" },
  { value: "ubereats", label: "Uber Eats" },
];

/**
 * Candidate raw `delivery_platform` DB values for a normalized slug. Used to build
 * case-insensitive filter matches: delivery_platform is stored raw (e.g. "Uber Eats",
 * "Grubhub") while filter values are slugs ("ubereats", "grubhub"). Returns both the
 * display label ("Uber Eats") and the slug so an ILIKE against each covers both the
 * spaced label and any slug-cased data.
 */
export function deliveryPlatformMatchValues(slug: string): string[] {
  const s = normalizePlatformSlug(slug);
  const values = new Set<string>([s]);
  if (PLATFORM_LABELS[s]) values.add(PLATFORM_LABELS[s]);
  return [...values];
}

// ─── Order source / channel (order_source) ───

/**
 * Display metadata for each order_source. `iconKey` is a stable string the UI maps
 * to a lucide icon (kept out of this module so it stays framework-agnostic).
 */
export const ORDER_SOURCE_META: Record<
  OrderSource,
  { label: string; iconKey: "store" | "truck" | "globe" | "phone" }
> = {
  pos: { label: "In-Store (POS)", iconKey: "store" },
  orderout: { label: "Delivery App", iconKey: "truck" },
  online_store: { label: "Online Store", iconKey: "globe" },
  phone: { label: "Phone", iconKey: "phone" },
};

/** Channel options offered as the Channel filter on the Orders list. */
export const ORDER_SOURCE_OPTIONS: { value: OrderSource; label: string }[] = (
  Object.keys(ORDER_SOURCE_META) as OrderSource[]
).map((value) => ({ value, label: ORDER_SOURCE_META[value].label }));

/** Label for an order_source value; tolerant of the legacy 'online' and nulls. */
export function orderSourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  if (source === "online") return "Online Store"; // legacy pre-backfill value
  return ORDER_SOURCE_META[source as OrderSource]?.label ?? source;
}

// ============================================================================
// Canonical platform identity (analytics + Online Ordering report bucketing)
// ----------------------------------------------------------------------------
// Distinct from the marketplace vocabulary above: this turns the fragmented
// platform columns (orders.delivery_platform, online_orders.delivery_company,
// online_orders.provider) into ONE canonical slug + label + logo so the report
// and analytics bucket every order identically. The vocabulary above is keyed by
// raw marketplace name; this section is keyed by the canonical slug set below.
// ============================================================================

export type OnlineOrderProvider =
  Database["public"]["Enums"]["online_order_provider"];

/**
 * Canonical platform slugs the report buckets into. Third-party aggregator
 * sub-platforms (grubhub/doordash/ubereats) are first-class; `first_party`
 * covers the merchant's own storefront; `other` is the catch-all.
 */
export type PlatformSlug =
  | "grubhub"
  | "doordash"
  | "ubereats"
  | "first_party"
  | "other";

export const FIRST_PARTY_SLUG: PlatformSlug = "first_party";
export const OTHER_SLUG: PlatformSlug = "other";

// Providers that mean "placed on the merchant's own storefront".
const FIRST_PARTY_PROVIDERS: ReadonlySet<string> = new Set(["website", "app"]);

// Map a trimmed/lowercased raw token onto a canonical third-party slug.
// Keys cover the delivery_company spellings OrderOut sends plus the matching
// provider enum values.
const THIRD_PARTY_ALIASES: Record<string, PlatformSlug> = {
  grubhub: "grubhub",
  doordash: "doordash",
  ubereats: "ubereats",
  uber_eats: "ubereats",
  "uber eats": "ubereats",
};

export interface CanonicalizeInput {
  /** orders.delivery_platform — authoritative once ticket #2 backfills it. */
  deliveryPlatform?: string | null;
  /** online_orders.delivery_company — the real platform name (raw casing). */
  deliveryCompany?: string | null;
  /** online_orders.provider enum — aggregator vs first-party. */
  provider?: OnlineOrderProvider | string | null;
  /**
   * orders.order_source (e.g. 'online' | 'online_store' | 'orderout' | 'pos').
   * Used only as the final first-party signal: an online storefront order
   * ('online' / 'online_store') carrying NO third-party signal is a storefront
   * order, even when it has no online_orders link and no delivery_platform.
   */
  orderSource?: string | null;
}

/**
 * Resolve fragmented platform columns to one canonical slug.
 *
 * Precedence (delivery_platform is authoritative — mirrors the ticket's
 * COALESCE, and does NOT let provider override it):
 *   1. delivery_platform  (once populated by the origin ticket)
 *   2. delivery_company   (decomposes provider='orderout' into the real platform)
 *   3. provider           (only when it already names a real third-party platform)
 * If any of the above resolves to a real third-party platform, that wins.
 *
 * Otherwise fall back to first-party:
 *   4. provider IN ('website','app')  → first_party
 *   5. order_source === 'online' with no third-party signal → first_party
 *      (covers legacy/direct storefront orders lacking an online_orders link)
 *
 * Anything still unresolved → other.
 */
export function canonicalizePlatform(input: CanonicalizeInput): PlatformSlug {
  const providerRaw = (input.provider ?? "").toString().trim().toLowerCase();

  // 1–3: third-party resolution wins over any first-party provider signal, so a
  // backfilled delivery_platform is never silently misbucketed as First-party.
  const thirdPartyCandidates = [
    input.deliveryPlatform,
    input.deliveryCompany,
    // provider is only useful here if it already names a real platform
    // (e.g. provider='doordash'); 'orderout' resolves to nothing and falls
    // through unless delivery_company decomposed it above.
    providerRaw === "orderout" ? null : input.provider,
  ];

  for (const raw of thirdPartyCandidates) {
    if (raw == null) continue;
    const token = normalizePlatformSlug(raw.toString());
    if (!token) continue;
    const slug = THIRD_PARTY_ALIASES[token];
    if (slug) return slug;
  }

  // 4: explicit first-party provider (the merchant's own storefront/app).
  if (FIRST_PARTY_PROVIDERS.has(providerRaw)) {
    return FIRST_PARTY_SLUG;
  }

  // 5: an online storefront order with no resolvable third-party signal is
  // first-party — catches direct storefront orders that have no online_orders
  // link / delivery_platform. The source is written as 'online' or
  // 'online_store' depending on ingestion version.
  const source = (input.orderSource ?? "").toString().trim().toLowerCase();
  if (source === "online" || source === "online_store") {
    return FIRST_PARTY_SLUG;
  }

  return OTHER_SLUG;
}

// ─── Presentation keyed by canonical slug ───
// Named SLUG_* so they don't collide with the raw-marketplace PLATFORM_* maps
// above; nothing outside this module reads these directly.

const SLUG_LABELS: Record<PlatformSlug, string> = {
  grubhub: "Grubhub",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  first_party: "First-party",
  other: "Other",
};

const SLUG_COLORS: Record<PlatformSlug, string> = {
  doordash: "hsl(0, 80%, 55%)",
  ubereats: "hsl(140, 70%, 40%)",
  grubhub: "hsl(25, 90%, 50%)",
  first_party: "hsl(210, 80%, 55%)",
  other: "hsl(var(--muted-foreground))",
};

// Logo assets (public/). Only third-party platforms have brand logos; first
// party / other fall back to no logo (callers render an icon).
const SLUG_LOGOS: Partial<Record<PlatformSlug, string>> = {
  ubereats: "/uber-eats.png",
  doordash: "/doordash.png",
  grubhub: "/grubhub.png",
};

export function getPlatformLabel(slug: string): string {
  return (SLUG_LABELS as Record<string, string>)[slug] ?? SLUG_LABELS.other;
}

export function getPlatformColor(slug: string): string {
  return (SLUG_COLORS as Record<string, string>)[slug] ?? SLUG_COLORS.other;
}

export function getPlatformLogo(slug: string): string | null {
  return (SLUG_LOGOS as Record<string, string>)[slug] ?? null;
}

// ---------------------------------------------------------------------------
// Bridge for the OrderOut config UI, which works in raw UPPERCASE channel codes
// (KNOWN_DELIVERY_CHANNELS: 'UBEREATS' | 'DOORDASH' | 'GRUBHUB') rather than the
// analytics slugs. Mapping both key spaces through here keeps ONE definition of
// label/logo/color for every surface.
// ---------------------------------------------------------------------------

/** Normalize a raw channel code (any casing) to a canonical slug. */
export function channelToSlug(channel: string): PlatformSlug {
  return canonicalizePlatform({ deliveryCompany: channel });
}

/**
 * Label for a raw OrderOut channel code (e.g. 'GRUBHUB' → 'Grubhub'). Unknown
 * channels that don't map to a known platform keep their raw code rather than
 * collapsing to "Other" — the OrderOut config UI wants to name the actual
 * channel it received, even one we don't have a canonical slug for yet.
 */
export function getChannelLabel(channel: string): string {
  const slug = channelToSlug(channel);
  if (slug === OTHER_SLUG) return channel;
  return getPlatformLabel(slug);
}

/** Logo for a raw OrderOut channel code (e.g. 'GRUBHUB' → '/grubhub.png'). */
export function getChannelLogo(channel: string): string | null {
  return getPlatformLogo(channelToSlug(channel));
}

/**
 * Stable display order for tabs / bars: real platforms first (by rough US
 * market share), then First-party, then Other last.
 */
export const PLATFORM_DISPLAY_ORDER: PlatformSlug[] = [
  "doordash",
  "ubereats",
  "grubhub",
  "first_party",
  "other",
];

/** Sort helper: order a set of present slugs into the canonical display order. */
export function sortPlatformSlugs(slugs: Iterable<string>): PlatformSlug[] {
  const present = new Set(slugs);
  return PLATFORM_DISPLAY_ORDER.filter((s) => present.has(s));
}
