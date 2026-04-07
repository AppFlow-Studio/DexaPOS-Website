import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// process-online-payment Edge Function
// ============================================================================
// Returns the configured FTD Ecom/TOP merchant key (security_key) for the
// Dejavoo Freedom to Design checkout form.
//
// Does NOT require authentication - any visitor with a valid store_config_id
// can load the payment form. Actual payment is secured in create-online-order.
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEJAVOO_FTD_ECOM_KEY = Deno.env.get('DEJAVOO_FTD_ECOM_KEY') ?? ''

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
      .select('id, ipospays_tpn')
      .eq('id', body.store_config_id)
      .single()

    if (configError || !storeConfig) {
      return jsonResponse(
        { success: false, error: 'Store configuration not found.' },
        404,
      )
    }

    if (!storeConfig.ipospays_tpn) {
      return jsonResponse(
        { success: false, error: 'Online payment is not configured for this store.' },
        503,
      )
    }

    if (!DEJAVOO_FTD_ECOM_KEY) {
      console.error('[PROCESS_PAYMENT] Missing DEJAVOO_FTD_ECOM_KEY secret')
      return jsonResponse(
        { success: false, error: 'Payment service is temporarily unavailable.' },
        502,
      )
    }

    return jsonResponse({
      success: true,
      security_key: DEJAVOO_FTD_ECOM_KEY,
    })
  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
