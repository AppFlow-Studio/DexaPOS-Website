// ============================================================================
// Canonical online-ordering platform identity
// ============================================================================
//
// Single source of truth for turning the fragmented platform columns
// (orders.delivery_platform, online_orders.delivery_company,
// online_orders.provider) into ONE canonical platform slug + human label +
// chart color. Reused by the Online Ordering report today; intended to also
// back the Orders-list origin filters and the KDS delivery-platform logos so
// every surface names platforms identically.
//
// Why normalization is needed (proven from live enum + data):
//   - OrderOut is an AGGREGATOR, not a platform — provider='orderout' rows must
//     be decomposed to the real platform via delivery_company.
//   - Casing fragments buckets — 'grubhub' / 'GrubHub' / 'UBEREATS' are the
//     same platform. Lower/trim collapses them.
//   - provider IN ('website','app') is the merchant's OWN storefront →
//     First-party (not a third-party channel).
//   - Anything unresolved → Other (never silently dropped).

import type { Database } from "@/database.types";

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
const FIRST_PARTY_PROVIDERS: ReadonlySet<string> = new Set([
  "website",
  "app",
]);

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
    const token = raw.toString().trim().toLowerCase();
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

// ============================================================================
// Presentation: labels + chart colors, keyed by canonical slug
// ============================================================================

export const PLATFORM_LABELS: Record<PlatformSlug, string> = {
  grubhub: "Grubhub",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  first_party: "First-party",
  other: "Other",
};

export const PLATFORM_COLORS: Record<PlatformSlug, string> = {
  doordash: "hsl(0, 80%, 55%)",
  ubereats: "hsl(140, 70%, 40%)",
  grubhub: "hsl(25, 90%, 50%)",
  first_party: "hsl(210, 80%, 55%)",
  other: "hsl(var(--muted-foreground))",
};

export function getPlatformLabel(slug: string): string {
  return (PLATFORM_LABELS as Record<string, string>)[slug] ?? PLATFORM_LABELS.other;
}

export function getPlatformColor(slug: string): string {
  return (PLATFORM_COLORS as Record<string, string>)[slug] ?? PLATFORM_COLORS.other;
}

// Logo assets (public/). Only third-party platforms have brand logos; first
// party / other fall back to no logo (callers render an icon). Keyed by
// canonical slug so this module is the single source of truth for logos too —
// consumed by the report, the OrderOut config cards, and (once they land) the
// Orders-list filters + KDS ticket.
export const PLATFORM_LOGOS: Partial<Record<PlatformSlug, string>> = {
  ubereats: "/uber-eats.png",
  doordash: "/doordash.png",
  grubhub: "/grubhub.png",
};

export function getPlatformLogo(slug: string): string | null {
  return (PLATFORM_LOGOS as Record<string, string>)[slug] ?? null;
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
