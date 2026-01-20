"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  Discount,
  DiscountFormInput,
  DiscountListFilters,
  DiscountUsageStats,
  defaultApplicableDays,
} from "@/types/discount";
import { discountFormSchema } from "@/lib/validations/discount";
import { LogAuditEvent } from "./audit-logs";

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getMerchantIdFromSession() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await currentUser();
  const publicMetadata = (user?.publicMetadata || {}) as Record<
    string,
    unknown
  >;

  // Try session claims / metadata first
  let merchantId =
    (publicMetadata.merchantId as string | undefined) ||
    ((sessionClaims as Record<string, any> | null)?.merchantId as
      | string
      | undefined) ||
    ((sessionClaims as Record<string, any> | null)?.metadata?.merchantId as
      | string
      | undefined);

  // If not in session, fetch from database via user membership
  if (!merchantId) {
    const supabase = createServerSupabaseClient();
    const { data: userData } = await supabase
      .from("users")
      .select(
        `
        members(
          organizations(
            merchants(id)
          )
        )
      `,
      )
      .eq("id", userId)
      .single();

    merchantId = (userData as any)?.members?.[0]?.organizations?.merchants?.id;
  }

  if (!merchantId) {
    throw new Error("Missing merchant_id on session");
  }

  return merchantId;
}

function normalizeTime(time?: string | null) {
  if (!time) return null;
  return time.length === 5 ? `${time}:00` : time;
}

function serializeDate(date?: Date | null) {
  if (!date) return null;
  return date.toISOString().split("T")[0];
}

function buildPayload(input: DiscountFormInput, merchantId: string) {
  const parsed = discountFormSchema.parse(input);

  return {
    merchant_id: merchantId,
    name: parsed.name,
    description: parsed.description ?? null,
    discount_type: parsed.discount_type,
    discount_value: parsed.discount_value,
    min_purchase_amount: parsed.min_purchase_amount ?? null,
    max_discount_amount:
      parsed.discount_type === "percentage"
        ? (parsed.max_discount_amount ?? null)
        : null,
    start_date: serializeDate(parsed.start_date),
    end_date: serializeDate(parsed.end_date),
    is_active: parsed.is_active,
    scope: parsed.scope,
    requires_manager_approval: parsed.requires_manager_approval,
    max_uses_per_day: parsed.max_uses_per_day ?? null,
    max_uses_per_order: parsed.max_uses_per_order ?? 1,
    applicable_days: parsed.applicable_days?.length
      ? parsed.applicable_days
      : defaultApplicableDays,
    applicable_hours_start: normalizeTime(parsed.applicable_hours_start),
    applicable_hours_end: normalizeTime(parsed.applicable_hours_end),
    exclude_alcohol: parsed.exclude_alcohol,
    exclude_categories: parsed.exclude_categories?.length
      ? parsed.exclude_categories
      : null,
    applies_to_categories: parsed.applies_to_categories?.length
      ? parsed.applies_to_categories
      : null,
    stackable: parsed.stackable,
    display_order: parsed.display_order ?? 0,
    updated_at: new Date().toISOString(),
  };
}

export async function listDiscounts(filters: DiscountListFilters = {}) {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    let query = supabase
      .from("discounts")
      .select("*, menu_item_discounts (menu_item_id)")
      .eq("merchant_id", merchantId);

    if (filters.isActive !== undefined && filters.isActive !== "all") {
      query = query.eq("is_active", filters.isActive);
    }

    if (filters.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    const sortBy = filters.sortBy ?? "display_order";
    const ascending = filters.sortDir !== "desc";

    const { data, error } = await query
      .order(sortBy, { ascending })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return { success: true, data: (data || []) as Discount[] };
  } catch (error) {
    console.error("[listDiscounts] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch discounts",
    };
  }
}

export async function getDiscountById(discountId: string) {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    const { data, error } = await supabase
      .from("discounts")
      .select("*, menu_item_discounts (menu_item_id)")
      .eq("merchant_id", merchantId)
      .eq("id", discountId)
      .single();

    if (error || !data) {
      throw error || new Error("Discount not found");
    }

    const menuItemIds =
      (
        data as unknown as { menu_item_discounts?: { menu_item_id: string }[] }
      ).menu_item_discounts?.map((row) => row.menu_item_id) || [];

    return {
      success: true,
      data: { ...(data as Discount), menu_item_ids: menuItemIds },
    };
  } catch (error) {
    console.error("[getDiscountById] error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load discount",
    };
  }
}

