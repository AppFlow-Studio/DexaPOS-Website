'use server'

// ============================================================================
// Admin NMI Server Actions
// HQ-side flow to create a gateway merchant account in NMI for a Dexa merchant.
// Reference: POST {NMI_API_URL}/v4/merchants
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { revalidatePath } from 'next/cache'

const NMI_API_URL = process.env.NMI_API_URL || 'https://sandbox.nmi.com/api'
const NMI_PARTNER_API_KEY = process.env.NMI_PARTNER_API_KEY

// Where HQ admins finish onboarding the merchant in NMI's partner portal.
// Surfaced back to the UI so the "Open NMI Partner Portal" button stays in sync
// with whatever URL was used at create time, even if the env-default changes.
export const NMI_PARTNER_PORTAL_URL =
  process.env.NMI_PARTNER_PORTAL_URL ||
  'https://mtech.transactiongateway.com/partners/accounts?tid=0d06b140eb69b1d4ac8a02efe71ceab0'

export interface AdminCreateNmiMerchantInput {
  merchantId: string
  locationId: string
  // Company / address
  company: string
  externalIdentifier?: string
  country: string
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  url?: string
  timezone: string
  // Contact
  firstName: string
  lastName: string
  email: string
  phone: string
  fax?: string
  language: string
  username: string
  // Banking (used by NMI for billing the merchant)
  checkAccount: string
  checkAba: string
  accountHolderType: 'business' | 'personal'
  accountType: 'checking' | 'savings'
}

export interface AdminNmiMerchantSummary {
  nmiMerchantId: string
  status: string | null
  createdAt: string | null
  partnerPortalUrl: string
}

export interface AdminCreateNmiMerchantResult {
  success: boolean
  data?: AdminNmiMerchantSummary
  error?: string
}

function readNmiMetadata(
  metadata: Record<string, unknown> | null | undefined
): AdminNmiMerchantSummary | null {
  const nmi = (metadata && typeof metadata === 'object' ? (metadata as any).nmi : null) ?? null
  if (!nmi || typeof nmi !== 'object') return null
  const id = (nmi as any).merchantId
  if (!id) return null
  return {
    nmiMerchantId: String(id),
    status: ((nmi as any).status as string | undefined) ?? null,
    createdAt: ((nmi as any).createdAt as string | undefined) ?? null,
    partnerPortalUrl: ((nmi as any).partnerPortalUrl as string | undefined) || NMI_PARTNER_PORTAL_URL,
  }
}

export async function getAdminNmiMerchantStatus(merchantId: string): Promise<{
  success: boolean
  data?: AdminNmiMerchantSummary | null
  error?: string
}> {
  try {
    await assertHQPermission('hq.merchant.view')
    const supabase = createServerSupabaseClient()
    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('public_metadata')
      .eq('id', merchantId)
      .single()
    if (error || !merchant) {
      return { success: false, error: error?.message ?? 'Merchant not found' }
    }
    return {
      success: true,
      data: readNmiMetadata(merchant.public_metadata as Record<string, unknown> | null),
    }
  } catch (err) {
    console.error('[getAdminNmiMerchantStatus] Exception:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function adminCreateNmiMerchant(
  input: AdminCreateNmiMerchantInput
): Promise<AdminCreateNmiMerchantResult> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    if (!NMI_PARTNER_API_KEY) {
      return {
        success: false,
        error: 'NMI_PARTNER_API_KEY is not configured on the server.',
      }
    }

    const supabase = createServerSupabaseClient()

    const { data: merchant, error: merchantErr } = await supabase
      .from('merchants')
      .select('id, name, public_metadata')
      .eq('id', input.merchantId)
      .single()
    if (merchantErr || !merchant) {
      return { success: false, error: merchantErr?.message ?? 'Merchant not found' }
    }

    const existing = readNmiMetadata(merchant.public_metadata as Record<string, unknown> | null)
    if (existing) {
      return {
        success: false,
        error: `This merchant already has an NMI account (id ${existing.nmiMerchantId}). Manage it in the partner portal instead.`,
      }
    }

    const payload = {
      type: 'gateway',
      company: input.company,
      externalIdentifier: input.externalIdentifier || merchant.id,
      country: input.country,
      address1: input.address1,
      address2: input.address2 ?? '',
      city: input.city,
      state: input.state,
      zip: input.zip,
      url: input.url ?? '',
      timezone: input.timezone,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      fax: input.fax ?? '',
      language: input.language,
      username: input.username,
      accountInfo: {
        checkAccount: input.checkAccount,
        checkAba: input.checkAba,
        accountHolderType: input.accountHolderType,
        accountType: input.accountType,
      },
    }

    const response = await fetch(`${NMI_API_URL}/v4/merchants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: NMI_PARTNER_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // leave body as null; we'll surface the raw text in the error path
    }

    if (!response.ok) {
      const message =
        (body && (body.message || body.error)) ||
        `NMI returned ${response.status}: ${text.slice(0, 300)}`
      console.error('[adminCreateNmiMerchant] NMI error', response.status, text)
      return { success: false, error: message }
    }

    const nmiMerchantId = body?.id ? String(body.id) : ''
    if (!nmiMerchantId) {
      return { success: false, error: 'NMI did not return a merchant id.' }
    }

    const summary: AdminNmiMerchantSummary = {
      nmiMerchantId,
      status: (body?.status as string | undefined) ?? 'pending',
      createdAt: (body?.created as string | undefined) ?? new Date().toISOString(),
      partnerPortalUrl: NMI_PARTNER_PORTAL_URL,
    }

    const newMetadata = {
      ...((merchant.public_metadata as Record<string, unknown> | null) ?? {}),
      nmi: {
        merchantId: summary.nmiMerchantId,
        status: summary.status,
        createdAt: summary.createdAt,
        createdBy: userId ?? null,
        partnerPortalUrl: summary.partnerPortalUrl,
        externalIdentifier: payload.externalIdentifier,
      },
    }

    const { error: updateErr } = await supabase
      .from('merchants')
      .update({ public_metadata: newMetadata })
      .eq('id', input.merchantId)
    if (updateErr) {
      return {
        success: false,
        error: `NMI merchant ${summary.nmiMerchantId} created, but persisting it failed: ${updateErr.message}`,
      }
    }

    await LogAuditEvent({
      merchantId: input.merchantId,
      action: 'HQ Admin Created NMI Merchant Account',
      actionCategory: 'settings',
      resourceType: 'merchant_payment',
      resourceId: summary.nmiMerchantId,
      resourceName: input.company,
      locationId: input.locationId,
      metadata: {
        nmi_merchant_id: summary.nmiMerchantId,
        nmi_status: summary.status,
        created_by_admin: userId,
      },
    })

    revalidatePath(`/manage/merchants/${input.merchantId}`)
    return { success: true, data: summary }
  } catch (err) {
    console.error('[adminCreateNmiMerchant] Exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
