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
 * Normalize a raw platform value ("Uber Eats", "uber_eats", "GRUBHUB") to a stable
 * lookup slug ("ubereats", "grubhub"). Lowercases and strips spaces/underscores so
 * all label/color/logo lookups share one key space.
 */
export function normalizePlatformSlug(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/[\s_]+/g, "");
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
