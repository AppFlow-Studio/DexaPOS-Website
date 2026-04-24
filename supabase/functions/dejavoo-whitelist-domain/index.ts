// ============================================================================
// dejavoo-whitelist-domain Edge Function
// ============================================================================
// Calls the Dejavoo/iPOS external API to whitelist/update a storefront origin
// for a TPN. The payload is merged with default and previously-synced domains
// so we do not overwrite the entire allow-list when a new storefront origin is
// added.
// ============================================================================

const DEJAVOO_IPOS_API_KEY = Deno.env.get('DEJAVOO_IPOS_API_KEY') ?? ''
const DEJAVOO_EXTERNAL_API_URL =
  Deno.env.get('DEJAVOO_EXTERNAL_API_URL') ||
  Deno.env.get('DEJAVOO_MANAGEMENT_API_URL') ||
  ((Deno.env.get('NEXT_PUBLIC_ROOT_DOMAIN') || '').includes('localhost')
    ? 'https://externalapi.ipospays.tech'
    : 'https://externalapi.ipospays.com')
const ROOT_DOMAIN = Deno.env.get('NEXT_PUBLIC_ROOT_DOMAIN') || 'dexaposai.com'
const DEFAULT_ALLOWED_DOMAINS = parseDomainList(
  Deno.env.get('DEJAVOO_DEFAULT_ALLOWED_DOMAINS') ??
    'https://payment.ipospays.tech,https://payment.ipospays.com'
)

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

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function parseDomainList(raw: string | string[]): string[] {
  const values = Array.isArray(raw)
    ? raw
    : raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

  return Array.from(
    new Set(
      values
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value))
    )
  )
}

function buildAuthorizationHeader(rawKey: string): string {
  const trimmed = rawKey.trim()
  if (!trimmed) return ''
  if (/^(api[- ]?key|bearer)\s+/i.test(trimmed)) return trimmed
  return `API KEY ${trimmed}`
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    let body: {
      tpn?: string
      storeSlug?: string
      storeDomain?: string
      existingDomains?: string[]
    }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
    }

    const tpn = body.tpn?.trim()
    const storeSlug = body.storeSlug?.trim()

    if (!tpn) {
      return jsonResponse({ success: false, error: 'tpn is required' }, 400)
    }

    let storeDomain = body.storeDomain?.trim()
    if (!storeDomain) {
      if (!storeSlug) {
        return jsonResponse(
          { success: false, error: 'storeDomain or storeSlug is required' },
          400,
        )
      }
      const isDev = ROOT_DOMAIN.includes('localhost')
      storeDomain = isDev
        ? `http://${storeSlug}.localhost:3000`
        : `https://${storeSlug}.${ROOT_DOMAIN}`
    }

    const normalizedStoreDomain = normalizeOrigin(storeDomain)
    if (!normalizedStoreDomain) {
      return jsonResponse({ success: false, error: 'Invalid store domain' }, 400)
    }

    const allowedDomains = parseDomainList([
      ...DEFAULT_ALLOWED_DOMAINS,
      ...(body.existingDomains ?? []),
      normalizedStoreDomain,
    ])

    const authorizationHeader = buildAuthorizationHeader(DEJAVOO_IPOS_API_KEY)

    if (!authorizationHeader) {
      console.error('[DEJAVOO_WHITELIST_FN] Missing DEJAVOO_IPOS_API_KEY')
      return jsonResponse(
        {
          success: false,
          error: 'Automatic whitelist requires DEJAVOO_IPOS_API_KEY.',
        },
        500,
      )
    }

    const response = await fetch(`${DEJAVOO_EXTERNAL_API_URL}/v3/tpn/parameters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorizationHeader,
      },
      body: JSON.stringify({
        tpn,
        allowedDomains,
      }),
    })

    const responseText = await response.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(responseText)
    } catch {
      // ignore non-json payloads
    }

    if (!response.ok) {
      console.error('[DEJAVOO_WHITELIST_FN] Failed:', response.status, responseText)
      return jsonResponse(
        {
          success: false,
          error: `Dejavoo domain whitelist failed (${response.status}): ${
            (data as { message?: string }).message || responseText || 'Unknown error'
          }`,
        },
        502,
      )
    }

    return jsonResponse({
      success: true,
      domain: normalizedStoreDomain,
      allowedDomains,
      response: data,
    })
  } catch (error) {
    console.error('[DEJAVOO_WHITELIST_FN] Unhandled error:', error)
    return jsonResponse(
      {
        success: false,
        error: `Domain whitelist network error: ${String(error)}`,
      },
      500,
    )
  }
})
