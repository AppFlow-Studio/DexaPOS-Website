"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GetCustomerReservations(customerId: string, locationId?: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("reservations")
    .select(
      `
      *,
      location:locations(name)
      `
    )
    .eq("customer_id", customerId)
    .order("reservation_date", { ascending: false });

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GetCustomerReservations]", error);
    return [];
  }
  return data || [];
}

export async function GetCustomerWaitlist(customerId: string, locationId?: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("waitlist")
    .select(
      `
      *,
      location:locations(name)
      `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GetCustomerWaitlist]", error);
    return [];
  }
  return data || [];
}

export async function GetCustomerDineSessions(customerId: string, locationId?: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("table_sessions")
    .select(
      `
      *,
      location:locations(name),
      server:staff_profiles!table_sessions_server_staff_id_fkey(first_name, last_name, display_name),
      order:orders!table_sessions_order_id_fkey(display_number)
      `
    )
    .eq("customer_id", customerId)
    .order("seated_at", { ascending: false });

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GetCustomerDineSessions]", error);
    return [];
  }
  return data || [];
}

/**
 * Create a reservation with automatic customer linking by phone number
 * If customer_id not provided, attempts to link by phone number
 */
export async function CreateReservationWithLink({
  merchant_id,
  location_id,
  customer_id,
  phone,
  name,
  party_size,
  reservation_date,
  reservation_time,
  notes,
  auto_create_customer = false,
}: {
  merchant_id: string;
  location_id: string;
  customer_id?: string | null;
  phone: string;
  name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  notes?: string;
  auto_create_customer?: boolean;
}) {
  const supabase = createServiceRoleClient();

  let linkedCustomerId = customer_id || null;

  // If no customer_id provided, try to find by phone
  if (!linkedCustomerId && phone) {
    const { data: customers, error: searchError } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant_id)
      .eq("phone", phone)
      .limit(1)
      .single();

    if (customers && !searchError) {
      linkedCustomerId = customers.id;
    }

    // If still no match and auto_create is enabled, create customer
    if (!linkedCustomerId && auto_create_customer) {
      const { data: newCustomer, error: createError } = await supabase
        .from("customers")
        .insert({
          merchant_id,
          phone,
          name,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (newCustomer && !createError) {
        linkedCustomerId = newCustomer.id;
      }
    }
  }

  // Create the reservation with linked customer
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      merchant_id,
      location_id,
      customer_id: linkedCustomerId,
      phone,
      name,
      party_size,
      reservation_date,
      reservation_time,
      notes,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[CreateReservationWithLink]", error);
    throw error;
  }

  return data;
}

/**
 * Create a waitlist entry with automatic customer linking by phone number
 * If customer_id not provided, attempts to link by phone number
 */
export async function CreateWaitlistWithLink({
  merchant_id,
  location_id,
  customer_id,
  phone,
  name,
  party_size,
  notes,
  auto_create_customer = false,
}: {
  merchant_id: string;
  location_id: string;
  customer_id?: string | null;
  phone: string;
  name: string;
  party_size: number;
  notes?: string;
  auto_create_customer?: boolean;
}) {
  const supabase = createServiceRoleClient();

  let linkedCustomerId = customer_id || null;

  // If no customer_id provided, try to find by phone
  if (!linkedCustomerId && phone) {
    const { data: customers, error: searchError } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant_id)
      .eq("phone", phone)
      .limit(1)
      .single();

    if (customers && !searchError) {
      linkedCustomerId = customers.id;
    }

    // If still no match and auto_create is enabled, create customer
    if (!linkedCustomerId && auto_create_customer) {
      const { data: newCustomer, error: createError } = await supabase
        .from("customers")
        .insert({
          merchant_id,
          phone,
          name,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (newCustomer && !createError) {
        linkedCustomerId = newCustomer.id;
      }
    }
  }

  // Create the waitlist entry with linked customer
  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      merchant_id,
      location_id,
      customer_id: linkedCustomerId,
      phone,
      name,
      party_size,
      notes,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[CreateWaitlistWithLink]", error);
    throw error;
  }

  return data;
}
