'use server'

// ============================================================================
// HQ Admin: Merchant Audit Log
// ============================================================================
// Reads one audit entry for the merchant detail page's audit tab, which links
// each row to its own page. The list itself still comes from `GetAuditLogs`.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import type { AuditLogWithLocation } from '@/types/audit-log'

export type AdminMerchantAuditLog = AuditLogWithLocation & {
  actor_email: string | null
  status: string | null
  error_message: string | null
  is_impersonation: boolean
}

export async function getAdminMerchantAuditLog(
  merchantId: string,
  logId: string
): Promise<{ data: AdminMerchantAuditLog | null; error?: string }> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Scoped by merchant as well as id, so a log id pasted under the wrong
  // merchant reads as "not found" instead of showing another merchant's row.
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, location:locations(id, name)')
    .eq('id', logId)
    .eq('merchant_id', merchantId)
    .maybeSingle()

  if (error) {
    console.error('[getAdminMerchantAuditLog] Error fetching audit log:', error)
    return { data: null, error: error.message }
  }

  return { data: (data as unknown as AdminMerchantAuditLog) ?? null }
}
