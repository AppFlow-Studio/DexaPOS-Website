/**
 * The real `ResolverSources`, backed by the same data path the storefront uses.
 *
 * This file is the reason a built page and the ordering page can never quote
 * different prices: menu items come from `get_menus_for_location`, the identical
 * RPC behind `getStorefrontData()`. The 5-level price cascade (L1 global → L5
 * location+menu+category) and 86/snooze resolution both happen **inside
 * Postgres**, so there is no second implementation to drift.
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
}

export function createSupabaseResolverSources(
  supabase: ResolverClient,
  options: SupabaseSourceOptions = {},
): ResolverSources {
  const deliveryPricingEnabled = options.deliveryPricingEnabled ?? true;

  return {
    async fetchMenuItems(ctx: ResolverContext): Promise<MenuItemSource[]> {
      const { data, error } = await supabase.rpc("get_menus_for_location", {
        p_merchant_id: ctx.merchantId,
        p_location_id: ctx.locationId,
      });

      if (error) {
        throw new Error(`get_menus_for_location failed: ${error.message}`);
      }

      return flattenMenuItems(data, deliveryPricingEnabled);
    },

    async fetchLocations(ids: string[]): Promise<ResolvedLocation[]> {
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_COLUMNS)
        .in("id", ids);

      if (error) {
        throw new Error(`location fetch failed: ${error.message}`);
      }

      return (Array.isArray(data) ? data : []).map(mapLocation);
    },
  };
}

/**
 * Flattens the RPC's menu → category → item tree into a flat item list.
 *
 * Field-for-field the same mapping `mapRpcMenuToStorefront` performs, including
 * the `effective_*` fallbacks: `effective_cash_price` is null when a merchant
 * does not run dual pricing, in which case cash equals card.
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
