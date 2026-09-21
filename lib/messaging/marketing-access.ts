import { getEffectiveMerchantContext } from "@/lib/admin/merchant-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Authorize the active merchant BEFORE constructing a service-role client. */
export async function authorizeMarketingMerchant(requestedMerchantId?: string): Promise<string> {
  const { merchantId } = await getEffectiveMerchantContext(null);
  if (requestedMerchantId && requestedMerchantId !== merchantId) throw new Error("Merchant access denied");
  const { data, error } = await createServerSupabaseClient().rpc("is_merchant_admin", { p_merchant_id: merchantId });
  if (error || data !== true) throw new Error("Merchant access denied");
  return merchantId;
}
