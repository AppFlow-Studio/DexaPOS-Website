// Lane D: notify-waitlist-guest hardening
//
// Before:
//   - CORS = '*'
//   - No JWT verification (verify_jwt now true in config.toml)
//   - Trusted caller-supplied phone, message, waitlist_id (Twilio/Telnyx cost vector)
//   - Used SUPABASE_SERVICE_ROLE_KEY to read waitlist (RLS bypass)
//   - No rate limit
//
// After:
//   - CORS allowlist: *.dexapos.com, localhost
//   - verify_jwt = true (Supabase platform validates JWT before invoke)
//   - Caller supplies only `waitlist_id`
//   - User-scoped client reads waitlist (waitlist_tenant_scope RLS gates access)
//   - Phone read from waitlist row, message rendered from server-side template
//   - Atomic rate-limit via claim_waitlist_sms_slot RPC (10 SMS/merchant/hour)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*dexapos\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
]

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin) return {}
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  }
}

const SMS_RATE_LIMIT_PER_HOUR = 10

function renderReadyMessage(partyName: string | null): string {
  const name = (partyName ?? '').trim() || 'Guest'
  return `Hi ${name}! Your table is ready. Please return to the host stand.`
}

function normalizeToE164(rawPhone: string | null | undefined): string | null {
  const digits = (rawPhone ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return null
}

interface NotifyRequest {
  waitlist_id?: string
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const cors = corsHeadersFor(origin)
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'method_not_allowed' }),
      { status: 405, headers: jsonHeaders }
    )
  }

  // verify_jwt = true means the platform already validated the JWT before
  // invoking us. We still need the Authorization header to construct a
  // user-scoped supabase client for RLS-gated reads.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'unauthenticated' }),
      { status: 401, headers: jsonHeaders }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('Missing supabase env vars')
    return new Response(
      JSON.stringify({ success: false, error: 'server_misconfigured' }),
      { status: 500, headers: jsonHeaders }
    )
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  })
  const adminClient = createClient(supabaseUrl, serviceKey)

  try {
    const body = (await req.json().catch(() => ({}))) as NotifyRequest
    const waitlistId = typeof body.waitlist_id === 'string' ? body.waitlist_id : null

    if (!waitlistId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bad_request',
          message: 'waitlist_id required'
        }),
        { status: 400, headers: jsonHeaders }
      )
    }

    // Read waitlist via user-scoped client. RLS policy `waitlist_tenant_scope`
    // returns no rows if the caller doesn't belong to the merchant/location.
    const { data: waitlist, error: waitlistErr } = await userClient
      .from('waitlist')
      .select('id, merchant_id, location_id, party_name, phone, status')
      .eq('id', waitlistId)
      .maybeSingle()

    if (waitlistErr) {
      console.error('waitlist read failed', waitlistErr)
      return new Response(
        JSON.stringify({ success: false, error: 'db_error' }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!waitlist) {
      // RLS rejected access OR row doesn't exist — same response either way
      // so we don't leak existence.
      return new Response(
        JSON.stringify({ success: false, error: 'not_found' }),
        { status: 404, headers: jsonHeaders }
      )
    }

    const e164Phone = normalizeToE164(waitlist.phone)

    if (!e164Phone) {
      return new Response(
        JSON.stringify({ success: true, sms: false, reason: 'no_valid_phone' }),
        { headers: jsonHeaders }
      )
    }

    // Atomic rate-limit claim. Service-role required — table is locked down
    // and the RPC pg_advisory_xact_lock-serializes concurrent claims.
    const { data: claim, error: claimErr } = await adminClient.rpc(
      'claim_waitlist_sms_slot',
      {
        p_merchant_id: waitlist.merchant_id,
        p_max_per_hour: SMS_RATE_LIMIT_PER_HOUR
      }
    )

    if (claimErr) {
      console.error('rate limit claim failed', claimErr)
      return new Response(
        JSON.stringify({ success: false, error: 'rate_limit_check_failed' }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!claim?.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'rate_limited',
          message: `SMS rate limit reached for this merchant (${claim?.count}/${claim?.limit} this hour). Try again later.`,
          retry_after_seconds: 600
        }),
        { status: 429, headers: jsonHeaders }
      )
    }

    // Server-side template — caller cannot inject SMS body.
    const message = renderReadyMessage(waitlist.party_name)

    const apiKey = Deno.env.get('TELNYX_API_KEY')
    const fromNumber = Deno.env.get('TELNYX_FROM_NUMBER') ?? '+18556810275'
    if (!apiKey) {
      console.error('Missing Telnyx credentials')
      return new Response(
        JSON.stringify({
          success: false,
          sms: false,
          error: 'sms_failed',
          message:
            'SMS provider is not configured. Please notify guest verbally and contact admin.'
        }),
        { status: 500, headers: jsonHeaders }
      )
    }

    const telnyxResp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        from: fromNumber,
        to: e164Phone,
        text: message
      })
    })

    let telnyxJson: Record<string, any> = {}
    try {
      telnyxJson = await telnyxResp.json()
    } catch {
      telnyxJson = {}
    }
    const data = telnyxJson?.data
    const firstError = telnyxJson?.errors?.[0]
    const providerStatus = data?.status as string | undefined
    const smsOk =
      telnyxResp.ok &&
      !!data?.id &&
      providerStatus !== 'sending_failed' &&
      providerStatus !== 'delivery_failed'

    await adminClient.rpc('record_waitlist_sms_result', {
      p_waitlist_id: waitlistId,
      p_success: smsOk,
      p_notification_type: 'sms'
    })

    if (smsOk) {
      return new Response(JSON.stringify({ success: true, sms: true }), {
        headers: jsonHeaders
      })
    }

    const providerError = firstError?.detail || firstError?.title || undefined
    return new Response(
      JSON.stringify({
        success: false,
        sms: false,
        error: 'sms_failed',
        message:
          providerError || 'Could not send SMS. Please notify guest verbally.',
        provider_error: providerError
      }),
      { status: 502, headers: jsonHeaders }
    )
  } catch (err) {
    console.error('notify-waitlist-guest error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        sms: false,
        error: 'unexpected_error',
        message:
          'Unexpected error while sending SMS. Please notify guest verbally.',
        details: String(err)
      }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
