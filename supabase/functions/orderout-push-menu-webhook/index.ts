import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// OrderOut Push Menu Webhook
// Receives per-platform push results (UBEREATS, GRUBHUB, DOORDASH) after a
// menu is pushed to OrderOut. Updates platform_statuses on orderout_menu_links.
//
// TODO: Register this webhook with OrderOut when ready:
//   POST https://api.orderout.co/api/webhooks/push_menu
//   {
//     "delivery_services": ["UBEREATS", "GRUBHUB", "DOORDASH"],
//     "method": "POST",
//     "endpoint": "{SUPABASE_URL}/functions/v1/orderout-push-menu-webhook",
//     "authorization_header": { "Authorization": "Bearer {SERVICE_ROLE_KEY}" }
//   }
// ============================================================================

const WEBHOOK_SECRET = Deno.env.get('ORDEROUT_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
// AUTH VALIDATION
// ============================================================================

function validateAuth(req: Request): { valid: boolean; error?: string } {
  if (!WEBHOOK_SECRET) {
    return { valid: false, error: 'ORDEROUT_WEBHOOK_SECRET not configured' }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return { valid: false, error: 'Invalid Authorization format. Expected: Bearer <token>' }
  }

  // Constant-time comparison to prevent timing attacks
  const encoder = new TextEncoder()
  const a = encoder.encode(token)
  const b = encoder.encode(WEBHOOK_SECRET)

  if (a.byteLength !== b.byteLength) {
    return { valid: false, error: 'Invalid webhook token' }
  }

  let mismatch = 0
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i]
  }

  if (mismatch !== 0) {
    return { valid: false, error: 'Invalid webhook token' }
  }

  return { valid: true }
}

// ============================================================================
// TYPES
// ============================================================================

interface PlatformResult {
  platform: string  // e.g. "UBEREATS", "DOORDASH", "GRUBHUB"
  status: 'success' | 'failed' | 'pending'
  error?: string
}

interface PushMenuWebhookPayload {
  menu_id: number | string   // OrderOut menu ID
  restaurant_id?: string     // OrderOut restaurant ID
  results?: PlatformResult[]
  [key: string]: unknown
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // 1. Validate auth
  const auth = validateAuth(req)
  if (!auth.valid) {
    logError('AUTH', 'Authentication failed', auth.error)
    return errorResponse('Unauthorized', 401)
  }

  // 2. Parse body
  let body: PushMenuWebhookPayload
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  logEvent('PUSH_MENU_WEBHOOK', 'Received push_menu callback', {
    menu_id: body.menu_id,
    restaurant_id: body.restaurant_id,
    resultCount: body.results?.length ?? 0,
  })

  // 3. Validate required fields
  const ooMenuId = body.menu_id
  if (!ooMenuId) {
    logError('PUSH_MENU_WEBHOOK', 'Missing menu_id in payload', body)
    return errorResponse('Missing menu_id', 400)
  }

  const platformResults = body.results
  if (!Array.isArray(platformResults) || platformResults.length === 0) {
    logEvent('PUSH_MENU_WEBHOOK', 'No platform results in payload — nothing to update')
    return successResponse(null, 'No platform results to process')
  }

  // 4. Init Supabase service-role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 5. Find the menu link by oo_menu_id
  const { data: link, error: linkError } = await supabase
    .from('orderout_menu_links')
    .select('id, orderout_restaurant_id, menu_id, platform_statuses')
    .eq('oo_menu_id', String(ooMenuId))
    .maybeSingle()

  if (linkError) {
    logError('PUSH_MENU_WEBHOOK', 'Database error looking up menu link', linkError)
    return errorResponse('Database error', 500)
  }

  if (!link) {
    logEvent('PUSH_MENU_WEBHOOK', `No menu link found for oo_menu_id: ${ooMenuId}`)
    // Return 200 so OrderOut doesn't retry — we'll log it
    return successResponse(null, `No menu link found for oo_menu_id: ${ooMenuId}`)
  }

  // 6. Build updated platform_statuses
  const existingStatuses = (link.platform_statuses as Record<string, unknown>) || {}
  const now = new Date().toISOString()

  for (const result of platformResults) {
    existingStatuses[result.platform] = {
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
      updated_at: now,
    }
  }

  // 7. Update the menu link
  const { error: updateError } = await supabase
    .from('orderout_menu_links')
    .update({ platform_statuses: existingStatuses })
    .eq('id', link.id)

  if (updateError) {
    logError('PUSH_MENU_WEBHOOK', 'Failed to update platform_statuses', updateError)
    return errorResponse('Failed to update platform statuses', 500)
  }

  // 8. Optionally create a sync log entry for this webhook event
  const { error: syncLogError } = await supabase
    .from('orderout_menu_syncs')
    .insert({
      orderout_restaurant_id: link.orderout_restaurant_id,
      menu_id: link.menu_id,
      oo_menu_id: String(ooMenuId),
      sync_direction: 'push',
      sync_status: platformResults.every(r => r.status === 'success') ? 'success'
        : platformResults.some(r => r.status === 'success') ? 'partial'
        : 'failed',
      items_synced: 0,
      items_failed: 0,
      error_details: platformResults.some(r => r.error)
        ? JSON.stringify(platformResults.filter(r => r.error).map(r => ({ platform: r.platform, error: r.error })))
        : null,
      menu_payload_snapshot: { webhook_event: 'push_menu_result', platforms: platformResults },
      synced_at: now,
    })

  if (syncLogError) {
    logError('PUSH_MENU_WEBHOOK', 'Failed to create sync log entry (non-fatal)', syncLogError)
  }

  logEvent('PUSH_MENU_WEBHOOK', 'Platform statuses updated', {
    linkId: link.id,
    platforms: platformResults.map(r => `${r.platform}:${r.status}`),
  })

  return successResponse(
    { linkId: link.id, platformsUpdated: platformResults.length },
    'Platform statuses updated successfully'
  )
})
