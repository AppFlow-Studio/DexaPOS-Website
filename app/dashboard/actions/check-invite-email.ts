'use server'

import { findEmailConflict } from '@/app/manage/actions/email-duplicates'
import { emailConflictMessage, isValidEmail, normalizeEmail } from '@/lib/utils/email'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { EmailConflictTable } from '@/lib/utils/email'

export interface CheckInviteEmailResult {
  ok: boolean
  message?: string
  table?: EmailConflictTable
}

/**
 * Live, read-only check used by invite/create UI to warn the user about a
 * duplicate email *before* submit. The submit-path server actions still call
 * findEmailConflict themselves — this is a UX hint, not the source of truth.
 *
 * - Pass clerkOrgId for merchant-scoped invites (staff, location members).
 * - Omit clerkOrgId (or pass null) for HQ admin creation — checks globally.
 */
export async function checkInviteEmail(
  email: string,
  clerkOrgId?: string | null
): Promise<CheckInviteEmailResult> {
  const normalized = normalizeEmail(email)
  if (!isValidEmail(normalized)) {
    return { ok: false, message: 'Invalid email address' }
  }

  let merchantId: string | null = null
  if (clerkOrgId) {
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('merchants')
      .select('id')
      .eq('clerk_org_id', clerkOrgId)
      .maybeSingle()
    merchantId = data?.id ?? null
  }

  const conflict = await findEmailConflict(
    normalized,
    merchantId ? { scope: { merchantId } } : { scope: 'global' }
  )

  if (conflict) {
    return {
      ok: false,
      message: emailConflictMessage(conflict),
      table: conflict.table,
    }
  }

  return { ok: true }
}
