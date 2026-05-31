"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import type { OrderResponse } from "@/types/order-management";
import { normalizePhone } from "@/lib/phone";

export interface CustomerSearchHit {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Search customers for the order's merchant (ensures user has access to the order).
 * Direct query, no RPC. Scoped to current merchant via order access check.
 */
export async function searchCustomersForOrder(
  orderId: string,
  query: string
): Promise<CustomerSearchHit[]> {
  const order = await GetOrderDetails(orderId);
  if (!order?.merchant_id) return [];

  const q = query.trim();
  if (!q) return [];

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("merchant_id", (order as OrderResponse & { merchant_id: string }).merchant_id)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);

  if (error) {
    console.error("[searchCustomersForOrder]", error);
    return [];
  }
  return (data as CustomerSearchHit[]) ?? [];
}

export interface AssignCustomerParams {
  orderId: string;
  customerId?: string | null;
  newCustomer?: { name: string; phone?: string; email?: string } | null;
  remove?: boolean;
}

export interface AssignCustomerResult {
  success: boolean;
  error?: string;
}

/**
 * Assign or change the customer on an order. Creates customer if newCustomer provided.
 * Updates order denormalized fields and logs customer_activities. No payment provider dependency.
 */
export async function assignCustomerToOrder(
  params: AssignCustomerParams
): Promise<AssignCustomerResult> {
  const order = await GetOrderDetails(params.orderId);
  if (!order) {
    return { success: false, error: "Order not found" };
  }

  const merchantId = (order as OrderResponse & { merchant_id: string }).merchant_id;
  if (!merchantId) {
    return { success: false, error: "Invalid order" };
  }

  const supabase = createServiceRoleClient();

  if (params.remove) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        customer_id: null,
        customer_name: null,
        customer_phone: null,
        customer_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.orderId);

    if (updateError) {
      console.error("[assignCustomerToOrder] remove:", updateError);
      return { success: false, error: updateError.message };
    }
    revalidatePath(`/dashboard/orders/${params.orderId}`);
    revalidatePath(`/manage/merchants/${merchantId}/orders/${params.orderId}`);
    return { success: true };
  }

  let customerId: string;
  let customerName: string;
  let customerPhone: string | null;
  let customerEmail: string | null;

  if (params.newCustomer) {
    const name = params.newCustomer.name?.trim();
    const normalizedPhone = params.newCustomer.phone
      ? normalizePhone(params.newCustomer.phone) ?? params.newCustomer.phone.trim()
      : null;
    if (!name) {
      return { success: false, error: "Customer name is required" };
    }
    const { data: customer, error: insertError } = await supabase
      .from("customers")
      .insert({
        merchant_id: merchantId,
        name: name,
        phone: normalizedPhone,
        email: params.newCustomer.email?.trim() || null,
      })
      .select("id, name, phone, email")
      .single();

    if (insertError || !customer) {
      console.error("[assignCustomerToOrder] create customer:", insertError);
      return { success: false, error: insertError?.message ?? "Failed to create customer" };
    }
    customerId = (customer as { id: string }).id;
    customerName = (customer as { name: string | null }).name ?? name;
    customerPhone = (customer as { phone: string | null }).phone;
    customerEmail = (customer as { email: string | null }).email;
  } else if (params.customerId) {
    const { data: customer, error: fetchError } = await supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("id", params.customerId)
      .eq("merchant_id", merchantId)
      .single();

    if (fetchError || !customer) {
      console.error("[assignCustomerToOrder] fetch customer:", fetchError);
      return { success: false, error: "Customer not found" };
    }
    customerId = (customer as { id: string }).id;
    customerName = (customer as { name: string | null }).name ?? "";
    customerPhone = (customer as { phone: string | null }).phone;
    customerEmail = (customer as { email: string | null }).email;
  } else {
    return { success: false, error: "Provide either an existing customer or new customer details" };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.orderId);

  if (updateError) {
    console.error("[assignCustomerToOrder] update order:", updateError);
    return { success: false, error: updateError.message };
  }

  const { error: activityError } = await supabase.from("customer_activities").insert({
    customer_id: customerId,
    merchant_id: merchantId,
    activity_type: "order_linked",
    related_order_id: params.orderId,
  });

  if (activityError) {
    console.warn("[assignCustomerToOrder] customer_activities insert:", activityError);
    // Non-fatal: order is already updated
  }

  revalidatePath(`/dashboard/orders/${params.orderId}`);
  revalidatePath(`/manage/merchants/${merchantId}/orders/${params.orderId}`);
  return { success: true };
}
