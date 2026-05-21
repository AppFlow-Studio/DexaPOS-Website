"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Site, SiteThemeConfig, OnlineOrderingConfig } from "@/types/site";
import {
  StorefrontMenu,
  StorefrontCategory,
  StorefrontItem,
} from "@/types/storefront";

export interface StorefrontData {
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  menus: StorefrontMenu[];
  pricingDisclosureText: string | null;
}

/**
 * When the merchant has separate online/delivery pricing turned OFF, online
 * orders must use the regular item price everywhere. The storefront now uses
 * the regular online/card price as its browse default and only surfaces
 * delivery pricing as a secondary label when it actually differs, so the
 * single safe place to collapse delivery pricing remains the data layer.
 * When the toggle is ON (default) the menus pass through untouched.
 */
function applyDeliveryPricingPolicy(
  menus: StorefrontMenu[],
  deliveryPricingEnabled: boolean
): StorefrontMenu[] {
  if (deliveryPricingEnabled) return menus;
  return menus.map((menu) => ({
    ...menu,
    categories: menu.categories?.map((cat) => ({
      ...cat,
      items: cat.items?.map((item) => ({
        ...item,
        delivery_price: item.price,
      })),
    })),
  }));
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapStoreConfigToSite(config: any): Site {
  const themeConfig: SiteThemeConfig = {
    primaryColor: config.primary_color,
    secondaryColor: config.secondary_color,
    accentColor: config.accent_color,
    backgroundColor: config.background_color,
    textColor: config.text_color,
    fontFamily: config.font_family,
    templateId: (["hero", "market", "boutique", "classic"].includes(config.template_id) ? config.template_id : "classic") as "classic" | "hero" | "market" | "boutique",
    heroImageUrl: config.hero_image_url,
    faviconUrl: config.favicon_url,
    headerStyle: config.header_style,
    headerTextColor: config.header_text_color,
    borderColor: config.border_color ?? null,
    cardColor: config.card_color ?? null,
  };

  const onlineOrderingConfig: OnlineOrderingConfig = {
    operatingHours: config.operating_hours,
    menuLayout: config.menu_layout || "cards",
    pickupEnabled: config.accepts_pickup,
    deliveryEnabled: config.accepts_delivery,
    deliveryPricingEnabled: config.delivery_pricing_enabled ?? true,
    minimumOrderAmount: Number(config.min_order ?? 0),
    preparationLeadTime: config.estimated_prep_minutes,
    futureOrderMaxDays: config.max_future_order_days || undefined,
    tippingEnabled: config.tip_enabled,
    tipConfig: config.tip_presets
      ? { presetPercentages: config.tip_presets }
      : undefined,
    baseDeliveryFee: Number(config.delivery_fee ?? 0),
    freeDeliveryThreshold: config.free_delivery_threshold
      ? Number(config.free_delivery_threshold)
      : undefined,
    acceptOnlinePayments: config.accepts_online_payments ?? true,
    acceptCashOnDelivery: config.accepts_cash_on_delivery ?? false,
    acceptCardOnDelivery: config.accepts_card_on_delivery ?? false,
  };

  return {
    id: config.id,
    merchant_id: config.merchant_id,
    location_id: config.location_id,
    subdomain: config.slug,
    custom_domain: config.custom_domain,
    title: config.store_name,
    description: config.description,
    logo_url: config.logo_url,
    banner_text: null,
    address: config.address,
    theme_config: themeConfig,
    online_ordering_config: onlineOrderingConfig,
    is_active: config.is_active,
    created_at: config.created_at,
    updated_at: config.updated_at,
    meta_title: config.meta_title ?? null,
    meta_description: config.meta_description ?? null,
    google_analytics_id: config.google_analytics_id ?? null,
    facebook_pixel_id: config.facebook_pixel_id ?? null,
    og_image_url: config.og_image_url ?? null,
  };
}

export async function getStorefrontData(
  slugOrId: string
): Promise<StorefrontData> {
  const supabase = createServiceRoleClient();
  const isUuid = UUID_REGEX.test(slugOrId);

  // 1. Fetch store config by slug or location_id
  let storeConfigQuery = supabase
    .from("online_store_config")
    .select("*");

  if (isUuid) {
    storeConfigQuery = storeConfigQuery.eq("location_id", slugOrId);
  } else {
    storeConfigQuery = storeConfigQuery.eq("slug", slugOrId);
  }

  const { data: storeConfig, error: configError } =
    await storeConfigQuery.single();

  // Fallback: try legacy sites table if no online_store_config found
  if (configError || !storeConfig) {
    return getStorefrontDataLegacy(slugOrId, isUuid);
  }

  if (storeConfig.is_active === false) {
    return { site: null, location: null, menus: [], pricingDisclosureText: null };
  }

  const site = mapStoreConfigToSite(storeConfig);
  const locationId = storeConfig.location_id;

  // 2. Fetch location
  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select(
      "id, name, address_line1, city, state, postal_code, phone, email, business_hours, merchant_id, latitude, longitude, timezone"
    )
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    return { site, location: null, menus: [], pricingDisclosureText: null };
  }

  const merchantId = location.merchant_id;
  const pricingDisclosureText = storeConfig.pricing_disclosure_text ?? null;

  // 3. Fetch menus + categories + items + modifiers (same logic as before)
  const rawMenus = await fetchMenus(supabase, merchantId, locationId);
  const menus = applyDeliveryPricingPolicy(
    rawMenus,
    site?.online_ordering_config?.deliveryPricingEnabled ?? true
  );

  return { site, location, menus, pricingDisclosureText };
}

