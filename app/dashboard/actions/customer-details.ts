"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Get complete customer profile details
 */
export async function GetCustomerProfileDetails(customerId: string) {
  if (!customerId) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) {
    console.error("[GetCustomerProfileDetails]", error);
    return null;
  }

  return data;
}

/**
 * Update customer profile information
 */
export async function UpdateCustomerProfile({
  customerId,
  updates,
}: {
  customerId: string;
  updates: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    birthday?: string | null;
    anniversary?: string | null;
    dietary_preferences?: string[];
    allergy_notes?: string;
    preferred_server_id?: string | null;
    preferred_table?: string;
    preferred_seating?: string;
    company_name?: string;
    vip_level?: string;
    tags?: string[];
  };
}) {
  if (!customerId) return null;

  const supabase = createServiceRoleClient();

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
    console.error("[UpdateCustomerProfile]", error);
    return null;
  }

  return data;
}

/**
 * Get customer notes
 */
export async function GetCustomerNotes(customerId: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customer_notes")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerNotes]", error);
    return [];
  }

  return data || [];
}

/**
 * Add a note to customer profile
 */
export async function AddCustomerNote({
  customerId,
  merchantId,
  content,
  createdBy,
  createdByName,
}: {
  customerId: string;
  merchantId: string;
  content: string;
  createdBy: string;
  createdByName: string;
}) {
  if (!customerId || !merchantId || !content) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customer_notes")
    .insert({
      customer_id: customerId,
      merchant_id: merchantId,
      content,
      created_by: createdBy,
      created_by_name: createdByName,
    })
    .select()
    .single();

  if (error) {
    console.error("[AddCustomerNote]", error);
    return null;
  }

  return data;
}

/**
 * Update a customer note
 */
export async function UpdateCustomerNote({
  noteId,
  content,
}: {
  noteId: string;
  content: string;
}) {
  if (!noteId || !content) return null;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customer_notes")
    .update({
      content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select()
    .single();

  if (error) {
    console.error("[UpdateCustomerNote]", error);
    return null;
  }

  return data;
}

/**
 * Delete a customer note
 */
export async function DeleteCustomerNote(noteId: string) {
  if (!noteId) return null;

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("customer_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    console.error("[DeleteCustomerNote]", error);
    return null;
  }

  return { success: true };
}

/**
 * Add a tag to customer
 */
export async function AddCustomerTag({
  customerId,
  tag,
}: {
  customerId: string;
  tag: string;
}) {
  if (!customerId || !tag) return null;

  const supabase = createServiceRoleClient();

  // Get current tags
  const { data: customer } = await supabase
    .from("customers")
    .select("tags")
    .eq("id", customerId)
    .single();

  const currentTags = customer?.tags || [];

  // Add tag if not already present
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }

  const { data, error } = await supabase
    .from("customers")
    .update({
      tags: currentTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    console.error("[AddCustomerTag]", error);
    return null;
  }

  return data;
}

/**
 * Remove a tag from customer
 */
export async function RemoveCustomerTag({
  customerId,
  tag,
}: {
  customerId: string;
  tag: string;
}) {
  if (!customerId || !tag) return null;

  const supabase = createServiceRoleClient();

  // Get current tags
  const { data: customer } = await supabase
    .from("customers")
    .select("tags")
    .eq("id", customerId)
    .single();

  const currentTags = customer?.tags || [];
  const filteredTags = currentTags.filter((t) => t !== tag);

  const { data, error } = await supabase
    .from("customers")
    .update({
      tags: filteredTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    console.error("[RemoveCustomerTag]", error);
    return null;
  }

  return data;
}

/**
 * Get all existing tags for a merchant (for autocomplete)
 */
export async function GetMerchantCustomerTags(merchantId: string) {
  if (!merchantId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customers")
    .select("tags")
    .eq("merchant_id", merchantId)
    .not("tags", "is", null);

  if (error) {
    console.error("[GetMerchantCustomerTags]", error);
    return [];
  }

  // Flatten and deduplicate tags
  const allTags = new Set<string>();
  data?.forEach((customer) => {
    if (Array.isArray(customer.tags)) {
      customer.tags.forEach((tag) => allTags.add(tag));
    }
  });

  return Array.from(allTags).sort();
}

/**
 * Get staff profiles for preferred server dropdown
 */
export async function GetMerchantStaffProfiles(merchantId: string) {
  if (!merchantId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, first_name, last_name, display_name")
    .eq("merchant_id", merchantId)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("[GetMerchantStaffProfiles]", error);
    return [];
  }

  return data || [];
}
