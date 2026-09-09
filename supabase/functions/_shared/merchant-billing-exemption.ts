export interface MerchantBillingExemptionRow {
  billing_exempt?: boolean | null
  billing_exempt_expires_at?: string | null
}

export function isMerchantBillingExemptionActive(
  merchant: MerchantBillingExemptionRow | null | undefined,
  now = new Date(),
): boolean {
  if (!merchant?.billing_exempt) return false
  if (!merchant.billing_exempt_expires_at) return true

  const expiresAt = new Date(merchant.billing_exempt_expires_at)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
}

export async function loadMerchantBillingExemption(
  supabase: any,
  merchantId: string,
): Promise<{ active: boolean; expiresAt: string | null }> {
  const { data, error } = await supabase
    .from('merchants')
    .select('billing_exempt, billing_exempt_expires_at')
    .eq('id', merchantId)
    .maybeSingle()

  if (error) {
    console.error('[merchant-billing-exemption] Lookup failed:', error)
    return { active: false, expiresAt: null }
  }

  return {
    active: isMerchantBillingExemptionActive(data),
    expiresAt: data?.billing_exempt_expires_at ?? null,
  }
}