async function getStorefrontDataLegacy(
  slugOrId: string,
  isUuid: boolean
): Promise<StorefrontData> {
  const supabase = createServiceRoleClient();

  let siteQuery = supabase.from("sites").select("*");
  if (isUuid) {
    siteQuery = siteQuery.eq("location_id", slugOrId);
  } else {
    siteQuery = siteQuery.eq("subdomain", slugOrId);
  }

  const { data: siteData } = await siteQuery.single();

  if (siteData?.is_active === false) {
    return { site: null, location: null, menus: [], pricingDisclosureText: null };
  }

  const locationId = isUuid ? slugOrId : siteData?.location_id;
  if (!locationId) {
    return { site: siteData, location: null, menus: [], pricingDisclosureText: null };
  }

  const { data: location } = await supabase
    .from("locations")
    .select(
      "id, name, address_line1, city, state, postal_code, phone, email, business_hours, merchant_id, latitude, longitude, timezone"
    )
    .eq("id", locationId)
    .single();

  if (!location) {
    return { site: siteData, location: null, menus: [], pricingDisclosureText: null };
  }

  const rawMenus = await fetchMenus(supabase, location.merchant_id, locationId);
  const menus = applyDeliveryPricingPolicy(
    rawMenus,
    siteData?.online_ordering_config?.deliveryPricingEnabled ?? true
  );

  return { site: siteData, location, menus, pricingDisclosureText: null };
}

async function fetchMenus(
  supabase: any,
  merchantId: string,
  locationId: string
): Promise<StorefrontMenu[]> {
  const { data: rawMenus, error: menuError } = await supabase
    .from("menus")
    .select("id, name, display_order")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .or(`location_id.is.null,location_id.eq.${locationId}`)
    .order("display_order", { ascending: true });

  if (menuError || !rawMenus || rawMenus.length === 0) return [];

  const rpcResults = await Promise.all(
    rawMenus.map((m: any) =>
      supabase.rpc("get_menu_with_categories", {
        p_menu_id: m.id,
        p_location_id: locationId,
      })
    )
  );

  return rpcResults
    .map(({ data }: any) => {
      if (!data) return null;
      return mapRpcMenuToStorefront(data);
    })
    .filter((m): m is StorefrontMenu => m !== null);
}

function mapRpcMenuToStorefront(rpcMenu: any): StorefrontMenu | null {
  const rpcCategories = rpcMenu.categories || [];

  const categories: StorefrontCategory[] = rpcCategories
    .filter((mc: any) => mc.is_active !== false)
    .map((mc: any) => {
      const cat = mc.category;
      if (!cat) return null;

      const rpcItems = mc.items || [];
      const items: StorefrontItem[] = rpcItems
        .map((ci: any) => {
          const mi = ci.menu_item;
          const cardPrice = Number(mi.effective_price) || 0;
          const cashPrice = mi.effective_cash_price != null
            ? Number(mi.effective_cash_price)
            : cardPrice;
          const deliveryPrice = mi.effective_delivery_price != null
            ? Number(mi.effective_delivery_price)
            : null;

          const modifierGroups = (mi.modifier_groups || [])
            .filter((mg: any) => mg.is_active !== false)
            .map((mg: any) => ({
              id: mg.id,
              name: mg.name,
              min_selections: mg.min_selections,
              max_selections: mg.max_selections,
              required: mg.is_required,
              options: (mg.items || [])
                .filter((opt: any) => opt.is_active !== false)
                .map((opt: any) => ({
                  id: opt.id,
                  name: opt.name,
                  price: Number(opt.price_modifier) || 0,
                  is_active: true,
                  display_order: 0,
                  is_default: opt.is_default ?? false,
                })),
            }));

          const allergens = Array.isArray(mi.allergens) ? mi.allergens : [];
          const dietaryTags = Array.isArray(mi.dietary_flags) ? mi.dietary_flags : [];

          return {
            id: mi.id,
            name: mi.name,
            description: mi.description,
            price: cardPrice,
            cash_price: cashPrice,
            delivery_price: deliveryPrice ?? cardPrice,
            image: mi.image,
            availability: mi.effective_availability !== false,
            modifier_groups: modifierGroups,
            allergens: allergens.length ? allergens : undefined,
            dietary_tags: dietaryTags.length ? dietaryTags : undefined,
            is_new: mi.is_new === true,
            is_popular: mi.is_popular === true,
          } satisfies StorefrontItem;
        });

      if (items.length === 0) return null;

      return {
        id: cat.id,
        name: cat.name,
        display_order: mc.display_order ?? 0,
        items,
      } satisfies StorefrontCategory;
    })
    .filter((cat: any): cat is StorefrontCategory => cat !== null);

  if (categories.length === 0) return null;

  return {
    id: rpcMenu.id,
    name: rpcMenu.name,
    categories,
  };
}
