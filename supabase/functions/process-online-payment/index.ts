import { createClient } from 'npm:@supabase/supabase-js'

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

interface PaymentDeviceRow {
  id: string
  tpn: string
  use_for_online_ordering: boolean
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
      .select('id, location_id, ipospays_tpn, is_active')
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

    const { data: activePaymentDevices, error: paymentDeviceError } = await supabase
      .from('location_payment_devices')
      .select('id, tpn, use_for_online_ordering')
      .eq('location_id', storeConfig.location_id)
      .eq('is_active', true)
      .order('use_for_online_ordering', { ascending: false })
      .order('updated_at', { ascending: false })

    if (paymentDeviceError) {
      console.error('[PROCESS_PAYMENT] Failed to resolve selected payment device:', paymentDeviceError)
    }

    const branchPaymentDevices = (activePaymentDevices as PaymentDeviceRow[] | null) ?? []
    const paymentDevice =
      branchPaymentDevices.find((device) => device.use_for_online_ordering) ??
      (branchPaymentDevices.length === 1 ? branchPaymentDevices[0] : null)

    let securityKey = ''
    let paymentDeviceId: string | null = null
    let resolvedTpn: string | null = null

    if (!paymentDevice && branchPaymentDevices.length > 1) {
      console.error('[PROCESS_PAYMENT] Multiple active payment devices found with no selected online-ordering device', {
        locationId: storeConfig.location_id,
        deviceIds: branchPaymentDevices.map((device) => device.id),
      })
      return jsonResponse(
        { success: false, error: 'Online payment device selection is incomplete for this store.' },
        503,
      )
    }

    if (paymentDevice?.id) {
      const { data: secretData, error: secretError } = await supabase.rpc(
        'get_location_payment_device_secret',
        {
          p_location_id: storeConfig.location_id,
          p_device_id: paymentDevice.id,
        },
      )

      const resolvedSecret = secretData?.[0]?.decrypted_secret
      const resolvedDeviceId = secretData?.[0]?.device_id ?? paymentDevice.id
      const resolvedDeviceTpn = secretData?.[0]?.tpn ?? paymentDevice.tpn

      if (secretError || !resolvedSecret) {
        console.error('[PROCESS_PAYMENT] Failed to resolve payment device FTD key:', secretError)
        return jsonResponse(
          { success: false, error: 'Payment service is temporarily unavailable.' },
          502,
        )
      }

      securityKey = resolvedSecret
      paymentDeviceId = resolvedDeviceId
      resolvedTpn = resolvedDeviceTpn

      await supabase
        .from('payment_credential_access_log')
        .insert({
          device_id: paymentDevice.id,
          function_name: 'process-online-payment',
          store_config_id: storeConfig.id,
          actor_user_id: null,
          metadata: {
            location_id: storeConfig.location_id,
            source: 'storefront_checkout',
            origin: req.headers.get('origin'),
          },
        })
    } else if (branchPaymentDevices.length === 0 && DEJAVOO_FTD_ECOM_KEY) {
      securityKey = DEJAVOO_FTD_ECOM_KEY
      resolvedTpn = storeConfig.ipospays_tpn ?? null
    }

    if (!resolvedTpn) {
      return jsonResponse(
        { success: false, error: 'Online payment is not configured for this store.' },
        503,
      )
    }

    if (!securityKey) {
      console.error('[PROCESS_PAYMENT] No active payment device key and no legacy fallback key configured')
      return jsonResponse(
        { success: false, error: 'Payment service is temporarily unavailable.' },
        502,
      )
    }

    return jsonResponse({
      success: true,
      security_key: securityKey,
      payment_device_id: paymentDeviceId,
      tpn: resolvedTpn,
    })
  } catch (err) {
    console.error('[PROCESS_PAYMENT] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
