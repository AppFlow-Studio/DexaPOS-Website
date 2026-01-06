"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Site } from "@/types/site";
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
  } | null;
  menus: StorefrontMenu[];
}

export async function getStorefrontData(
  locationId: string
): Promise<StorefrontData> {
  const supabase = createServiceRoleClient();

  // 1. Fetch Site and Location (including merchant_id)
  const [siteResult, locationResult] = await Promise.all([
    supabase.from("sites").select("*").eq("location_id", locationId).single(),
    supabase
      .from("locations")
      .select(
        "id, name, address_line1, city, state, postal_code, phone, email, business_hours, merchant_id"
      )
      .eq("id", locationId)
      .single(),
  ]);

  if (locationResult.error || !locationResult.data) {
    console.error("DEBUG: Location Fetch Error", locationResult.error);
    return { site: siteResult.data, location: null, menus: [] };
  }

  const merchantId = locationResult.data.merchant_id;

  // 2. Fetch MENUS (Both Global and Location-Specific)
  // Logic: merchant_id matches AND (location_id is null OR location_id is this location)
  const { data: rawMenus, error: menuError } = await supabase
    .from("menus")
    .select(
      `
      id,
      name,
      display_order,
      menu_categories (
        category:categories (
          id,
          name,
          display_order
        )
      )
    `
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .or(`location_id.is.null,location_id.eq.${locationId}`)
    .order("display_order", { ascending: true });

  if (menuError) {
    console.error("DEBUG: Menu Fetch Error", menuError);
    return { site: siteResult.data, location: locationResult.data, menus: [] };
  }

  // 3. Extract Category IDs to fetch items
  const allCategoryIds = new Set<string>();
  (rawMenus || []).forEach((m: any) => {
    m.menu_categories?.forEach((mc: any) => {
      if (mc.category?.id) allCategoryIds.add(mc.category.id);
    });
  });

  // 4. Fetch Items for these Categories
  let itemsMap = new Map<string, any[]>();
  let allItemIds = new Set<string>();

  if (allCategoryIds.size > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("category_items")
      .select(
        `
        category_id,
        item:menu_items (
          id,
          name,
          description,
          price,
          image,
          availability
        )
      `
      )
      .in("category_id", Array.from(allCategoryIds));

    if (!itemsError && itemsData) {
      itemsData.forEach((row: any) => {
        const catId = row.category_id;
        const item = row.item;
        if (item && item.availability) {
          if (!itemsMap.has(catId)) itemsMap.set(catId, []);
          itemsMap.get(catId)?.push(item);
          allItemIds.add(item.id);
        }
      });
    }
  }

  // 5. Fetch Modifiers for these Items (The "Customize" Step)
  let itemModifiersMap = new Map<string, any[]>();

  if (allItemIds.size > 0) {
    // A. Link Items to Groups
    const { data: itemGroups, error: itemGroupsError } = await supabase
      .from("menu_item_modifier_groups")
      .select("menu_item_id, modifier_group_id, display_order")
      .in("menu_item_id", Array.from(allItemIds))
      .order("display_order");

    if (!itemGroupsError && itemGroups) {
      const allGroupIds = new Set<string>(
        itemGroups.map((ig: any) => ig.modifier_group_id)
      );

      if (allGroupIds.size > 0) {
        // B. Fetch Group Details
        const { data: groups, error: groupsError } = await supabase
          .from("modifier_groups")
          .select("id, name, min_selections, max_selections, is_required")
          .in("id", Array.from(allGroupIds));

        // C. Fetch Group Options
        const { data: options, error: optionsError } = await supabase
          .from("modifier_group_items")
          .select(
            "modifier_group_id, id, name, price_modifier, display_order, is_active"
          )
          .in("modifier_group_id", Array.from(allGroupIds))
          .eq("is_active", true)
          .order("display_order");

        const groupsMap = new Map(groups?.map((g: any) => [g.id, g]));
        const optionsMap = new Map<string, any[]>();

        options?.forEach((opt: any) => {
          if (!optionsMap.has(opt.modifier_group_id))
            optionsMap.set(opt.modifier_group_id, []);
          optionsMap.get(opt.modifier_group_id)?.push({
            id: opt.id,
            name: opt.name,
            price: Number(opt.price_modifier),
            is_active: opt.is_active,
            display_order: opt.display_order,
          });
        });

        // Assemble Item Modifiers
        itemGroups.forEach((ig: any) => {
          const groupDetails = groupsMap.get(ig.modifier_group_id);
          const groupOptions = optionsMap.get(ig.modifier_group_id) || [];

          if (groupDetails) {
            const fullGroup = {
              ...groupDetails,
              required: groupDetails.is_required, // mapping db col to type
              options: groupOptions,
            };

            if (!itemModifiersMap.has(ig.menu_item_id))
              itemModifiersMap.set(ig.menu_item_id, []);
            itemModifiersMap.get(ig.menu_item_id)?.push(fullGroup);
          }
        });
      }
    }
  }

  // 6. Final Merge
  const menus: StorefrontMenu[] = (rawMenus || [])
    .map((m: any) => {
      const categories: StorefrontCategory[] = (m.menu_categories || [])
        .map((mc: any) => {
          const cat = mc.category;
          if (!cat) return null;

          // Merge Items with their Modifiers
          const itemsRaw = itemsMap.get(cat.id) || [];
          const items: StorefrontItem[] = itemsRaw.map((item) => ({
            ...item,
            modifier_groups: itemModifiersMap.get(item.id) || [],
          }));

          return {
            id: cat.id,
            name: cat.name,
            display_order: cat.display_order,
            items,
          };
        })
        .filter((cat: any) => cat !== null); // Filter null cats

      // Only include menu if it has categories
      if (categories.length === 0) return null;

      return {
        id: m.id,
        name: m.name,
        categories,
      };
    })
    .filter((m): m is StorefrontMenu => m !== null);

  return {
    site: siteResult.data,
    location: locationResult.data,
    menus,
  };
}
