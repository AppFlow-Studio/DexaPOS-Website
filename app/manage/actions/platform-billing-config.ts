'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface PlatformNmiBillingConfigSummary {
  id: string | null
  provider: 'nmi'
  label: string
  tokenizationKey: string | null
  apiKeyConfigured: boolean
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

function normalizeText(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getPlatformNmiBillingConfigSummary(): Promise<PlatformNmiBillingConfigSummary> {
  await assertHQPermission('system.config.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_platform_billing_provider_config', {
    p_provider: 'nmi',
  })

  if (error) {
    console.error('[getPlatformNmiBillingConfigSummary] Error:', error)
    throw new Error('Failed to load Dexa Billing NMI configuration.')
  }

  const config = Array.isArray(data) ? data[0] : data

  return {
    id: config?.id ?? null,
    provider: 'nmi',
    label: config?.label ?? 'Dexa Billing',
    tokenizationKey: config?.tokenization_key ?? null,
    apiKeyConfigured: Boolean(config?.api_key_configured),
    isActive: config?.is_active ?? false,
    createdAt: config?.created_at ?? null,
    updatedAt: config?.updated_at ?? null,
  }
}

export async function savePlatformNmiBillingConfig(params: {
  label?: string
  tokenizationKey: string
  privateApiKey?: string
  isActive?: boolean
}): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('system.config.manage')

  const tokenizationKey = normalizeText(params.tokenizationKey)
  const privateApiKey = normalizeText(params.privateApiKey)
  const label = normalizeText(params.label) ?? 'Dexa Billing'

  if (!tokenizationKey) {
    return { success: false, error: 'Tokenization key is required.' }
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.rpc('upsert_platform_billing_provider_config', {
    p_provider: 'nmi',
    p_label: label,
    p_tokenization_key: tokenizationKey,
    p_private_api_key: privateApiKey,
    p_is_active: params.isActive ?? true,
  })

  if (error) {
    console.error('[savePlatformNmiBillingConfig] Error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/settings')
  revalidatePath('/manage/settings/integrations')
  revalidatePath('/manage/merchants')

  return { success: true }
}
