"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

export async function CreateCustomerQuick(
  clerkOrgId: string,
  data: {
    name: string | null;
    email: string | null;
    phone: string | null;
  }
): Promise<{ data?: { id: string; name: string | null; email: string | null; phone: string | null }; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID required" };

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: mErr } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (mErr || !merchant) return { error: "Merchant not found" };

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
    })
    .select("id, name, email, phone")
    .single();

  if (error) {
    console.error("[CreateCustomerQuick] error:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Customer: ${data.name || data.email || data.phone}`,
    actionCategory: "customer",
    resourceType: "customer",
    resourceId: customer.id,
    resourceName: data.name || data.email || "New Customer",
  });

  return { data: customer };
}
