/**
 * The real `ResolverSources`, backed by the same data path the storefront uses.
 *
 * This file is the reason a built page and the ordering page can never quote
 * different prices: menu items come from `get_menus_for_location_lite`, which is
 * a key projection over the very same `get_menu_with_categories` call that
 * `getStorefrontData()` goes through — fewer keys, identical values. The 5-level
 * price cascade (L1 global → L5 location+menu+category) and 86/snooze resolution
 * both happen **inside Postgres**, so there is no second implementation to
 * drift.
 *
 * If you are tempted to query `menu_items` directly here, don't — that is
 * exactly how the two surfaces diverge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MenuItemSource,
  ResolverContext,
  ResolverSources,
} from "./resolve";
import type { ResolvedLocation } from "./resolved";

/**
 * The real client type rather than a narrow structural interface.
 *
 * A hand-rolled `{ rpc, from }` shape sends TypeScript into TS2589 when checked
 * against Supabase's deeply generic builder types. Nothing is lost: tests inject
 * `ResolverSources` rather than a fake client, and `flattenMenuItems` — the part
 * with real logic — is exported and tested directly on RPC fixtures.
 */
type ResolverClient = SupabaseClient;

const LOCATION_COLUMNS =
  "id, name, address_line1, city, state, postal_code, phone, email, latitude, longitude, timezone, business_hours";

export interface SupabaseSourceOptions {
  /**
   * Mirrors `online_store_config.delivery_pricing_enabled`. When off, the
   * storefront collapses delivery price down to the card price
   * (`applyDeliveryPricingPolicy` in app/sites/actions.ts) — matched here so a
   * built page shows the same figure.
   */
  deliveryPricingEnabled?: boolean;

  /**
   * Set on the public site to read locations through `get_public_locations`.
   *
   * The built site renders as a real anonymous visitor, and anon has no SELECT
   * on `locations` — every SELECT policy there is `authenticated`-only. Reading
   * the table directly therefore returned zero rows without an error, so a
   * published page lost its address, phone and hours while the editor, reading
   * as a signed-in merchant, showed them. The function returns an explicit
   * projection instead, because `locations` also holds `ein`, `tax_id` and
   * processor fees that must never reach a web page.
   */
  publicMerchantId?: string;
}

export function createSupabaseResolverSources(
  supabase: ResolverClient,
  options: SupabaseSourceOptions = {},
): ResolverSources {
  const deliveryPricingEnabled = options.deliveryPricingEnabled ?? true;
  const publicMerchantId = options.publicMerchantId;

  /**
   * Per-instance memo, keyed by merchant+location.
   *
   * A sources object is built per request, so this cache lives and dies with
   * that request: there is no cross-request staleness window for a price to hide
   * in. Callers that need the item list before building a document (seeding a
   * starter page, for instance) can therefore call `fetchMenuItems` freely and
   * let the resolver's own call hit the memo.
   */
  const menuItemsByScope = new Map<string, Promise<MenuItemSource[]>>();

  return {
    fetchMenuItems(ctx: ResolverContext): Promise<MenuItemSource[]> {
      const scope = `${ctx.merchantId}:${ctx.locationId}`;
      let pending = menuItemsByScope.get(scope);
      if (pending) return pending;

      pending = (async () => {
        const data = await fetchMenuTree(supabase, ctx);
        return flattenMenuItems(data, deliveryPricingEnabled);
      })();

      // A rejection is cached too, deliberately: both callers within one request
      // should see the same failure rather than the second silently retrying a
      // database that is already known to be unhappy.
      menuItemsByScope.set(scope, pending);
      return pending;
    },

    async fetchLocations(ids: string[]): Promise<ResolvedLocation[]> {
      if (ids.length === 0) return [];

      const { data, error } = publicMerchantId
        ? await supabase.rpc("get_public_locations", {
            p_merchant_id: publicMerchantId,
            p_ids: ids,
          })
        : await supabase.from("locations").select(LOCATION_COLUMNS).in("id", ids);

      if (error) {
        throw new Error(`location fetch failed: ${error.message}`);
      }

      return (Array.isArray(data) ? data : []).map(mapLocation);
    },
  };
}

/**
 * PostgREST's code for "no function with this name and signature".
 *
 * Distinguished from every other failure on purpose: a missing function means
 * the lite migration has not been applied to this environment, which is a
 * deployment state we can recover from. A permission error, a timeout or a bad
 * argument means something is genuinely wrong and must not be retried against a
 * different function as though it were the same question.
 */
const FUNCTION_NOT_FOUND = "PGRST202";

let warnedAboutLiteFallback = false;

