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
      .select('id, merchant_id, is_active')
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

    const { data: credentials, error: credentialError } = await supabase.rpc(
      'list_merchant_payment_credentials',
      {
        p_merchant_id: storeConfig.merchant_id,
      },
    )

    if (credentialError) {
      console.error('[PROCESS_PAYMENT] Failed to resolve merchant payment credentials:', credentialError)
      return jsonResponse(
        { success: false, error: 'Payment service is temporarily unavailable.' },
        502,
      )
    }

    const credential = ((credentials as Array<{
      id: string
      provider: string
      tokenization_key: string
      is_active: boolean
      api_key_configured: boolean
    }> | null) ?? []).find((row) => row.provider === 'nmi' && row.is_active)

    if (!credential?.tokenization_key || !credential.api_key_configured) {
      return jsonResponse(
        { success: false, error: 'Online payment is not configured for this store.' },
        503,
      )
    }

    await supabase
      .from('merchant_payment_credential_access_log')
      .insert({
        merchant_payment_credential_id: credential.id,
        merchant_id: storeConfig.merchant_id,
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
      tokenization_key: credential.tokenization_key,
      merchant_payment_credential_id: credential.id,
    })
  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
