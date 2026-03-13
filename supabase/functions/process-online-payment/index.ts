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
const DEJAVOO_IPOS_API_KEY = Deno.env.get('DEJAVOO_IPOS_API_KEY')!
const DEJAVOO_IPOS_SECRET_KEY = Deno.env.get('DEJAVOO_IPOS_SECRET_KEY')!

// ============================================================================
// iPOS AUTHENTICATION
// ============================================================================

const IPOS_AUTH_URL = 'https://auth.ipospays.tech/v1/authenticate-token'

async function authenticateIPOS(
  apiKey: string,
  secretKey: string
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  try {
    const response = await fetch(IPOS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': apiKey,
        'secretKey': secretKey,
        'scope': 'PaymentTokenization',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[IPOS_AUTH] Authentication failed:', response.status, text)
      return { success: false, error: `iPOS authentication failed: ${response.status}` }
    }

    const data = await response.json()
    const token = data.token || data.access_token || data.jwt

    if (!token) {
      console.error('[IPOS_AUTH] No token in response:', JSON.stringify(data))
      return { success: false, error: 'No token returned from iPOS authentication' }
    }

    return { success: true, token }
  } catch (err) {
    console.error('[IPOS_AUTH] Network error:', err)
    return { success: false, error: `iPOS authentication network error: ${String(err)}` }
  }
}

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

  // ---- Authenticate with iPOS Pays ----
  const authResult = await authenticateIPOS(DEJAVOO_IPOS_API_KEY, DEJAVOO_IPOS_SECRET_KEY)

  if (!authResult.success) {
    console.error('[PROCESS_PAYMENT] iPOS auth failed:', authResult.error)
    return jsonResponse(
      { success: false, error: 'Payment service is temporarily unavailable.' },
      502
    )
  }  

  console.log('[PROCESS_PAYMENT] iPOS auth successful')
  console.log('[PROCESS_PAYMENT] authResult', authResult)

  return jsonResponse({
    success: true,
    security_key: authResult.token,
  })

  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
