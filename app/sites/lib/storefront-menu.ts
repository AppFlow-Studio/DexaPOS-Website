import type {
  StorefrontCategory,
  StorefrontItem,
  StorefrontMenu,
} from "@/types/storefront";

/**
 * Maps one get_menu_with_categories() menu onto the storefront shape.
 *
 * Every item is stamped with the menu + category it is displayed under. The
 * cart carries that context to create-online-order, which re-derives this exact
 * price from the same RPC (supabase/functions/_shared/storefront-menu-pricing.ts)
 * so the customer is charged what they were shown. Keep the price mapping in
 * step with that file; the parity test pins them together.
 */
export function mapRpcMenuToStorefront(rpcMenu: any): StorefrontMenu | null {
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
            menu_id: rpcMenu.id,
            category_id: cat.id,
            image: mi.image,
            availability: mi.effective_availability !== false,
            modifier_groups: modifierGroups,
            allergens: allergens.length ? allergens : undefined,
            dietary_tags: dietaryTags.length ? dietaryTags : undefined,
            // Emitted top-level by get_menu_with_categories() as of migration
            // 20260728120000. The location_override fallback covers an older
            // RPC revision that only nested is_popular there, so the storefront
            // keeps working regardless of app/DB deploy ordering.
            is_new: (mi.is_new ?? mi.location_override?.is_new) === true,
            is_popular:
              (mi.is_popular ?? mi.location_override?.is_popular) === true,
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
