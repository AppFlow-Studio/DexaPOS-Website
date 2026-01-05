"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// TYPES
// ============================================================================

export interface ModifierRecipeIngredient {
  id: string;
  modifier_group_item_id: string;
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

export interface ModifierRecipeWithCost {
  ingredients: ModifierRecipeIngredient[];
  total_cost: number;
}

// ============================================================================
// GET RECIPES FOR MODIFIER ITEM
// ============================================================================

export async function GetRecipesForModifierItem(
  modifierItemId: string
): Promise<{
  data?: ModifierRecipeWithCost;
  error?: string;
}> {
  if (!modifierItemId) {
    return { error: "Modifier item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Step 1: Get recipe entries
  const { data: recipes, error: recipesError } = await supabase
    .from("modifier_group_item_recipes")
    .select("*")
    .eq("modifier_group_item_id", modifierItemId)
    .order("created_at", { ascending: true });

  if (recipesError) {
    console.error("Error fetching modifier recipes:", recipesError);
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
    console.error("Error fetching inventory items for modifier:", itemsError);
    return { error: itemsError.message };
  }

  // Create a map for quick lookup
  const itemMap = new Map(
    (inventoryItems || []).map((item) => [item.id, item])
  );

  // Merge recipe data with inventory item data
  const ingredients: ModifierRecipeIngredient[] = recipes.map((recipe) => ({
    id: recipe.id,
    modifier_group_item_id: recipe.modifier_group_item_id,
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
// ADD MODIFIER RECIPE INGREDIENT
// ============================================================================

export async function AddModifierRecipeIngredient(
  modifierItemId: string,
  inventoryItemId: string,
  quantityUsed: number,
  merchantId: string
): Promise<{ data?: ModifierRecipeIngredient; error?: string }> {
  if (!modifierItemId) {
    return { error: "Modifier item ID is required" };
  }

  if (!inventoryItemId) {
    return { error: "Inventory item ID is required" };
  }

  if (quantityUsed <= 0) {
    return { error: "Quantity must be greater than 0" };
  }

  const supabase = createServerSupabaseClient();

  // Check if already exists
  const { data: existing } = await supabase
    .from("modifier_group_item_recipes")
    .select("id")
    .eq("modifier_group_item_id", modifierItemId)
    .eq("inventory_item_id", inventoryItemId)
    .single();

  if (existing) {
    return { error: "This ingredient is already in the recipe" };
  }

  const { data: recipe, error } = await supabase
    .from("modifier_group_item_recipes")
    .insert({
      modifier_group_item_id: modifierItemId,
      inventory_item_id: inventoryItemId,
      quantity_used: quantityUsed,
      merchant_id: merchantId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error adding modifier recipe ingredient:", error);
    return { error: error.message };
  }

  // Fetch the inventory item separately
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .eq("id", inventoryItemId)
    .single();

  return {
    data: {
      ...recipe,
      inventory_item: inventoryItem || null,
    } as ModifierRecipeIngredient,
  };
}

// ============================================================================
// UPDATE MODIFIER RECIPE INGREDIENT
// ============================================================================

export async function UpdateModifierRecipeIngredient(
  recipeId: string,
  quantityUsed: number
): Promise<{ data?: ModifierRecipeIngredient; error?: string }> {
  if (!recipeId) {
    return { error: "Recipe ID is required" };
  }

  if (quantityUsed <= 0) {
    return { error: "Quantity must be greater than 0" };
  }

  const supabase = createServerSupabaseClient();

  const { data: recipe, error } = await supabase
    .from("modifier_group_item_recipes")
    .update({ quantity_used: quantityUsed })
    .eq("id", recipeId)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating modifier recipe ingredient:", error);
    return { error: error.message };
  }

  // Fetch the inventory item separately
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, cost_per_unit, location_id")
    .eq("id", recipe.inventory_item_id)
    .single();

  return {
    data: {
      ...recipe,
      inventory_item: inventoryItem || null,
    } as ModifierRecipeIngredient,
  };
}

// ============================================================================
// REMOVE MODIFIER RECIPE INGREDIENT
// ============================================================================

export async function RemoveModifierRecipeIngredient(
  recipeId: string
): Promise<{ success?: boolean; error?: string }> {
  if (!recipeId) {
    return { error: "Recipe ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("modifier_group_item_recipes")
    .delete()
    .eq("id", recipeId);

  if (error) {
    console.error("Error removing modifier recipe ingredient:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// BULK UPDATE MODIFIER RECIPE (RPC)
// Uses the atomic RPC to replace the entire recipe for a modifier item
// ============================================================================

export async function UpdateModifierItemRecipe(
  modifierItemId: string,
  recipeItems: Array<{ inventoryItemId: string; quantity: number }>
): Promise<{ success?: boolean; error?: string }> {
  if (!modifierItemId) {
    return { error: "Modifier Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  console.log("[UpdateModifierItemRecipe] Calling RPC with:", {
    modifierItemId,
    recipeItemsCount: recipeItems.length,
    recipeItems,
  });

  const { error } = await supabase.rpc("upsert_modifier_item_with_recipe", {
    p_modifier_item_id: modifierItemId,
    p_recipe_items: recipeItems,
  });

  if (error) {
    console.error("[UpdateModifierItemRecipe] RPC Error:", error);
    return { error: error.message };
  }

  console.log("[UpdateModifierItemRecipe] Success");
  return { success: true };
}
