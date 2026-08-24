import { createClient } from 'npm:@supabase/supabase-js'
import { getClientToken as getValorClientToken } from '../_shared/valor.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
    }

    let body: { store_config_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
    }

    if (!body.store_config_id) {
      return jsonResponse(
        { success: false, error: 'store_config_id is required' },
        400,
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: storeConfig, error: configError } = await supabase
      .from('online_store_config')
      .select('id, merchant_id, location_id, is_active')
      .eq('id', body.store_config_id)
      .single()

    if (configError || !storeConfig) {
      return jsonResponse(
        { success: false, error: 'Store configuration not found.' },
        404,
      )
    }

    if (storeConfig.is_active === false) {
      return jsonResponse(
        { success: false, error: 'Store configuration not found.' },
        404,
      )
    }

    // [C3] Valor is the storefront rail (hard-replaces NMI). The NMI block below
    // is dormant and only reached under the PAYMENTS_FORCE_NMI kill switch.
    const forceNmi = Deno.env.get('PAYMENTS_FORCE_NMI') === 'true'

    if (!forceNmi) {
      // Resolve the merchant/location's active primary Valor online_order account.
      const { data: valorRows, error: valorResolveError } = await supabase.rpc(
        'get_storefront_valor_account',
        {
          p_location_id: storeConfig.location_id,
          p_merchant_id: storeConfig.merchant_id,
        },
      )

      if (valorResolveError) {
        console.error('[PROCESS_PAYMENT] Failed to resolve Valor account:', valorResolveError)
        return jsonResponse(
          { success: false, error: 'Payment service is temporarily unavailable.' },
          502,
        )
      }

      const valorAccount =
        ((valorRows as Array<{ account_id: string; has_credentials: boolean }> | null) ?? [])[0] ??
          null

      // Fail closed — no NMI fallback. A store that has not been boarded + cut over
      // to Valor cannot take card online yet; the form is hidden client-side.
      if (!valorAccount || !valorAccount.has_credentials) {
        return jsonResponse(
          {
            success: false,
            error: 'Online payment is not configured for this store.',
            code: 'payment_not_configured',
          },
          503,
        )
      }

      // Decrypt the per-EPI credentials (app key leaves Vault only here, server-side).
      const { data: credRows, error: credError } = await supabase.rpc(
        'get_valor_account_credentials',
        { p_account_id: valorAccount.account_id },
      )

      const cred =
        ((credRows as Array<{
          valor_appid: string
          valor_epi: string
          decrypted_appkey: string
        }> | null) ?? [])[0] ?? null

      if (credError || !cred?.decrypted_appkey) {
        console.error('[PROCESS_PAYMENT] Failed to decrypt Valor credentials:', credError)
        return jsonResponse(
          { success: false, error: 'Payment service is temporarily unavailable.' },
          502,
        )
      }

      // Mint the short-lived Passage.js client token. The app key never leaves here.
      let clientToken
      try {
        clientToken = await getValorClientToken({
          appId: cred.valor_appid,
          appKey: cred.decrypted_appkey,
          epi: cred.valor_epi,
        })
      } catch (err) {
        console.error(
          '[PROCESS_PAYMENT] Valor GetClientToken failed:',
          err instanceof Error ? err.message : String(err),
        )
        return jsonResponse(
          { success: false, error: 'Payment service is temporarily unavailable.' },
          502,
        )
      }

      // Best-effort credential-access audit (merchant-scoped; Valor has no device).
      await supabase.from('merchant_payment_credential_access_log').insert({
        merchant_id: storeConfig.merchant_id,
        function_name: 'process-online-payment',
        store_config_id: storeConfig.id,
        actor_user_id: null,
        metadata: {
          source: 'storefront_checkout',
          provider: 'valor',
          valor_account_id: valorAccount.account_id,
          origin: req.headers.get('origin'),
        },
      })

      return jsonResponse({
        success: true,
        provider: 'valor',
        client_token: clientToken.clientToken,
        epi: clientToken.epi,
        is_demo: clientToken.isDemo,
        environment: clientToken.isDemo ? 'sandbox' : 'production',
      })
    }

    const { data: paymentConfigRows, error: paymentConfigError } = await supabase.rpc(
      'get_storefront_payment_config',
      {
        p_location_id: storeConfig.location_id,
      },
    )

    if (paymentConfigError) {
      console.error('[PROCESS_PAYMENT] Failed to resolve storefront payment config:', paymentConfigError)
      return jsonResponse(
        { success: false, error: 'Payment service is temporarily unavailable.' },
        502,
      )
    }

    const paymentConfig = ((paymentConfigRows as Array<{
      device_id: string
      provider: string
      environment: string
      provider_public_key: string | null
      supports_apple_pay: boolean
      supports_google_pay: boolean
      supports_customer_vault: boolean
    }> | null) ?? []).find((row) => row.provider === 'nmi')

    if (!paymentConfig?.device_id || !paymentConfig.provider_public_key) {
      return jsonResponse(
        { success: false, error: 'Online payment is not configured for this store.' },
        503,
      )
    }

    await supabase
      .from('payment_credential_access_log')
      .insert({
        device_id: paymentConfig.device_id,
        function_name: 'process-online-payment',
        store_config_id: storeConfig.id,
        actor_user_id: null,
        metadata: {
          source: 'storefront_checkout',
          origin: req.headers.get('origin'),
        },
      })

    return jsonResponse({
      success: true,
      provider: 'nmi',
      tokenization_key: paymentConfig.provider_public_key,
      payment_device_id: paymentConfig.device_id,
      environment: paymentConfig.environment,
    })
  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