async function upsertMenuItemLinks(
  discountId: string,
  merchantId: string,
  menuItemIds?: string[] | null,
) {
  const supabase = createServerSupabaseClient();
  console.log(
    `[upsertMenuItemLinks] Updating links for discount: ${discountId}, items:`,
    menuItemIds,
  );

  // Clear existing links first
  const { error: deleteError } = await supabase
    .from("menu_item_discounts")
    .delete()
    .eq("discount_id", discountId);

  if (deleteError) {
    console.error("[upsertMenuItemLinks] DELETE error:", deleteError);
    throw new Error(`Failed to clear existing items: ${deleteError.message}`);
  }

  if (!menuItemIds || menuItemIds.length === 0) {
    console.log("[upsertMenuItemLinks] No items to insert, finished.");
    return;
  }

  // The table has: id, menu_item_id, discount_id, created_at, merchant_id
  const { error: insertError } = await supabase
    .from("menu_item_discounts")
    .insert(
      menuItemIds.map((menu_item_id) => ({
        discount_id: discountId,
        menu_item_id,
        merchant_id: merchantId,
      })),
    );

  if (insertError) {
    console.error("[upsertMenuItemLinks] INSERT error:", insertError);
    throw new Error(`Failed to save items: ${insertError.message}`);
  }

  console.log("[upsertMenuItemLinks] Successfully saved items.");
}

export async function createDiscount(
  input: DiscountFormInput,
): Promise<MutationResult<Discount>> {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();
    const payload = buildPayload(input, merchantId);

    const { data, error } = await supabase
      .from("discounts")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      throw error || new Error("Failed to create discount");
    }

    await upsertMenuItemLinks(data.id, merchantId, input.menu_item_ids);

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Created Discount: ${input.name}`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: data.id,
      resourceName: input.name,
      metadata: {
        discount_type: input.discount_type,
        discount_value: input.discount_value,
      },
    });

    return { success: true, data: data as Discount };
  } catch (error) {
    console.error("[createDiscount] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create discount",
    };
  }
}

export async function updateDiscount(
  discountId: string,
  input: DiscountFormInput,
): Promise<MutationResult<Discount>> {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();
    const payload = buildPayload(input, merchantId);

    const { data, error } = await supabase
      .from("discounts")
      .update(payload)
      .eq("id", discountId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error || !data) {
      throw error || new Error("Failed to update discount");
    }

    await upsertMenuItemLinks(discountId, merchantId, input.menu_item_ids);

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Updated Discount: ${data.name}`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: discountId,
      resourceName: data.name,
      changes: { after: input as unknown as Record<string, unknown> },
    });

    return { success: true, data: data as Discount };
  } catch (error) {
    console.error("[updateDiscount] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update discount",
    };
  }
}

