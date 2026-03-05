import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ORDEROUT_API_KEY = Deno.env.get('ORDEROUT_API_KEY')
const ORDEROUT_BASE_URL = 'https://api.orderout.co/api'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const DEFAULT_BILLING_ACCOUNT_ID = '5546155819794432'

// Dexa internal account manager constants
const DEXA_ACCOUNT_MANAGER_EMAIL = 'support@dexaposai.com'
const DEXA_ACCOUNT_MANAGER_FIRSTNAME = 'Temur'
const DEXA_ACCOUNT_MANAGER_LASTNAME = 'Sayfutdinov'
const DEXA_ACCOUNT_MANAGER_PHONE = '3476591866'

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function successResponse(data: unknown, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, data, message }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function errorResponse(error: string, status: number = 500, details?: unknown): Response {
  console.error(`[ERROR] ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, details }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

function logEvent(eventType: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${eventType}] ${message}`, data ? JSON.stringify(data) : '')
}

function logError(eventType: string, message: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] [${eventType}] ERROR: ${message}`, error)
}

// ============================================================================
// ORDEROUT API CLIENT
// ============================================================================

interface ApiResponse<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function orderOutRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  if (!ORDEROUT_API_KEY) {
    return { ok: false, status: 0, error: 'ORDEROUT_API_KEY not configured' }
  }

  const url = `${ORDEROUT_BASE_URL}${path}`
  const headers: Record<string, string> = {
    'api-key': ORDEROUT_API_KEY,
    'Content-Type': 'application/json',
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const options: RequestInit = { method, headers }
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(url, options)
      const responseText = await response.text()

      let data: T | undefined
      try {
        data = JSON.parse(responseText) as T
      } catch {
        data = responseText as unknown as T
      }

      if (response.ok) {
        return { ok: true, status: response.status, data }
      }

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { ok: false, status: response.status, error: `API error ${response.status}`, data }
      }

      // Retry on server errors (5xx) and rate limits (429)
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        logEvent('API', `Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
        continue
      }

      return { ok: false, status: response.status, error: `API error after ${MAX_RETRIES} retries`, data }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        logEvent('API', `Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
        continue
      }
      return { ok: false, status: 0, error: `Network error: ${(err as Error).message}` }
    }
  }

  return { ok: false, status: 0, error: 'Exhausted retries' }
}

const api = {
  post: <T = unknown>(path: string, body: unknown) => orderOutRequest<T>('POST', path, body),
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

interface OnboardRequest {
  merchant_id: string
  location_id: string
  account_name: string
  restaurant_name: string
  street_address: string
  city: string
  state: string
  zipcode: string
  country: string
  restaurant_manager_email: string
  restaurant_manager_firstname: string
  restaurant_manager_lastname: string
  restaurant_manager_phone: string
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  let body: OnboardRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  // Validate required fields
  const required: (keyof OnboardRequest)[] = [
    'merchant_id', 'location_id', 'account_name', 'restaurant_name',
    'street_address', 'city', 'state', 'zipcode', 'country',
    'restaurant_manager_email', 'restaurant_manager_firstname',
    'restaurant_manager_lastname', 'restaurant_manager_phone',
  ]
  for (const field of required) {
    if (!body[field]) {
      return errorResponse(`Missing required field: ${field}`, 400)
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  logEvent('ONBOARD', `Starting onboarding for merchant=${body.merchant_id} location=${body.location_id}`)

  // ── Guard: Check if location already onboarded ──
  const { data: existingRestaurant } = await supabase
    .from('orderout_restaurants')
    .select('id, oo_restaurant_id')
    .eq('location_id', body.location_id)
    .single()

  if (existingRestaurant) {
    return errorResponse('This location is already connected to OrderOut', 409)
  }

  // ── Check for existing account ──
  let orderoutAccountRowId: string | null = null

  const { data: existingAccount } = await supabase
    .from('orderout_accounts')
    .select('id, oo_account_id')
    .eq('merchant_id', body.merchant_id)
    .single()

  if (existingAccount?.oo_account_id) {
    logEvent('ONBOARD', 'Existing account found, will reuse', {
      oo_account_id: existingAccount.oo_account_id,
    })
    orderoutAccountRowId = existingAccount.id
  }

  // ── Single onboarding API call ──
  logEvent('ONBOARD', 'Calling OrderOut onboarding API')

  const combinedAccountName = `${body.account_name} - ${body.restaurant_name}`

  const onboardResult = await api.post<Record<string, unknown>>('/onboarding/', {
    oo_billing_account_id: DEFAULT_BILLING_ACCOUNT_ID,
    account_name: combinedAccountName,
    restaurant_address_street: body.street_address,
    restaurant_address_city: body.city,
    restaurant_address_state: body.state,
    restaurant_address_zipcode: body.zipcode,
    restaurant_address_country: body.country,
    account_manager_email: DEXA_ACCOUNT_MANAGER_EMAIL,
    account_manager_firstname: DEXA_ACCOUNT_MANAGER_FIRSTNAME,
    account_manager_lastname: DEXA_ACCOUNT_MANAGER_LASTNAME,
    account_manager_phone: DEXA_ACCOUNT_MANAGER_PHONE,
    restaurant_manager_email: body.restaurant_manager_email,
    restaurant_manager_firstname: body.restaurant_manager_firstname,
    restaurant_manager_lastname: body.restaurant_manager_lastname,
    restaurant_manager_phone: body.restaurant_manager_phone,
    pos_uuid: body.location_id,
  })
  logEvent('[ONBOARD]', 'Onboarding result', onboardResult)

  if (!onboardResult.ok) {
    const status = onboardResult.status
    if (status === 401) {
      return errorResponse('Authentication with OrderOut failed. Contact support.', 401, onboardResult.data)
    }
    if (status === 422) {
      return errorResponse('OrderOut validation error', 422, onboardResult.data)
    }
    return errorResponse('OrderOut service is temporarily unavailable. Try again.', status || 502, onboardResult.data)
  }

  const responseData = onboardResult.data as Record<string, unknown>
  const ooAccountId = String(responseData?.account_id || responseData?.account || responseData?.id || '')
  const ooRestaurantId = String(responseData?.restaurant_id || responseData?.restaurant || '')
  const dashboardUrl = String(responseData?.url || 'https://dashboard.orderout.co')

  if (!ooAccountId) {
    return errorResponse('OrderOut returned a response but no account_id was found', 502, responseData)
  }

  // ── Store account in DB (upsert — create if first location, reuse if exists) ──
  if (!orderoutAccountRowId) {
    const { data: newAccount, error: dbError } = await supabase
      .from('orderout_accounts')
      .upsert({
        merchant_id: body.merchant_id,
        oo_account_id: ooAccountId,
        oo_billing_account_id: DEFAULT_BILLING_ACCOUNT_ID,
        account_manager_email: DEXA_ACCOUNT_MANAGER_EMAIL,
        status: 'active',
        raw_response: onboardResult.data,
      }, { onConflict: 'merchant_id' })
      .select('id')
      .single()

    if (dbError) {
      logError('DB', 'Failed to store account in database', dbError)
      return errorResponse('Onboarding succeeded but local storage failed. Contact support.', 500, dbError.message)
    }

    orderoutAccountRowId = newAccount.id
    logEvent('ONBOARD', 'Account stored successfully', { oo_account_id: ooAccountId })
  }

  // ── Store restaurant in DB ──
  const { error: restDbError } = await supabase
    .from('orderout_restaurants')
    .insert({
      orderout_account_id: orderoutAccountRowId,
      location_id: body.location_id,
      oo_restaurant_id: ooRestaurantId || null,
      oo_account_id: ooAccountId,
      merchant_id: body.merchant_id,
      pos_uuid: body.location_id,
      status: 'active',
      raw_response: onboardResult.data,
    })

  if (restDbError) {
    logError('DB', 'Failed to store restaurant in database', restDbError)
    return errorResponse(
      'Connection succeeded but local storage failed. Contact support.',
      500,
      restDbError.message
    )
  }

  logEvent('ONBOARD', 'Onboarding complete', {
    oo_account_id: ooAccountId,
    oo_restaurant_id: ooRestaurantId,
  })

  return successResponse({
    oo_account_id: ooAccountId,
    oo_restaurant_id: ooRestaurantId,
    dashboard_url: dashboardUrl,
  }, 'OrderOut onboarding completed successfully')
})
