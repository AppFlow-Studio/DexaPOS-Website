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

// Convenience methods
const api = {
  get: <T = unknown>(path: string) => orderOutRequest<T>('GET', path),
  post: <T = unknown>(path: string, body: unknown) => orderOutRequest<T>('POST', path, body),
  put: <T = unknown>(path: string, body: unknown) => orderOutRequest<T>('PUT', path, body),
  delete: <T = unknown>(path: string) => orderOutRequest<T>('DELETE', path),
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

interface ActionRequest {
  action: string
  [key: string]: unknown
}

async function handleHealthCheck(): Promise<Response> {
  const result = await api.get('/ping')
  return successResponse({
    api_reachable: result.ok,
    api_status: result.status,
    api_key_configured: !!ORDEROUT_API_KEY,
  }, 'Health check completed')
}

async function handleRegisterWebhook(params: ActionRequest): Promise<Response> {
  const endpoint = params.endpoint as string
  const webhookSecret = params.webhook_secret as string || Deno.env.get('ORDEROUT_WEBHOOK_SECRET')

  if (!endpoint) {
    return errorResponse('Missing required parameter: endpoint', 400)
  }
  if (!webhookSecret) {
    return errorResponse('Missing webhook_secret parameter or ORDEROUT_WEBHOOK_SECRET env var', 400)
  }

  const result = await api.post('/webhooks/push_order', {
    endpoint,
    method: 'POST',
    authorization_header: {
      Authorization: `Bearer ${webhookSecret}`,
    },
  })

  if (!result.ok) {
    return errorResponse('Failed to register webhook with OrderOut', result.status, result.data)
  }

  return successResponse(result.data, 'Webhook registered successfully')
}

async function handleCreateAccount(params: ActionRequest): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const merchantId = params.merchant_id as string
  const businessName = params.business_name as string
  const email = params.email as string
  const billingAccountId = params.billing_account_id as string || '5546155819794432'

  if (!merchantId || !businessName || !email) {
    return errorResponse('Missing required parameters: merchant_id, business_name, email', 400)
  }

  const result = await api.post('/accounts/create', {
    billing_account_id: billingAccountId,
    business_name: businessName,
    account_manager_email: email,
  })

  if (!result.ok) {
    return errorResponse('Failed to create OrderOut account', result.status, result.data)
  }

  // Store account in our DB
  const accountData = result.data as Record<string, unknown>
  const { error: dbError } = await supabase.from('orderout_accounts').upsert({
    merchant_id: merchantId,
    oo_account_id: accountData?.id || accountData?.account_id,
    oo_billing_account_id: billingAccountId,
    account_manager_email: email,
    status: 'active',
    raw_response: result.data,
  }, { onConflict: 'merchant_id' })

  if (dbError) {
    logError('DB', 'Failed to store account in database', dbError)
    return errorResponse('Account created on OrderOut but failed to store locally', 500, dbError.message)
  }

  return successResponse(result.data, 'Account created and stored successfully')
}

async function handleCreateRestaurant(params: ActionRequest): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const locationId = params.location_id as string
  const accountId = params.oo_account_id as string
  const orderoutAccountId = params.orderout_account_id as string
  const restaurantPayload = params.restaurant as Record<string, unknown>

  if (!locationId || !accountId || !restaurantPayload) {
    return errorResponse('Missing required parameters: location_id, oo_account_id, restaurant', 400)
  }

  const result = await api.post(`/accounts/${accountId}/restaurants/create`, restaurantPayload)

  if (!result.ok) {
    return errorResponse('Failed to create OrderOut restaurant', result.status, result.data)
  }

  const restaurantData = result.data as Record<string, unknown>

  // Look up merchant_id from locations for denormalized column
  const { data: loc } = await supabase
    .from('locations').select('merchant_id').eq('id', locationId).single()

  const { error: dbError } = await supabase.from('orderout_restaurants').upsert({
    orderout_account_id: orderoutAccountId,
    location_id: locationId,
    oo_restaurant_id: restaurantData?.id || restaurantData?.restaurant_id,
    oo_account_id: accountId,
    merchant_id: loc?.merchant_id,
    pos_uuid: restaurantPayload.pos_uuid || locationId,
    status: 'active',
    raw_response: result.data,
  }, { onConflict: 'location_id' })

  if (dbError) {
    logError('DB', 'Failed to store restaurant in database', dbError)
    return errorResponse('Restaurant created on OrderOut but failed to store locally', 500, dbError.message)
  }

  return successResponse(result.data, 'Restaurant created and stored successfully')
}

async function handlePushMenu(params: ActionRequest): Promise<Response> {
  const restaurantId = params.oo_restaurant_id as string
  const menuPayload = params.menu as unknown

  if (!restaurantId || !menuPayload) {
    return errorResponse('Missing required parameters: oo_restaurant_id, menu', 400)
  }

  const result = await api.post(`/pos/restaurant/${restaurantId}/menu`, menuPayload)

  if (!result.ok) {
    return errorResponse('Failed to push menu to OrderOut', result.status, result.data)
  }

  return successResponse(result.data, 'Menu pushed successfully')
}

async function handleGenericRequest(params: ActionRequest): Promise<Response> {
  const method = (params.method as string || 'GET').toUpperCase()
  const path = params.path as string
  const body = params.body as unknown

  if (!path) {
    return errorResponse('Missing required parameter: path', 400)
  }

  let result: ApiResponse
  switch (method) {
    case 'GET':
      result = await api.get(path)
      break
    case 'POST':
      result = await api.post(path, body)
      break
    case 'PUT':
      result = await api.put(path, body)
      break
    case 'DELETE':
      result = await api.delete(path)
      break
    default:
      return errorResponse(`Unsupported method: ${method}`, 400)
  }

  if (!result.ok) {
    return errorResponse(`API request failed: ${method} ${path}`, result.status, result.data)
  }

  return successResponse(result.data, `${method} ${path} completed`)
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  let body: ActionRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { action } = body
  if (!action) {
    return errorResponse('Missing required field: action', 400)
  }

  logEvent('ACTION', `Handling action: ${action}`)

  try {
    switch (action) {
      case 'health_check':
        return await handleHealthCheck()
      case 'register_webhook':
        return await handleRegisterWebhook(body)
      case 'create_account':
        return await handleCreateAccount(body)
      case 'create_restaurant':
        return await handleCreateRestaurant(body)
      case 'push_menu':
        return await handlePushMenu(body)
      case 'api_request':
        return await handleGenericRequest(body)
      default:
        return errorResponse(`Unknown action: ${action}`, 400)
    }
  } catch (err) {
    logError('HANDLER', `Unhandled error in action: ${action}`, err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
