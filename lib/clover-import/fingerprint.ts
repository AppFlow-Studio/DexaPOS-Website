import type { SupabaseClient } from "@supabase/supabase-js";

// Computes the same fingerprint the import_clover_menu RPC computes inside the
// transaction, so the dry-run carries a snapshot the RPC can re-check.
//
// Implementation detail: the SQL inside the RPC uses
// `string_agg(id::text || ':' || updated_at::text, '|' ORDER BY id)` over the
// union of menu_items, categories, modifier_groups for the merchant. We mirror
// that here via a single SQL RPC call so server-side and TS stay aligned.
//
// The fingerprint is a stable md5; we do not want to recompute it in pure JS
// (timezone formatting drift between PG and JS would create false staleness).

export async function computeMerchantMenuFingerprint(
  supabase: SupabaseClient,
  merchantId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("compute_merchant_menu_fingerprint", {
    p_merchant_id: merchantId,
  });
  if (error) throw new Error(`fingerprint rpc failed: ${error.message}`);
  if (!data) throw new Error("fingerprint rpc returned no data");
  return String(data);
}
