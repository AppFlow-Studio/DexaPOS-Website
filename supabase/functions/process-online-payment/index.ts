// ============================================================================
// process-online-payment Edge Function
// ============================================================================
// Returns an iPOS auth token (security_key) for the FTD script.
// Keeps iPOS API credentials server-side — the client only receives the token
// needed to load the Freedom to Design card tokenization script.
//
// Does NOT require authentication — any visitor with a valid store_config_id
// can load the payment form. Actual payment is secured in create-online-order.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// ENV
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEJAVOO_SECURITY_KEY_TOKEN = Deno.env.get('DEJAVOO_SECURITY_KEY_TOKEN')!

// ============================================================================
// CORS TO DO MIGHT CHANGE LATER
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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
      400
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Load store config & verify payment is configured ----
  const { data: storeConfig, error: configError } = await supabase
    .from('online_store_config')
    .select('id, ipospays_tpn')
    .eq('id', body.store_config_id)
    .single()

  console.log('[PROCESS_PAYMENT] storeConfig', storeConfig)
  console.log('[PROCESS_PAYMENT] configError', configError)

  if (configError || !storeConfig) {
    return jsonResponse(
      { success: false, error: 'Store configuration not found.' },
      404
    )
  }

  if (!storeConfig.ipospays_tpn) {
    return jsonResponse(
      { success: false, error: 'Online payment is not configured for this store.' },
      503
    )
  }

  if (!DEJAVOO_SECURITY_KEY_TOKEN) {
    return jsonResponse(
      { success: false, error: 'Payment service is not configured.' },
      503
    )
  }

  return jsonResponse({
    success: true,
    security_key: DEJAVOO_SECURITY_KEY_TOKEN,
  })

  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
