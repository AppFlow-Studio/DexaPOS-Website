"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Global command-palette record search.
 *
 * Searches orders, customers, and menu items for the palette's "records" groups.
 * Tenant + location scoping is enforced exactly like every other dashboard
 * action: resolve merchant_id from the Clerk org, constrain every query to that
 * merchant, and (when a specific location is active) to that location. The
 * Supabase client is Clerk-authenticated so RLS applies as defense-in-depth.
 */

export interface GlobalSearchOrder {
  id: string;
  order_number: string;
  display_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number | null;
  created_at: string;
}

export interface GlobalSearchCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface GlobalSearchMenuItem {
  id: string;
  name: string;
  image: string | null;
}

export interface GlobalSearchResults {
  orders: GlobalSearchOrder[];
  customers: GlobalSearchCustomer[];
  menuItems: GlobalSearchMenuItem[];
}

const EMPTY: GlobalSearchResults = { orders: [], customers: [], menuItems: [] };

/** Per-group result cap. The palette shows a "See all results" affordance when
 *  a group is full, so we fetch one extra to know whether to surface it. */
const GROUP_LIMIT = 6;

/** Escape PostgREST `ilike`/`or` filter metacharacters so user input can't break
 *  out of the pattern (commas split `or()` terms; %/_ are wildcards). */
function sanitize(term: string): string {
  return term.replace(/[%,()_\\]/g, " ").trim();
}

export async function SearchRecords(
  clerkOrgId: string,
  locationId: string | null | undefined,
  rawQuery: string
): Promise<GlobalSearchResults> {
  const query = sanitize(rawQuery ?? "");
  if (!clerkOrgId || query.length < 2) {
    return EMPTY;
  }

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    // Not finding a merchant for this org is an expected path (e.g. an HQ org or
    // a context without an active merchant) — return empty quietly rather than
    // logging an error on every keystroke.
    return EMPTY;
  }

  const merchantId = merchant.id;
  const scopedLocation = locationId && locationId !== "all" ? locationId : null;
  const pattern = `%${query}%`;

  // ── Orders ────────────────────────────────────────────────────────────────
  // Match on order number, display number, customer name/phone.
  let ordersQuery = supabase
    .from("orders")
    .select(
      "id, order_number, display_number, customer_name, customer_phone, total_amount, created_at"
    )
    .eq("merchant_id", merchantId)
    .or(
      `order_number.ilike.${pattern},display_number.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern}`
    )
    .order("created_at", { ascending: false })
    .limit(GROUP_LIMIT + 1);

  if (scopedLocation) {
    ordersQuery = ordersQuery.eq("location_id", scopedLocation);
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  // Customers are merchant-scoped (no location column). Match name/phone/email.
  const customersQuery = supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("merchant_id", merchantId)
    .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
    .limit(GROUP_LIMIT + 1);

  // ── Menu items ────────────────────────────────────────────────────────────
  // Items are merchant-scoped; some are global (location_id null), others are
  // location-specific. When a location is active, show that location's items
  // plus global items; otherwise show all merchant items.
  let menuItemsQuery = supabase
    .from("menu_items")
    .select("id, name, image")
    .eq("merchant_id", merchantId)
    .ilike("name", pattern)
    .limit(GROUP_LIMIT + 1);

  if (scopedLocation) {
    menuItemsQuery = menuItemsQuery.or(
      `location_id.eq.${scopedLocation},location_id.is.null`
    );
  }

  const [ordersRes, customersRes, menuItemsRes] = await Promise.all([
    ordersQuery,
    customersQuery,
    menuItemsQuery,
  ]);

  if (ordersRes.error) {
    console.error("[SearchRecords] orders error:", ordersRes.error);
  }
  if (customersRes.error) {
    console.error("[SearchRecords] customers error:", customersRes.error);
  }
  if (menuItemsRes.error) {
    console.error("[SearchRecords] menu_items error:", menuItemsRes.error);
  }

  return {
    orders: (ordersRes.data ?? []).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      display_number: o.display_number,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      total: o.total_amount ?? null,
      created_at: o.created_at,
    })),
    customers: (customersRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
    })),
    menuItems: (menuItemsRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      image: m.image,
    })),
  };
}
