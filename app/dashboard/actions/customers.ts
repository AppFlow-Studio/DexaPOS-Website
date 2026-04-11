"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Customer,
  CustomerProfile,
  CustomerListItem,
} from "@/types/customer";
import { LogAuditEvent } from "./audit-logs";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get merchant ID from clerk org ID
 */
async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[Customers] Error getting merchant:", error);
    return null;
  }

  return merchant.id;
}

// =============================================================================
// Customer List Actions
// =============================================================================

/**
 * Get all customers for a merchant, optionally filtered by location
 * When locationId is provided (not 'all'), only returns customers who have orders at that location
 */
export async function GetCustomers(
  clerkOrgId: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: "last_order_date" | "lifetime_spend" | "visits" | "created_at";
    ascending?: boolean;
    locationId?: string;
  },
): Promise<CustomerListItem[]> {
  if (!clerkOrgId) {
    return [];
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const orderBy = options?.orderBy ?? "last_order_date";
  const ascending = options?.ascending ?? false;
  const locationId = options?.locationId;

  // If a specific location is selected, filter customers via orders at that location
  // and compute location-specific spend/visits instead of using merchant-wide totals
  if (locationId && locationId !== "all") {
    const { data: locationOrders, error: orderError } = await supabase
      .from("orders")
      .select("customer_id, total_amount, created_at")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .not("customer_id", "is", null);

    if (orderError) {
      console.error("[GetCustomers] Error fetching location orders:", orderError);
      return [];
    }

    // Aggregate per-customer stats from orders at this location
    const customerStats = new Map<string, { spend: number; orders: number; lastVisit: string | null }>();
    for (const order of locationOrders || []) {
      const cid = order.customer_id as string;
      const existing = customerStats.get(cid);
      const amount = Number(order.total_amount) || 0;
      if (existing) {
        existing.spend += amount;
        existing.orders += 1;
        if (order.created_at && (!existing.lastVisit || order.created_at > existing.lastVisit)) {
          existing.lastVisit = order.created_at;
        }
      } else {
        customerStats.set(cid, { spend: amount, orders: 1, lastVisit: order.created_at });
      }
    }

    const uniqueIds = [...customerStats.keys()];
    if (uniqueIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("customers")
      .select(
        `
        id,
        name,
        phone,
        email,
        tags
      `,
      )
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .in("id", uniqueIds);

    if (error) {
      console.error("[GetCustomers] Error fetching customers:", error);
      return [];
    }

    // Merge customer data with location-specific stats
    const results: CustomerListItem[] = (data || []).map((c) => {
      const stats = customerStats.get(c.id)!;
      return {
        ...c,
        lifetime_spend: stats.spend,
        visits: stats.orders,
        total_orders: stats.orders,
        avg_spend: stats.orders > 0 ? stats.spend / stats.orders : 0,
        last_visit: stats.lastVisit,
      };
    });

    // Sort in JS since we computed the values client-side
    const sortKey = orderBy === "last_order_date" ? "last_visit" : orderBy;
    results.sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? "";
      const bVal = (b as any)[sortKey] ?? "";
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });

    return results.slice(offset, offset + limit);
  }

  // Default: all customers for the merchant
  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      id,
      name,
      phone,
      email,
      lifetime_spend,
      visits,
      last_visit,
      total_orders,
      avg_spend,
      tags
    `,
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order(orderBy, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[GetCustomers] Error fetching customers:", error);
    return [];
  }

  return (data as CustomerListItem[]) || [];
}

/**
 * Search customers by name, phone, or email
 */
export async function SearchCustomers(
  clerkOrgId: string,
  query: string,
  limit: number = 20,
): Promise<CustomerListItem[]> {
  if (!clerkOrgId || !query.trim()) {
    return [];
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const searchTerm = query.trim();

  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      id,
      name,
      phone,
      email,
      lifetime_spend,
      visits,
      last_visit,
      total_orders,
      avg_spend,
      tags
    `,
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .or(
      `name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`,
    )
    .order("last_order_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("[SearchCustomers] Error searching customers:", error);
    return [];
  }

  return (data as CustomerListItem[]) || [];
}

