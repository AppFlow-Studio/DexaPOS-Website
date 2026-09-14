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
  webhookSecretConfigured: boolean
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

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase
    .from('platform_billing_provider_configs')
    .select(
      'id, provider, label, tokenization_key, private_api_key_secret_id, webhook_secret_id, is_active, created_at, updated_at'
    )
    .eq('provider', 'nmi')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getPlatformNmiBillingConfigSummary] Error:', error)
    throw new Error('Failed to load Dexa Billing NMI configuration.')
  }

  const config = data

  return {
    id: config?.id ?? null,
    provider: 'nmi',
    label: config?.label ?? 'Dexa Billing',
    tokenizationKey: config?.tokenization_key ?? null,
    apiKeyConfigured: Boolean(config?.private_api_key_secret_id),
    webhookSecretConfigured: Boolean(config?.webhook_secret_id),
    isActive: config?.is_active ?? false,
    createdAt: config?.created_at ?? null,
    updatedAt: config?.updated_at ?? null,
  }
}

export interface PlatformValorSaasConfigSummary {
  provider: 'valor'
  epi: string | null
  appid: string | null
  appKeyConfigured: boolean
  isActive: boolean
  configured: boolean
  updatedAt: string | null
}

export async function getPlatformValorSaasBillingConfigSummary(): Promise<PlatformValorSaasConfigSummary> {
  await assertHQPermission('system.config.manage')

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase
    .from('platform_billing_provider_configs')
    .select('valor_epi, valor_appid, private_api_key_secret_id, is_active, updated_at')
    .eq('provider', 'valor')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getPlatformValorSaasBillingConfigSummary] Error:', error)
    throw new Error('Failed to load the central Dexa SaaS billing configuration.')
  }

  const epi = normalizeText(data?.valor_epi)
  return {
    provider: 'valor',
    epi,
    appid: normalizeText(data?.valor_appid),
    appKeyConfigured: Boolean(data?.private_api_key_secret_id),
    isActive: data?.is_active ?? false,
    configured: Boolean(epi && data?.private_api_key_secret_id),
    updatedAt: data?.updated_at ?? null,
  }
}

export async function savePlatformNmiBillingConfig(params: {
  label?: string
  tokenizationKey: string
  privateApiKey?: string
  webhookSecret?: string
  isActive?: boolean
}): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('system.config.manage')

  const tokenizationKey = normalizeText(params.tokenizationKey)
  const privateApiKey = normalizeText(params.privateApiKey)
  const webhookSecret = normalizeText(params.webhookSecret)
  const label = normalizeText(params.label) ?? 'Dexa Billing'

  if (!tokenizationKey) {
    return { success: false, error: 'Tokenization key is required.' }
  }

  const supabase = createServerSupabaseClient() as any
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

  if (webhookSecret) {
    const { error: webhookError } = await supabase.rpc(
      'set_platform_billing_provider_webhook_secret',
      {
        p_provider: 'nmi',
        p_webhook_secret: webhookSecret,
      }
    )

    if (webhookError) {
      console.error('[savePlatformNmiBillingConfig:webhook] Error:', webhookError)
      return { success: false, error: webhookError.message }
    }
  }

  revalidatePath('/manage/settings')
  revalidatePath('/manage/settings/integrations')
  revalidatePath('/manage/merchants')

  return { success: true }
}
