"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface CustomerProfile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  totalOrders: number;
  lifetimeSpend: number;
  createdAt: string;
}

export async function getCustomerProfile(
  sessionToken: string
): Promise<{ data: CustomerProfile | null; error?: string }> {
  if (!sessionToken) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { data: null, error: "No customer linked" };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, total_orders, lifetime_spend, created_at")
    .eq("id", session.customer_id)
    .single();

  if (!customer) {
    return { data: null, error: "Customer not found" };
  }

  return {
    data: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalOrders: customer.total_orders ?? 0,
      lifetimeSpend: Number(customer.lifetime_spend) || 0,
      createdAt: customer.created_at,
    },
  };
}

export async function updateCustomerProfile(
  sessionToken: string,
  updates: { name?: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!sessionToken) return { success: false, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id, id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { success: false, error: "No customer linked" };
  }

  const dbUpdates: Record<string, any> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;

  const { error } = await supabase
    .from("customers")
    .update(dbUpdates)
    .eq("id", session.customer_id);

  if (error) {
    return { success: false, error: "Failed to update profile" };
  }

  // Sync name/email to session too
  const sessionUpdates: Record<string, any> = {};
  if (updates.name !== undefined) sessionUpdates.customer_name = updates.name;
  if (updates.email !== undefined) sessionUpdates.customer_email = updates.email;

  await supabase
    .from("online_order_sessions")
    .update(sessionUpdates)
    .eq("id", session.id);

  return { success: true };
}

export interface SavedAddress {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes: string | null;
  isDefault: boolean;
}

export async function getSavedAddresses(
  sessionToken: string
): Promise<{ data: SavedAddress[]; error?: string }> {
  if (!sessionToken) return { data: [], error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { data: [], error: "No customer linked" };
  }

  const { data, error } = await supabase
    .from("customer_saved_addresses")
    .select("*")
    .eq("customer_id", session.customer_id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: "Failed to load addresses" };
  }

  return {
    data: (data ?? []).map((a: any) => ({
      id: a.id,
      label: a.label,
      addressLine1: a.address_line1,
      addressLine2: a.address_line2,
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      deliveryNotes: a.delivery_notes,
      isDefault: a.is_default,
    })),
  };
}

export async function addSavedAddress(
  sessionToken: string,
  address: Omit<SavedAddress, "id">
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!sessionToken) return { success: false, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { success: false, error: "No customer linked" };
  }

  // Reject duplicates: same location fields (normalized) already saved for this
  // customer. Label/delivery notes are ignored — those don't define uniqueness.
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const { data: existing } = await supabase
    .from("customer_saved_addresses")
    .select("address_line1, address_line2, city, state, postal_code")
    .eq("customer_id", session.customer_id);

  const isDuplicate = (existing ?? []).some(
    (a) =>
      norm(a.address_line1) === norm(address.addressLine1) &&
      norm(a.address_line2) === norm(address.addressLine2) &&
      norm(a.city) === norm(address.city) &&
      norm(a.state) === norm(address.state) &&
      norm(a.postal_code) === norm(address.postalCode)
  );

  if (isDuplicate) {
    return { success: false, error: "This address is already saved." };
  }

  // If this is being set as default, unset other defaults first
  if (address.isDefault) {
    await supabase
      .from("customer_saved_addresses")
      .update({ is_default: false })
      .eq("customer_id", session.customer_id)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("customer_saved_addresses")
    .insert({
      customer_id: session.customer_id,
      label: address.label,
      address_line1: address.addressLine1,
      address_line2: address.addressLine2,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      delivery_notes: address.deliveryNotes,
      is_default: address.isDefault,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: "Failed to save address" };
  }

  return { success: true, id: data?.id };
}

export async function deleteSavedAddress(
  sessionToken: string,
  addressId: string
): Promise<{ success: boolean; error?: string }> {
  if (!sessionToken) return { success: false, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { success: false, error: "No customer linked" };
  }

  const { error } = await supabase
    .from("customer_saved_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", session.customer_id);

  if (error) {
    return { success: false, error: "Failed to delete address" };
  }

  return { success: true };
}