// =============================================================================
// Customer Profile Actions (using RPC)
// =============================================================================

/**
 * Get full customer profile using the get_customer_profile RPC function
 * Returns customer data, order channels, most ordered items, and recent activity
 */
export async function GetCustomerProfile(
  customerId: string,
): Promise<CustomerProfile | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_profile", {
    p_customer_id: customerId,
  });

  if (error) {
    console.error("[GetCustomerProfile] Error fetching profile:", error);
    return null;
  }

  return data as CustomerProfile;
}

/**
 * Get customer by ID (base data only)
 */
export async function GetCustomerById(
  customerId: string,
): Promise<Customer | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) {
    console.error("[GetCustomerById] Error fetching customer:", error);
    return null;
  }

  return data as Customer;
}

// =============================================================================
// Customer Update Actions
// =============================================================================

/**
 * Update customer fields
 */
export async function UpdateCustomer(
  customerId: string,
  updates: Partial<
    Pick<Customer, "name" | "phone" | "email" | "address" | "notes" | "tags">
  >,
): Promise<{ success: boolean; error?: string; data?: Customer }> {
  if (!customerId) {
    return { success: false, error: "Customer ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    console.error("[UpdateCustomer] Error updating customer:", error);
    return { success: false, error: error.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: data.merchant_id,
    action: `Updated Customer: ${data.name}`,
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: customerId,
    resourceName: data.name,
    changes: { after: updates },
    metadata: {
      email: data.email,
      phone: data.phone,
    },
  });

  return { success: true, data: data as Customer };
}

/**
 * Add a tag to a customer (appends to existing tags array)
 */
export async function AddCustomerTag(
  customerId: string,
  tag: string,
): Promise<{ success: boolean; error?: string; tags?: string[] }> {
  if (!customerId || !tag.trim()) {
    return { success: false, error: "Customer ID and tag are required" };
  }

  const supabase = createServerSupabaseClient();

  // First get current tags
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("tags, merchant_id, name")
    .eq("id", customerId)
    .single();

  if (fetchError) {
    console.error("[AddCustomerTag] Error fetching customer:", fetchError);
    return { success: false, error: fetchError.message };
  }

  const currentTags = customer?.tags || [];
  const normalizedTag = tag.trim().toUpperCase();

  // Check if tag already exists
  if (currentTags.includes(normalizedTag)) {
    return { success: true, tags: currentTags };
  }

  const newTags = [...currentTags, normalizedTag];

  const { data, error: updateError } = await supabase
    .from("customers")
    .update({
      tags: newTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select("tags")
    .single();

  if (updateError) {
    console.error("[AddCustomerTag] Error updating tags:", updateError);
    return { success: false, error: updateError.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: customer.merchant_id, // Fetch merchant_id if needed, but likely we need to select it above
    action: `Added Tag to Customer`,
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: customerId,
    resourceName: customer.name || "Unknown Customer",
    metadata: {
      tag: normalizedTag,
      new_tags: newTags,
    },
  });

  return { success: true, tags: data?.tags || newTags };
}

/**
 * Remove a tag from a customer
 */
export async function RemoveCustomerTag(
  customerId: string,
  tag: string,
): Promise<{ success: boolean; error?: string; tags?: string[] }> {
  if (!customerId || !tag.trim()) {
    return { success: false, error: "Customer ID and tag are required" };
  }

  const supabase = createServerSupabaseClient();

  // First get current tags
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("tags, merchant_id, name")
    .eq("id", customerId)
    .single();

  if (fetchError) {
    console.error("[RemoveCustomerTag] Error fetching customer:", fetchError);
    return { success: false, error: fetchError.message };
  }

  const currentTags = customer?.tags || [];
  const normalizedTag = tag.trim().toUpperCase();
  const newTags = currentTags.filter((t: string) => t !== normalizedTag);

  const { data, error: updateError } = await supabase
    .from("customers")
    .update({
      tags: newTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select("tags")
    .single();

  if (updateError) {
    console.error("[RemoveCustomerTag] Error updating tags:", updateError);
    return { success: false, error: updateError.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: customer.merchant_id,
    action: `Removed Tag from Customer`,
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: customerId,
    resourceName: customer.name || "Unknown Customer",
    metadata: {
      tag: normalizedTag,
      remaining_tags: newTags,
    },
  });

  return { success: true, tags: data?.tags || newTags };
}

/**
 * Update customer notes
 */
export async function UpdateCustomerNotes(
  customerId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  if (!customerId) {
    return { success: false, error: "Customer ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("customers")
    .update({
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    console.error("[UpdateCustomerNotes] Error updating notes:", error);
    return { success: false, error: error.message };
  }

  // Get customer details for log
  const { data: customer } = await supabase
    .from("customers")
    .select("merchant_id, name")
    .eq("id", customerId)
    .single();

  if (customer) {
    await LogAuditEvent({
      merchantId: customer.merchant_id,
      action: `Updated Customer Notes`,
      actionCategory: "customer",
      resourceType: "customer",
      resourceId: customerId,
      resourceName: customer.name,
      changes: { after: { notes } },
    });
  }

  return { success: true };
}

// =============================================================================
// Customer Count/Stats Actions
// =============================================================================

/**
 * Get total customer count for a merchant
 */
export async function GetCustomerCount(clerkOrgId: string): Promise<number> {
  if (!clerkOrgId) {
    return 0;
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return 0;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("merchant_id", merchantId);

  const count = data?.length || 0;

  if (error) {
    console.error("[GetCustomerCount] Error counting customers:", error);
    return 0;
  }

  return count || 0;
}

// =============================================================================
// Customer Creation & Duplicate Check (Phase 2)
// =============================================================================

/**
 * Check if a customer with the given phone already exists
 */
export async function CheckCustomerByPhone(
  clerkOrgId: string,
  phone: string,
): Promise<CustomerListItem | null> {
  if (!clerkOrgId || !phone?.trim()) {
    return null;
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      id,
      name,
      phone,
      email,
      lifetime_spend,
      visits,
      last_visit,
      total_orders,
      avg_spend,
      tags
    `,
    )
    .eq("merchant_id", merchantId)
    .eq("phone", phone.trim())
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("[CheckCustomerByPhone] Error:", error);
    return null;
  }

  return (data as CustomerListItem) || null;
}

/**
 * Create a new customer
 */
export async function CreateCustomer(
  clerkOrgId: string,
  data: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    birthday?: string;
    anniversary?: string;
    company_name?: string;
    vip_level?: string;
    preferred_seating?: string;
    dietary_preferences?: string[];
    allergy_notes?: string;
    preferred_table?: string;
    preferred_language?: string;
    email_opt_in?: boolean;
    sms_opt_in?: boolean;
    receipt_via_email?: boolean;
    receipt_via_sms?: boolean;
    tags?: string[];
    notes?: string;
  },
): Promise<{ success: boolean; error?: string; customerId?: string }> {
  if (!clerkOrgId || !data.name?.trim() || !data.phone?.trim()) {
    return { success: false, error: "Name and phone are required" };
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return { success: false, error: "Merchant not found" };
  }

  const supabase = createServerSupabaseClient();

  // Normalize tags to uppercase
  const normalizedTags = (data.tags || []).map((tag) => tag.trim().toUpperCase());

  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({
      merchant_id: merchantId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      birthday: data.birthday || null,
      anniversary: data.anniversary || null,
      company_name: data.company_name || null,
      vip_level: data.vip_level && data.vip_level !== "None" ? data.vip_level : null,
      preferred_seating: data.preferred_seating || null,
      dietary_preferences: data.dietary_preferences && data.dietary_preferences.length > 0 ? data.dietary_preferences : null,
      allergy_notes: data.allergy_notes || null,
      preferred_table: data.preferred_table || null,
      preferred_language: data.preferred_language || null,
      email_opt_in: data.email_opt_in ?? false,
      sms_opt_in: data.sms_opt_in ?? false,
      receipt_via_email: data.receipt_via_email ?? false,
      receipt_via_sms: data.receipt_via_sms ?? false,
      tags: normalizedTags.length > 0 ? normalizedTags : [],
      notes: data.notes?.trim() || null,
      is_active: true,
      visits: 0,
      lifetime_spend: 0,
      avg_spend: 0,
      total_orders: 0,
      avg_tip_percent: 0,
      last_visit: null,
      last_order_date: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[CreateCustomer] Error creating customer:", error);
    return { success: false, error: error.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId,
    action: `Created Customer: ${data.name}`,
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: newCustomer.id,
    resourceName: data.name,
    metadata: {
      phone: data.phone,
      email: data.email,
      tags: normalizedTags,
      vip_level: data.vip_level,
      preferred_seating: data.preferred_seating,
      dietary_preferences: data.dietary_preferences,
      allergy_notes: data.allergy_notes,
      preferred_table: data.preferred_table,
      preferred_language: data.preferred_language,
      email_opt_in: data.email_opt_in,
      sms_opt_in: data.sms_opt_in,
      receipt_via_email: data.receipt_via_email,
      receipt_via_sms: data.receipt_via_sms,
      birthday: data.birthday,
      anniversary: data.anniversary,
      company_name: data.company_name,
    },
  });

  return { success: true, customerId: newCustomer.id };
}

/**
 * Bulk add a tag to multiple customers
 */
export async function BulkAddTagToCustomers(
  customerIds: string[],
  tag: string,
): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
  if (!customerIds.length || !tag?.trim()) {
    return { success: false, error: "Customers and tag are required" };
  }

  const supabase = createServerSupabaseClient();
  const normalizedTag = tag.trim().toUpperCase();
  let updatedCount = 0;

  // Process each customer (could be optimized with array operations in Postgres)
  for (const customerId of customerIds) {
    const { data: customer, error: fetchError } = await supabase
      .from("customers")
      .select("tags, merchant_id, name")
      .eq("id", customerId)
      .single();

    if (fetchError) {
      console.error("[BulkAddTagToCustomers] Error fetching customer:", fetchError);
      continue;
    }

    const currentTags = customer?.tags || [];
    if (currentTags.includes(normalizedTag)) {
      continue; // Tag already exists
    }

    const newTags = [...currentTags, normalizedTag];
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        tags: newTags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (!updateError) {
      updatedCount++;
      // Log audit event
      await LogAuditEvent({
        merchantId: customer.merchant_id,
        action: `Added Tag to Customer (Bulk)`,
        actionCategory: "customer",
        resourceType: "customer",
        resourceId: customerId,
        resourceName: customer.name || "Unknown Customer",
        metadata: {
          tag: normalizedTag,
          new_tags: newTags,
        },
      });
    }
  }

  return { success: true, updatedCount };
}

/**
 * Bulk remove a tag from multiple customers
 */
export async function BulkRemoveTagFromCustomers(
  customerIds: string[],
  tag: string,
): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
  if (!customerIds.length || !tag?.trim()) {
    return { success: false, error: "Customers and tag are required" };
  }

  const supabase = createServerSupabaseClient();
  const normalizedTag = tag.trim().toUpperCase();
  let updatedCount = 0;

  for (const customerId of customerIds) {
    const { data: customer, error: fetchError } = await supabase
      .from("customers")
      .select("tags, merchant_id, name")
      .eq("id", customerId)
      .single();

    if (fetchError) {
      console.error("[BulkRemoveTagFromCustomers] Error fetching customer:", fetchError);
      continue;
    }

    const currentTags = customer?.tags || [];
    if (!currentTags.includes(normalizedTag)) {
      continue; // Tag doesn't exist
    }

    const newTags = currentTags.filter((t: string) => t !== normalizedTag);
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        tags: newTags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (!updateError) {
      updatedCount++;
      await LogAuditEvent({
        merchantId: customer.merchant_id,
        action: `Removed Tag from Customer (Bulk)`,
        actionCategory: "customer",
        resourceType: "customer",
        resourceId: customerId,
        resourceName: customer.name || "Unknown Customer",
        metadata: {
          tag: normalizedTag,
          remaining_tags: newTags,
        },
      });
    }
  }

  return { success: true, updatedCount };
}

// =============================================================================
// Smart Deduplication (Phase 3) - Requires RPC functions
// =============================================================================

/**
 * Find duplicate customer groups
 * Requires: find_duplicate_customers(p_merchant_id uuid) RPC function
 */
export async function FindDuplicateCustomers(
  clerkOrgId: string,
): Promise<
  Array<{
    customers: CustomerListItem[];
    reason: "same_phone" | "similar_name";
  }> | null
> {
  if (!clerkOrgId) {
    return null;
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  // Call the RPC function (once it's created in Supabase)
  const { data, error } = await supabase.rpc("find_duplicate_customers", {
    p_merchant_id: merchantId,
  });

  if (error) {
    console.error("[FindDuplicateCustomers] Error:", error);
    return null;
  }

  return data as Array<{
    customers: CustomerListItem[];
    reason: "same_phone" | "similar_name";
  }> | null;
}

/**
 * Merge duplicate customers into a primary customer
 * Requires: merge_customers(p_primary_id uuid, p_duplicate_ids uuid[]) RPC function
 */
export async function MergeCustomers(
  primaryId: string,
  duplicateIds: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!primaryId || !duplicateIds || duplicateIds.length === 0) {
    return { success: false, error: "Primary ID and duplicate IDs are required" };
  }

  const supabase = createServerSupabaseClient();

  // Call the RPC function (once it's created in Supabase)
  const { error } = await supabase.rpc("merge_customers", {
    p_primary_id: primaryId,
    p_duplicate_ids: duplicateIds,
  });

  if (error) {
    console.error("[MergeCustomers] Error:", error);
    return { success: false, error: error.message };
  }

  // Get customer details for audit log
  const { data: customer } = await supabase
    .from("customers")
    .select("merchant_id, name")
    .eq("id", primaryId)
    .single();

  if (customer) {
    await LogAuditEvent({
      merchantId: customer.merchant_id,
      action: `Merged Duplicate Customers`,
      actionCategory: "customer",
      resourceType: "customer",
      resourceId: primaryId,
      resourceName: customer.name,
      metadata: {
        primary_id: primaryId,
        merged_ids: duplicateIds,
      },
    });
  }

  return { success: true };
}

// =============================================================================
// Delete Customer
// =============================================================================

/**
 * Delete a customer by ID
 */
/**
 * Soft delete a customer (mark as inactive instead of removing from database)
 */
export async function DeleteCustomer(
  customerId: string,
  clerkOrgId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!customerId || !clerkOrgId) {
    return { success: false, error: "Customer ID and organization ID are required" };
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return { success: false, error: "Merchant not found" };
  }

  const supabase = createServerSupabaseClient();

  // Get customer details before soft deletion for audit log
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, merchant_id, name")
    .eq("id", customerId)
    .eq("merchant_id", merchantId)
    .single();

  if (fetchError || !customer) {
    console.error("[DeleteCustomer] Customer not found:", fetchError);
    return { success: false, error: "Customer not found" };
  }

  // Soft delete the customer by marking is_active as false
  const { error: updateError } = await supabase
    .from("customers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("merchant_id", merchantId);

  if (updateError) {
    console.error("[DeleteCustomer] Error soft deleting customer:", updateError);
    return { success: false, error: updateError.message };
  }

  // Log the soft deletion
  await LogAuditEvent({
    merchantId: customer.merchant_id,
    action: "Deleted Customer",
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: customerId,
    resourceName: customer.name,
    metadata: {
      soft_deleted: true,
      deleted_at: new Date().toISOString(),
    },
  });

  return { success: true };
}

// =============================================================================
// DEXA-CUST-002: Enhanced Overview Tab Analytics
// =============================================================================

/**
 * Get customer spend trend over last 6 months
 */
export async function GetCustomerSpendTrend(
  customerId: string,
  months: number = 6,
): Promise<Array<{
  month: string;
  month_date: string;
  total_spend: number;
  order_count: number;
}> | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_spend_trend", {
    p_customer_id: customerId,
    p_months: months,
  });

  if (error) {
    console.error("[GetCustomerSpendTrend] Error:", error);
    return null;
  }

  return data;
}

/**
 * Get customer visit pattern (day of week and time)
 */
export async function GetCustomerVisitPattern(
  customerId: string,
  days: number = 90,
): Promise<Array<{
  day_of_week: string;
  hour_of_day: number;
  visit_count: number;
  is_peak: boolean;
}> | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_visit_pattern", {
    p_customer_id: customerId,
    p_days: days,
  });

  if (error) {
    console.error("[GetCustomerVisitPattern] Error:", error);
    return null;
  }

  return data;
}

/**
 * Get customer's top items ordered in last 90 days
 */
export async function GetCustomerTopItems(
  customerId: string,
  days: number = 90,
  limit: number = 10,
): Promise<Array<{
  item_id: string;
  item_name: string;
  order_count: number;
  total_spent: number;
  last_ordered_at: string;
  is_new_favorite: boolean;
  frequency_label: string;
}> | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_top_items", {
    p_customer_id: customerId,
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    console.error("[GetCustomerTopItems] Error:", error);
    return null;
  }

  return data;
}

/**
 * Get customer order channel trend
 */
export async function GetCustomerChannelTrend(
  customerId: string,
  days: number = 90,
): Promise<Array<{
  channel: string;
  count_recent: number;
  count_previous: number;
  percentage_recent: number;
  percentage_previous: number;
  trend_label: string;
}> | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_channel_trend", {
    p_customer_id: customerId,
    p_days: days,
  });

  if (error) {
    console.error("[GetCustomerChannelTrend] Error:", error);
    return null;
  }

  return data;
}

/**
 * Get customer activity timeline (unified: orders, tags, notes, feedback)
 */
export async function GetCustomerActivityTimeline(
  customerId: string,
  limit: number = 50,
): Promise<Array<{
  activity_id: string;
  activity_type: string;
  activity_label: string;
  description: string;
  amount_value: number | null;
  currency: string | null;
  created_at: string;
  is_clickable: boolean;
  related_entity_id: string | null;
  related_entity_type: string | null;
}> | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_activity_timeline", {
    p_customer_id: customerId,
    p_limit: limit,
  });

  if (error) {
    console.error("[GetCustomerActivityTimeline] Error:", error);
    return null;
  }

  return data;
}

/**
 * Get customer spend percentile rank (with merchant UUID)
 * @param customerId Customer UUID
 * @param merchantId Merchant UUID (NOT Clerk org ID)
 */
export async function GetCustomerPercentile(
  customerId: string,
  merchantId: string,
): Promise<{
  percentile: number;
  rank_position: number;
  total_customers: number;
  is_top_tier: boolean;
} | null> {
  if (!customerId || !merchantId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_percentile", {
    p_customer_id: customerId,
    p_merchant_id: merchantId,
  });

  if (error) {
    console.error("[GetCustomerPercentile] Error:", error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Get customer spend percentile rank (with Clerk org ID)
 * Handles conversion from Clerk org ID to merchant UUID
 * @param customerId Customer UUID
 * @param clerkOrgId Clerk organization ID (org_*)
 */
export async function GetCustomerPercentileByClerkOrgId(
  customerId: string,
  clerkOrgId: string,
): Promise<{
  percentile: number;
  rank_position: number;
  total_customers: number;
  is_top_tier: boolean;
} | null> {
  if (!customerId || !clerkOrgId) {
    return null;
  }

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    console.error("[GetCustomerPercentileByClerkOrgId] Could not resolve merchant ID from Clerk org ID");
    return null;
  }

  return GetCustomerPercentile(customerId, merchantId);
}

/**
 * Get customer visit frequency trend
 */
export async function GetCustomerVisitTrend(
  customerId: string,
  recentDays: number = 90,
  compareDays: number = 90,
): Promise<{
  recent_visits: number;
  previous_visits: number;
  trend_direction: string;
  trend_percentage: number | null;
} | null> {
  if (!customerId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_customer_visit_trend", {
    p_customer_id: customerId,
    p_recent_days: recentDays,
    p_compare_days: compareDays,
  });

  if (error) {
    console.error("[GetCustomerVisitTrend] Error:", error);
    return null;
  }

  return data?.[0] || null;
}