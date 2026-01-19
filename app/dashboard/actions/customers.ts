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
 * Get all customers for a merchant
 */
export async function GetCustomers(
  clerkOrgId: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: "last_order_date" | "lifetime_spend" | "visits" | "created_at";
    ascending?: boolean;
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
