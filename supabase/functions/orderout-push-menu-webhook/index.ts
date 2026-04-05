import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// OrderOut Push Menu Webhook
// Receives per-platform push results (UBEREATS, GRUBHUB, DOORDASH) after a
// menu is pushed to OrderOut. Updates platform_statuses on orderout_menu_links
// and connected_channels on orderout_restaurants.
//
// Registration (one-time, platform-wide): POST /webhooks/push_menu on OrderOut
// with the same ORDEROUT_WEBHOOK_SECRET this function validates against.
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
// DLQ — Dead Letter Queue
// ============================================================================

async function insertDeadLetter(
  supabase: ReturnType<typeof createClient>,
  payload: unknown,
  errorMessage: string,
  eventType: string = 'push_menu'
): Promise<void> {
  const { error } = await supabase.from('webhook_dead_letter_queue').insert({
    source: 'orderout',
    event_type: eventType,
    raw_payload: payload,
    error_message: errorMessage,
    status: 'pending',
  })
  if (error) logError('DLQ', 'Failed to insert into dead letter queue', error)
  else logEvent('DLQ', `Payload stored: ${errorMessage}`)
}

// ============================================================================
// AUTH VALIDATION
// ============================================================================

function validateAuth(req: Request): { valid: boolean; error?: string } {
  if (!WEBHOOK_SECRET) {
    return { valid: false, error: 'ORDEROUT_WEBHOOK_SECRET not configured' }
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
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
// PLATFORM + STATUS NORMALIZATION
// ============================================================================

const PLATFORM_ALIASES: Record<string, string> = {
  'UBEREATS': 'UBEREATS', 'UBER_EATS': 'UBEREATS', 'UBER EATS': 'UBEREATS',
  'DOORDASH': 'DOORDASH', 'DOOR_DASH': 'DOORDASH', 'DOOR DASH': 'DOORDASH',
  'GRUBHUB': 'GRUBHUB',   'GRUB_HUB': 'GRUBHUB',   'GRUB HUB': 'GRUBHUB',
}

function normalizePlatform(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toUpperCase().replace(/-/g, '_')
  if (!key) return null
  return PLATFORM_ALIASES[key] || key
}

const VALID_STATUSES = new Set(['success', 'failed', 'pending'])

function normalizeStatus(raw: unknown): 'success' | 'failed' | 'pending' | 'unknown' {
  if (typeof raw !== 'string') return 'unknown'
  const s = raw.trim().toLowerCase()
  return (VALID_STATUSES.has(s) ? s : 'unknown') as 'success' | 'failed' | 'pending' | 'unknown'
}

// ============================================================================
// TYPES
// ============================================================================

interface PushMenuWebhookPayload {
  menu_id: number | string
  restaurant_id?: string
  results?: unknown
  [key: string]: unknown
}

interface SanitizedResult {
  platform: string
  status: 'success' | 'failed' | 'pending' | 'unknown'
  error: string | null
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
    // If the secret is unset we have a misconfigured server — surface as 500
    if (auth.error === 'ORDEROUT_WEBHOOK_SECRET not configured') {
      return errorResponse('Server not configured', 500)
    }
    return errorResponse('Unauthorized', 401)
  }

  // 2. Init Supabase service-role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 3. Parse body
  let rawBody = ''
  let body: PushMenuWebhookPayload
  try {
    rawBody = await req.text()
    body = JSON.parse(rawBody) as PushMenuWebhookPayload
  } catch {
    await insertDeadLetter(supabase, { _raw: rawBody }, 'Invalid JSON body')
    return errorResponse('Invalid JSON body', 400)
  }

  logEvent('PUSH_MENU_WEBHOOK', 'Received push_menu callback', {
    menu_id: body.menu_id,
    restaurant_id: body.restaurant_id,
    resultCount: Array.isArray(body.results) ? body.results.length : 0,
  })

  // 4. Validate required fields
  const ooMenuId = body.menu_id
  if (ooMenuId === undefined || ooMenuId === null || ooMenuId === '') {
    logError('PUSH_MENU_WEBHOOK', 'Missing menu_id in payload', body)
    await insertDeadLetter(supabase, body, 'Missing menu_id')
    return errorResponse('Missing menu_id', 400)
  }

  // 5. Guard against non-array results
  if (body.results != null && !Array.isArray(body.results)) {
    await insertDeadLetter(supabase, body, 'results field is not an array')
    return successResponse(null, 'Malformed results; stored in DLQ')
  }

  const rawResults = (body.results ?? []) as unknown[]

  // 6. Short-circuit on empty results
  if (rawResults.length === 0) {
    logEvent('PUSH_MENU_WEBHOOK', 'No platform results in payload — nothing to update')
    return successResponse(null, 'No platform results to process')
  }

  // 7. Sanitize results
  const sanitized: SanitizedResult[] = rawResults
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => {
      const rawStatus = (r as Record<string, unknown>).status
      const normalizedStatus = normalizeStatus(rawStatus)
      const rawError = (r as Record<string, unknown>).error
      // If status was not recognized, preserve the original value in last_error
      const lastError =
        typeof rawError === 'string'
          ? rawError
          : normalizedStatus === 'unknown' && typeof rawStatus === 'string'
            ? `unknown_status:${rawStatus}`
            : null
      return {
        platform: normalizePlatform((r as Record<string, unknown>).platform) ?? '',
        status: normalizedStatus,
        error: lastError,
      }
    })
    .filter((r) => r.platform.length > 0)

  if (sanitized.length === 0) {
    await insertDeadLetter(supabase, body, 'All result entries had invalid platform')
    return successResponse(null, 'No valid entries; stored in DLQ')
  }

  // 8. Find the menu link by oo_menu_id
  let link: {
    id: string
    orderout_restaurant_id: string
    menu_id: string
    platform_statuses: unknown
  } | null = null

  {
    const { data, error } = await supabase
      .from('orderout_menu_links')
      .select('id, orderout_restaurant_id, menu_id, platform_statuses')
      .eq('oo_menu_id', String(ooMenuId))
      .maybeSingle()

    if (error) {
      logError('PUSH_MENU_WEBHOOK', 'Database error looking up menu link', error)
      return errorResponse('Database error', 500)
    }
    link = data as typeof link
  }

  // 9. Fallback: resolve via restaurant_id + oo_menu_id (tiebreaker)
  if (!link && body.restaurant_id) {
    const { data: restaurant } = await supabase
      .from('orderout_restaurants')
      .select('id')
      .eq('oo_restaurant_id', String(body.restaurant_id))
      .maybeSingle()

    if (restaurant) {
      const { data: candidates } = await supabase
        .from('orderout_menu_links')
        .select('id, orderout_restaurant_id, menu_id, platform_statuses')
        .eq('orderout_restaurant_id', (restaurant as { id: string }).id)
        .eq('oo_menu_id', String(ooMenuId))

      if (candidates?.length === 1) {
        link = candidates[0] as typeof link
      }
    }
  }

  if (!link) {
    await insertDeadLetter(
      supabase,
      body,
      `No menu link for oo_menu_id=${ooMenuId} restaurant_id=${body.restaurant_id ?? 'null'}`
    )
    return successResponse(null, 'No matching menu link; stored in DLQ')
  }

  // 10. Build JSONB merge payload
  const nowIso = new Date().toISOString()
  const platformStatusUpdates: Record<string, unknown> = {}
  for (const r of sanitized) {
    platformStatusUpdates[r.platform] = {
      status: r.status,
      last_updated: nowIso,
      last_error: r.error,
    }
  }

  // 11. Atomic merge into orderout_menu_links.platform_statuses
  const { error: mergeLinkError } = await supabase.rpc(
    'merge_orderout_platform_statuses',
    { p_link_id: link.id, p_updates: platformStatusUpdates }
  )

  if (mergeLinkError) {
    logError('PUSH_MENU_WEBHOOK', 'Failed to merge platform_statuses', mergeLinkError)
    return errorResponse('Failed to update platform statuses', 500)
  }

  // 12. Atomic merge into orderout_restaurants.connected_channels
  if (link.orderout_restaurant_id) {
    const { error: mergeRestError } = await supabase.rpc(
      'merge_orderout_connected_channels',
      { p_restaurant_id: link.orderout_restaurant_id, p_updates: platformStatusUpdates }
    )
    if (mergeRestError) {
      logError('PUSH_MENU_WEBHOOK', 'Failed to merge connected_channels (non-fatal)', mergeRestError)
    }
  }

  // 13. Audit log entry in orderout_menu_syncs
  const successCount = sanitized.filter((r) => r.status === 'success').length
  const syncStatus =
    successCount === sanitized.length
      ? 'success'
      : successCount > 0
        ? 'partial'
        : 'failed'

  const errorEntries = sanitized.filter((r) => r.error)
  const { error: syncLogError } = await supabase
    .from('orderout_menu_syncs')
    .insert({
      orderout_restaurant_id: link.orderout_restaurant_id,
      menu_id: link.menu_id,
      oo_menu_id: String(ooMenuId),
      sync_direction: 'push',
      sync_status: syncStatus,
      items_synced: 0,
      items_failed: 0,
      error_details: errorEntries.length
        ? JSON.stringify(errorEntries.map((r) => ({ platform: r.platform, error: r.error })))
        : null,
      menu_payload_snapshot: {
        webhook_event: 'push_menu_result',
        platforms: sanitized,
        raw_payload: body,
      },
      synced_at: nowIso,
    })

  if (syncLogError) {
    logError('PUSH_MENU_WEBHOOK', 'Failed to create sync log entry (non-fatal)', syncLogError)
  }

  logEvent('PUSH_MENU_WEBHOOK', 'Platform statuses updated', {
    linkId: link.id,
    platforms: sanitized.map((r) => `${r.platform}:${r.status}`),
  })

  return successResponse(
    { linkId: link.id, platformsUpdated: sanitized.length, syncStatus },
    'Platform statuses updated successfully'
  )
})
