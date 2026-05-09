"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface LocationStrategy {
  id: string;
  name: string;
  pricing_strategy: "manual" | "dual";
}

export async function GetMerchantPricingStrategies(
  clerkOrgId: string,
): Promise<{ data?: LocationStrategy[]; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (merchantError || !merchant) return { error: "Merchant not found" };

  const { data, error } = await supabase
    .from("locations")
    .select("id, name, pricing_strategy")
    .eq("merchant_id", merchant.id);

  if (error) return { error: error.message };
  return { data: (data ?? []) as LocationStrategy[] };
}