export async function setDefaultAddress(
  sessionToken: string,
  addressId: string
): Promise<{ success: boolean; error?: string }> {
  if (!sessionToken) return { success: false, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { success: false, error: "No customer linked" };
  }

  // Promote the target first, scoped to this customer, and confirm it actually
  // matched a row. Supabase update() does not error when zero rows match, so a
  // stale/deleted/foreign id would otherwise "succeed" — and clearing the old
  // default first would have left the customer with no default at all.
  const { data: promoted, error: promoteError } = await supabase
    .from("customer_saved_addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("customer_id", session.customer_id)
    .select("id")
    .maybeSingle();

  if (promoteError) {
    return { success: false, error: "Failed to update default address" };
  }

  if (!promoted) {
    return { success: false, error: "Address not found" };
  }

  // Only now demote the previous default(s). Excluding the row we just promoted
  // keeps this safe if it was already the default.
  const { error: demoteError } = await supabase
    .from("customer_saved_addresses")
    .update({ is_default: false })
    .eq("customer_id", session.customer_id)
    .eq("is_default", true)
    .neq("id", promoted.id);

  if (demoteError) {
    return { success: false, error: "Failed to update default address" };
  }

  return { success: true };
}

export interface LoyaltyProgramStatus {
  programId: string;
  programName: string;
  programType: string;
  currentPoints: number;
  currentPunches: number;
  currentVisits: number;
  lifetimePoints: number;
  totalRewardsEarned: number;
  totalRewardsRedeemed: number;
  availableRewards: {
    id: string;
    description: string;
    rewardType: string;
    rewardValue: number;
    expiresAt: string | null;
  }[];
}

export async function getLoyaltyStatus(
  sessionToken: string
): Promise<{ data: LoyaltyProgramStatus[]; error?: string }> {
  if (!sessionToken) return { data: [], error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id, online_store_config!inner(merchant_id)")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { data: [], error: "No customer linked" };
  }

  const merchantId = (session as any).online_store_config.merchant_id;

  // Get enrollments with program info
  const { data: enrollments } = await supabase
    .from("loyalty_enrollments")
    .select(
      `
      id, current_points, current_punches, current_visits,
      lifetime_points, total_rewards_earned, total_rewards_redeemed,
      loyalty_programs!inner (id, name, program_type, is_active)
    `
    )
    .eq("customer_id", session.customer_id)
    .eq("merchant_id", merchantId)
    .eq("is_active", true);

  if (!enrollments || enrollments.length === 0) {
    return { data: [] };
  }

  const results: LoyaltyProgramStatus[] = [];

  for (const enrollment of enrollments) {
    const program = (enrollment as any).loyalty_programs;
    if (!program?.is_active) continue;

    // Get available (earned, not yet redeemed) rewards
    const { data: rewards } = await supabase
      .from("loyalty_rewards")
      .select(
        "id, reward_description, reward_type, reward_value, expires_at"
      )
      .eq("enrollment_id", enrollment.id)
      .eq("status", "earned")
      .order("earned_at", { ascending: false });

    results.push({
      programId: program.id,
      programName: program.name,
      programType: program.program_type,
      currentPoints: enrollment.current_points ?? 0,
      currentPunches: enrollment.current_punches ?? 0,
      currentVisits: enrollment.current_visits ?? 0,
      lifetimePoints: enrollment.lifetime_points ?? 0,
      totalRewardsEarned: enrollment.total_rewards_earned ?? 0,
      totalRewardsRedeemed: enrollment.total_rewards_redeemed ?? 0,
      availableRewards: (rewards ?? []).map((r: any) => ({
        id: r.id,
        description: r.reward_description,
        rewardType: r.reward_type,
        rewardValue: Number(r.reward_value) || 0,
        expiresAt: r.expires_at,
      })),
    });
  }

  return { data: results };
}
