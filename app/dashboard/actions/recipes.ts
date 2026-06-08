"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// TYPES
// ============================================================================

export interface RecipeIngredient {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_used: number;
  created_at: string;
  // Joined inventory item data
  inventory_item?: {
    id: string;
    name: string;
    sku: string | null;
    unit_type: string;
    cost_per_unit: number;
    location_id: string | null;
  } | null;
}

export interface RecipeWithCost {
  ingredients: RecipeIngredient[];
  total_cost: number;
}

// ============================================================================
// GET RECIPES FOR MENU ITEM
// ============================================================================

export async function GetRecipesForMenuItem(menuItemId: string): Promise<{
  data?: RecipeWithCost;
  error?: string;
}> {
  if (!menuItemId) {
    return { error: "Menu item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Step 1: Get recipe entries
  const { data: recipes, error: recipesError } = await supabase
    .from("menu_item_recipes")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .order("created_at", { ascending: true });

  if (recipesError) {
    console.error("Error fetching recipes:", recipesError);
    return { error: recipesError.message };
  }

  if (!recipes || recipes.length === 0) {
    return {
      data: { ingredients: [], total_cost: 0 },
    };
  }

  // Step 2: Get inventory items for those recipes
  const inventoryItemIds = recipes.map((r) => r.inventory_item_id);
  const { data: inventoryItems, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .in("id", inventoryItemIds);

  if (itemsError) {
    console.error("Error fetching inventory items:", itemsError);
    return { error: itemsError.message };
  }

  // Create a map for quick lookup
  const itemMap = new Map(
    (inventoryItems || []).map((item) => [item.id, item]),
  );

  // Merge recipe data with inventory item data
  const ingredients: RecipeIngredient[] = recipes.map((recipe) => ({
    id: recipe.id,
    menu_item_id: recipe.menu_item_id,
    inventory_item_id: recipe.inventory_item_id,
    quantity_used: recipe.quantity_used,
    created_at: recipe.created_at,
    inventory_item: itemMap.get(recipe.inventory_item_id) || null,
  }));

  // Calculate total cost
  const total_cost = ingredients.reduce((sum, ing) => {
    const cost = ing.inventory_item?.cost_per_unit || 0;
    return sum + cost * ing.quantity_used;
  }, 0);

  return {
    data: {
      ingredients,
      total_cost,
    },
  };
}

// ============================================================================
// ADD RECIPE INGREDIENT
// ============================================================================

export async function AddRecipeIngredient(
  menuItemId: string,
  inventoryItemId: string,
  quantityUsed: number,
): Promise<{ data?: RecipeIngredient; error?: string }> {
  if (!menuItemId) {
    return { error: "Menu item ID is required" };
  }

  if (!inventoryItemId) {
    return { error: "Inventory item ID is required" };
  }

  if (quantityUsed <= 0) {
    return { error: "Quantity must be greater than 0" };
  }

  const supabase = createServerSupabaseClient();

  // Get the menu item to retrieve merchant_id
  const { data: menuItem, error: menuItemError } = await supabase
    .from("menu_items")
    .select("merchant_id")
    .eq("id", menuItemId)
    .single();

  if (menuItemError || !menuItem) {
    console.error("Error fetching menu item:", menuItemError);
    return { error: "Menu item not found" };
  }

  // Check if already exists
  const { data: existing } = await supabase
    .from("menu_item_recipes")
    .select("id")
    .eq("menu_item_id", menuItemId)
    .eq("inventory_item_id", inventoryItemId)
    .single();

  if (existing) {
    return { error: "This ingredient is already in the recipe" };
  }

  const { data: recipe, error } = await supabase
    .from("menu_item_recipes")
    .insert({
      menu_item_id: menuItemId,
      inventory_item_id: inventoryItemId,
      quantity_used: quantityUsed,
      merchant_id: menuItem.merchant_id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error adding recipe ingredient:", error);
    return { error: error.message };
  }

  // Fetch the inventory item separately
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .eq("id", inventoryItemId)
    .single();

  await LogAuditEvent({
    merchantId: menuItem.merchant_id,
    action: `Added Ingredient: ${quantityUsed} ${inventoryItem?.unit_type} ${inventoryItem?.name}`,
    actionCategory: "menu_recipes",
    resourceType: "menu_item_recipe",
    resourceId: recipe.id,
    resourceName: inventoryItem?.name,
    metadata: {
      menu_item_id: menuItemId,
      inventory_item_id: inventoryItemId,
    },
  });

  return {
    data: {
      ...recipe,
      inventory_item: inventoryItem || null,
    } as RecipeIngredient,
  };
}

// ============================================================================
// UPDATE RECIPE INGREDIENT
// ============================================================================

export async function UpdateRecipeIngredient(
  recipeId: string,
  quantityUsed: number,
): Promise<{ data?: RecipeIngredient; error?: string }> {
  if (!recipeId) {
    return { error: "Recipe ID is required" };
  }

  if (quantityUsed <= 0) {
    return { error: "Quantity must be greater than 0" };
  }

  const supabase = createServerSupabaseClient();

  const { data: recipe, error } = await supabase
    .from("menu_item_recipes")
    .update({ quantity_used: quantityUsed })
    .eq("id", recipeId)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating recipe ingredient:", error);
    return { error: error.message };
  }

  // Fetch the inventory item separately
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .eq("id", recipe.inventory_item_id)
    .single();

  // Fetch menu item for context name
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("name")
    .eq("id", recipe.menu_item_id)
    .single();

  await LogAuditEvent({
    merchantId: recipe.merchant_id,
    action: `Updated Ingredient in ${menuItem?.name}: ${inventoryItem?.name}`,
    actionCategory: "menu_recipes",
    resourceType: "menu_item_recipe",
    resourceId: recipeId,
    resourceName: inventoryItem?.name,
    changes: {
      after: { quantity_used: quantityUsed },
    },
  });

  return {
    data: {
      ...recipe,
      inventory_item: inventoryItem || null,
    } as RecipeIngredient,
  };
}

// ============================================================================
// REMOVE RECIPE INGREDIENT
// ============================================================================

export async function RemoveRecipeIngredient(
  recipeId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!recipeId) {
    return { error: "Recipe ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch before delete
  const { data: recipeToDelete } = await supabase
    .from("menu_item_recipes")
    .select(
      `
        *,
        inventory_item:inventory_items(name),
        menu_item:menu_items(name)
    `,
    )
    .eq("id", recipeId)
    .single();

  const { error } = await supabase
    .from("menu_item_recipes")
    .delete()
    .eq("id", recipeId);

  if (error) {
    console.error("Error removing recipe ingredient:", error);
    return { error: error.message };
  }

  if (recipeToDelete) {
    const invName =
      (recipeToDelete as any).inventory_item?.name || "Unknown Item";
    const menuName = (recipeToDelete as any).menu_item?.name || "Unknown Dish";

    await LogAuditEvent({
      merchantId: recipeToDelete.merchant_id,
      action: `Removed Ingredient: ${invName} from ${menuName}`,
      actionCategory: "menu_recipes",
      resourceType: "menu_item_recipe",
      resourceId: recipeId,
      resourceName: invName,
    });
  }

  return { success: true };
}

// ============================================================================
// GET AVAILABLE INVENTORY ITEMS FOR RECIPE
// ============================================================================

export async function GetInventoryItemsForRecipe(
  clerkOrgId: string,
  locationId?: string | null,
  merchantId?: string,
): Promise<{
  data?: Array<{
    id: string;
    name: string;
    sku: string | null;
    unit_type: string;
    cost_per_unit: number;
    location_id: string | null;
  }>;
  error?: string;
}> {
  const supabase = createServerSupabaseClient();
  let finalMerchantId = merchantId;

  if (!finalMerchantId) {
    if (!clerkOrgId) {
      return { error: "Organization ID or Merchant ID is required" };
    }

    // Get merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { error: "Merchant not found" };
    }
    finalMerchantId = merchant.id;
  }

  // Build query - get global items + location-specific items
  let query = supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .eq("merchant_id", finalMerchantId)
    .order("name");

  // If viewing a specific location, get both global (location_id IS NULL)
  // and location-specific items
  if (locationId && locationId !== "all") {
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
  } else {
    // All locations view - only show global items
    query = query.is("location_id", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching inventory items for recipe:", error);
    return { error: error.message };
  }

  return { data: data || [] };
}

// ============================================================================
// BULK UPDATE RECIPE (RPC)
// Uses the atomic RPC to replace the entire recipe for a menu item
// ============================================================================

export async function UpdateMenuItemRecipe(
  menuItemId: string,
  recipeItems: Array<{ inventoryItemId: string; quantity: number }>,
  locationId?: string | null, // Optional - location context
): Promise<{ success?: boolean; error?: string }> {
  if (!menuItemId) {
    return { error: "Menu Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  console.log("[UpdateMenuItemRecipe] Calling RPC with:", {
    menuItemId,
    recipeItemsCount: recipeItems.length,
    recipeItems,
    locationId,
  });

  const { error } = await supabase.rpc("upsert_menu_item_with_recipe", {
    p_menu_item_id: menuItemId,
    p_recipe_items: recipeItems,
    p_location_id: locationId || null,
  });

  if (error) {
    console.error("[UpdateMenuItemRecipe] RPC Error:", error);
    return { error: error.message };
  }

  console.log("[UpdateMenuItemRecipe] Success");

  // Fetch menu item for logs
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("name, merchant_id")
    .eq("id", menuItemId)
    .single();

  if (menuItem) {
    await LogAuditEvent({
      merchantId: menuItem.merchant_id,
      action: `Bulk Updated Recipe for ${menuItem.name}`,
      actionCategory: "menu_recipes",
      resourceType: "menu_item",
      resourceId: menuItemId,
      resourceName: menuItem.name,
      changes: {
        after: { ingredients_count: recipeItems.length },
      },
    });
  }

  return { success: true };
}
