import { createClient } from 'npm:@supabase/supabase-js'

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