/**
 * The menu tree, from the leanest source this database offers.
 *
 * `get_menus_for_location_lite` is a projection over the same
 * `get_menu_with_categories` call the full RPC makes — same prices, same
 * availability, same menu selection — with the keys no page renderer reads
 * removed. Measured across 7 staging storefronts: 84% less payload and 509 ms
 * down to 231 ms, with a byte-identical flattened item list. That matters
 * because this runs on every canvas render, not just on page open.
 *
 * The fallback exists because the two are interchangeable: an environment
 * without the migration still renders correct pages, just slower. Without it,
 * deploying this code ahead of the migration would take the builder down.
 */
async function fetchMenuTree(
  supabase: ResolverClient,
  ctx: ResolverContext,
): Promise<unknown> {
  const args = { p_merchant_id: ctx.merchantId, p_location_id: ctx.locationId };

  const lite = await supabase.rpc("get_menus_for_location_lite", args);
  if (!lite.error) return lite.data;

  if (lite.error.code !== FUNCTION_NOT_FOUND) {
    throw new Error(`get_menus_for_location_lite failed: ${lite.error.message}`);
  }

  if (!warnedAboutLiteFallback) {
    warnedAboutLiteFallback = true;
    console.warn(
      "[site-builder] get_menus_for_location_lite is missing — falling back to the full " +
        "menu payload (~8x larger). Apply 20260816120000_get_menus_for_location_lite.sql.",
    );
  }

  const full = await supabase.rpc("get_menus_for_location", args);
  if (full.error) {
    throw new Error(`get_menus_for_location failed: ${full.error.message}`);
  }
  return full.data;
}

/**
 * Flattens the RPC's menu → category → item tree into a flat item list.
 *
 * Field-for-field the same mapping `mapRpcMenuToStorefront` performs, including
 * the `effective_*` fallbacks: `effective_cash_price` is null when a merchant
 * does not run dual pricing, in which case cash equals card.
 *
 * Reads only keys that both the full and the lite RPC emit, which is what lets
 * either one feed it unchanged.
 *
 * `is_popular` and `is_new` are read here but **no version of
 * `get_menu_with_categories` emits them**, so both are permanently false and the
 * "Popular" badge can never render. Left as-is rather than fixed inside a
 * performance change: making the badge start appearing on live pages is a
 * product change and deserves its own review.
 */
export function flattenMenuItems(
  rpcData: unknown,
  deliveryPricingEnabled = true,
): MenuItemSource[] {
  const menus = Array.isArray(rpcData) ? rpcData : [];
  const out: MenuItemSource[] = [];
  const seen = new Set<string>();

  for (const menu of menus) {
    const categories = asArray((menu as Record<string, unknown>)?.categories);

    for (const menuCategory of categories) {
      const mc = menuCategory as Record<string, unknown>;
      if (mc.is_active === false) continue;

      for (const categoryItem of asArray(mc.items)) {
        const mi = (categoryItem as Record<string, unknown>)?.menu_item as
          | Record<string, unknown>
          | undefined;
        if (!mi || typeof mi.id !== "string") continue;

        // The same item can appear on several menus; first occurrence wins,
        // matching the order the storefront renders them in.
        if (seen.has(mi.id)) continue;
        seen.add(mi.id);

        const cardPrice = Number(mi.effective_price) || 0;
        const cashPrice =
          mi.effective_cash_price != null ? Number(mi.effective_cash_price) : cardPrice;
        const deliveryPrice =
          mi.effective_delivery_price != null ? Number(mi.effective_delivery_price) : cardPrice;

        out.push({
          id: mi.id,
          name: typeof mi.name === "string" ? mi.name : "",
          description: typeof mi.description === "string" ? mi.description : null,
          price: cardPrice,
          cashPrice,
          deliveryPrice: deliveryPricingEnabled ? deliveryPrice : cardPrice,
          image: typeof mi.image === "string" ? mi.image : null,
          isPopular: mi.is_popular === true,
          isNew: mi.is_new === true,
          dietaryTags: asStringArray(mi.dietary_flags),
          allergens: asStringArray(mi.allergens),
          // Folds 86ing, snoozing and manual hiding into one flag — resolved in
          // Postgres, so the POS, storefront and built page all agree.
          available: mi.effective_availability !== false,
        });
      }
    }
  }

  return out;
}

function mapLocation(row: unknown): ResolvedLocation {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    addressLine1: nullableString(r.address_line1),
    city: nullableString(r.city),
    state: nullableString(r.state),
    postalCode: nullableString(r.postal_code),
    phone: nullableString(r.phone),
    email: nullableString(r.email),
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    timezone: nullableString(r.timezone),
    businessHours: r.business_hours ?? null,
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