export async function toggleDiscountActive(
  discountId: string,
  isActive: boolean,
): Promise<MutationResult<null>> {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    // Fetch discount name for audit log
    const { data: discount } = await supabase
      .from("discounts")
      .select("name")
      .eq("id", discountId)
      .single();

    const { error } = await supabase
      .from("discounts")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", discountId)
      .eq("merchant_id", merchantId);

    if (error) throw error;

    // Log audit event
    const status = isActive ? "activated" : "deactivated";
    await LogAuditEvent({
      merchantId,
      action: `Discount ${status}: ${discount?.name || "Unknown"}`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: discountId,
      resourceName: discount?.name,
      changes: { after: { is_active: isActive } },
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("[toggleDiscountActive] error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}

export async function bulkUpdateDiscountStatus(
  discountIds: string[],
  isActive: boolean,
): Promise<MutationResult<number>> {
  try {
    if (!discountIds.length) return { success: true, data: 0 };
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    const { error, count } = await supabase
      .from("discounts")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .in("id", discountIds)
      .eq("merchant_id", merchantId)
      // @ts-expect-error - Supabase types don't properly type the second argument
      .select("*", { count: "exact", head: true });

    if (error) throw error;

    // Log bulk update
    await LogAuditEvent({
      merchantId,
      action: `Bulk Updated Status ${isActive ? "Activated" : "Deactivated"} ${count} Discounts`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: undefined,
      resourceName: `${count} Discounts`,
      metadata: {
        count: count,
        discount_ids: discountIds,
        new_status: isActive,
      },
    });

    return { success: true, data: count || 0 };
  } catch (error) {
    console.error("[bulkUpdateDiscountStatus] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update discounts",
    };
  }
}

export async function deleteDiscount(
  discountId: string,
  mode: "soft" | "hard" = "hard",
): Promise<MutationResult<null>> {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    // Fetch discount name for audit log
    const { data: discount } = await supabase
      .from("discounts")
      .select("name")
      .eq("id", discountId)
      .single();

    if (mode === "soft") {
      const { error } = await supabase
        .from("discounts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", discountId)
        .eq("merchant_id", merchantId);

      if (error) throw error;

      // Log audit event
      await LogAuditEvent({
        merchantId,
        action: `Soft Deleted Discount: ${discount?.name || "Unknown"}`,
        actionCategory: "settings",
        resourceType: "discount",
        resourceId: discountId,
        resourceName: discount?.name,
      });

      return { success: true, data: null };
    }

    await supabase
      .from("menu_item_discounts")
      .delete()
      .eq("discount_id", discountId);

    const { error } = await supabase
      .from("discounts")
      .delete()
      .eq("id", discountId)
      .eq("merchant_id", merchantId);
    if (error) throw error;

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Deleted Discount: ${discount?.name || "Unknown"}`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: discountId,
      resourceName: discount?.name,
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("[deleteDiscount] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete discount",
    };
  }
}

export async function bulkDeleteDiscounts(
  discountIds: string[],
  mode: "soft" | "hard" = "hard",
): Promise<MutationResult<number>> {
  try {
    if (!discountIds.length) return { success: true, data: 0 };
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    if (mode === "soft") {
      const { data, error } = await supabase
        .from("discounts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", discountIds)
        .eq("merchant_id", merchantId)
        .select();

      if (error) throw error;
      const count = data?.length || 0;

      // Log bulk delete (soft)
      await LogAuditEvent({
        merchantId,
        action: `Bulk Deleted ${count} Discounts (soft)`,
        actionCategory: "settings",
        resourceType: "discount",
        resourceId: undefined,
        resourceName: `${count} Discounts`,
        metadata: {
          count: count,
          discount_ids: discountIds,
          mode: mode,
        },
      });

      return { success: true, data: count };
    }

    await supabase
      .from("menu_item_discounts")
      .delete()
      .in("discount_id", discountIds);
    const { data, error } = await supabase
      .from("discounts")
      .delete()
      .in("id", discountIds)
      .eq("merchant_id", merchantId)
      .select();

    if (error) throw error;

    const count = data?.length || 0;
    if (error) throw error;

    // Log bulk delete
    await LogAuditEvent({
      merchantId,
      action: `Bulk Deleted ${count} Discounts (${mode})`,
      actionCategory: "settings",
      resourceType: "discount",
      resourceId: undefined,
      resourceName: `${count} Discounts`,
      metadata: {
        count: count,
        discount_ids: discountIds,
        mode: mode,
      },
    });

    return { success: true, data: count || 0 };
  } catch (error) {
    console.error("[bulkDeleteDiscounts] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete discounts",
    };
  }
}

export async function getDiscountUsage(
  discountId: string,
): Promise<MutationResult<DiscountUsageStats>> {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromSession();

    const { count, error } = await supabase
      .from("order_discounts")
      .select("*", { count: "exact", head: true })
      .eq("discount_id", discountId)
      .eq("merchant_id", merchantId);

    if (error) throw error;

    return {
      success: true,
      data: { usage_count: count || 0, last_used_at: null },
    };
  } catch (error) {
    console.error("[getDiscountUsage] error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load usage",
    };
  }
}

export async function listCategoriesForMerchant(merchantId?: string) {
  try {
    const supabase = createServerSupabaseClient();
    const effectiveMerchantId =
      merchantId || (await getMerchantIdFromSession());

    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .eq("merchant_id", effectiveMerchantId)
      .order("name", { ascending: true });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("[listCategoriesForMerchant] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load categories",
    };
  }
}

export async function listMenuItemsForMerchant(merchantId?: string) {
  try {
    const supabase = createServerSupabaseClient();
    const effectiveMerchantId =
      merchantId || (await getMerchantIdFromSession());

    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("merchant_id", effectiveMerchantId)
      .order("name", { ascending: true });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("[listMenuItemsForMerchant] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load menu items",
    };
  }
}
