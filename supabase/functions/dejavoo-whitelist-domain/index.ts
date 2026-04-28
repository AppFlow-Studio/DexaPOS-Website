// ============================================================================
// dejavoo-whitelist-domain Edge Function TODO
// ============================================================================
// Calls the Dejavoo / iPOSpays "Edit Merchant" Management API endpoint
// (POST /v2/merchant/add-on) to whitelist a storefront origin for a merchant's
// Dejavoo account. The flow is two-step:
//
//   1. Authenticate against /v1/authenticate-token using apiKey + secretKey to
//      obtain a short-lived JWT.
//   2. POST /v2/merchant/add-on with that JWT in the `Authorization` header,
//      sending { merchantId, whitelistDomains: { originUrls: [...] } }.
//
// `merchantId` is the 12-char Dejavoo-supplied id for THIS merchant — distinct
// from Dexa's internal merchants.id UUID. Callers source it from
// public.merchants.external_merchant_id.
//
// originUrls is treated as a REPLACE list by Dejavoo, so the caller passes the
// existing whitelist (from location_payment_devices.whitelist_origins) plus
// the new storefront origin and we merge & dedupe before sending.
//
// Auth header format note: per the docs page on the "Edit Merchant" endpoint,
// the table reads "Authorization | <token>" (raw JWT, no Bearer prefix). If
// the live endpoint rejects this with 401, try `Authorization: Bearer <token>`
// or `token: <token>` (the pattern used by /v3/iposTransact).
// ============================================================================

const DEJAVOO_IPOS_API_KEY = Deno.env.get('DEJAVOO_IPOS_API_KEY') ?? ''
const DEJAVOO_IPOS_SECRET_KEY = Deno.env.get('DEJAVOO_IPOS_SECRET_KEY') ?? ''

const DEJAVOO_EXTERNAL_API_URL = (
  Deno.env.get('DEJAVOO_EXTERNAL_API_URL') ||
  Deno.env.get('DEJAVOO_MANAGEMENT_API_URL') ||
  'https://externalapi.ipospays.tech'
).replace(/\/+$/, '')

// Auth host follows the same TLD as the external API host unless overridden:
//   externalapi.ipospays.tech → auth.ipospays.tech
//   externalapi.ipospays.com  → auth.ipospays.com
const DEJAVOO_AUTH_URL =
  Deno.env.get('DEJAVOO_AUTH_URL') ||
  (DEJAVOO_EXTERNAL_API_URL.endsWith('.com')
    ? 'https://auth.ipospays.com/v1/authenticate-token'
    : 'https://auth.ipospays.tech/v1/authenticate-token')

const ROOT_DOMAIN = Deno.env.get('NEXT_PUBLIC_ROOT_DOMAIN') || 'dexaposai.com'
const DEFAULT_ALLOWED_DOMAINS = parseDomainList(
  Deno.env.get('DEJAVOO_DEFAULT_ALLOWED_DOMAINS') ??
    'https://payment.ipospays.tech,https://payment.ipospays.com'
)

// Per the Dejavoo Management API auth docs
// (app.theneo.io/dejavoo/authentication-token/authentication/authenticate-token),
// the auth-token call takes ONLY apiKey + secretKey as headers and does NOT
// take a `scope` header. `scope` is iPOS-Transact-specific (PaymentTokenization)
// and including it here issues a JWT whose audience does not match
// /v2/merchant/add-on, which then returns 401 "API token inactive or revoked."

// Debug-mode env vars:
// - DEJAVOO_DEBUG_LOG_TOKEN=true  → log full JWT (staging only — never set in prod)
// - DEJAVOO_DISABLE_TOKEN_CACHE=true → fetch a fresh token on every call
// - DEJAVOO_WHITELIST_AUTH_HEADER=raw|bearer|token-header → control how the
//     JWT is sent to /v2/merchant/add-on. Default 'raw' = `Authorization: <jwt>`.
const DEJAVOO_DEBUG_LOG_TOKEN =
  (Deno.env.get('DEJAVOO_DEBUG_LOG_TOKEN') ?? '').toLowerCase() === 'true'
const DEJAVOO_DISABLE_TOKEN_CACHE =
  (Deno.env.get('DEJAVOO_DISABLE_TOKEN_CACHE') ?? '').toLowerCase() === 'true'
const DEJAVOO_WHITELIST_AUTH_HEADER = (
  Deno.env.get('DEJAVOO_WHITELIST_AUTH_HEADER') ?? 'raw'
).toLowerCase()

const AUTH_TIMEOUT_MS = 5_000
const WHITELIST_TIMEOUT_MS = 10_000
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before stated expiry
const TOKEN_MAX_TTL_MS = 23 * 60 * 60 * 1000

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

// ============================================================================
// AUTH (token cache + in-flight guard)
// ============================================================================
// Edge function isolates persist between requests, so a module-scope cache
// avoids re-authenticating on every invocation. The `inflight` guard dedupes
// concurrent first-callers on a cold start so we don't issue N parallel auth
// requests that each race to populate the cache.

let cachedToken: { token: string; expiresAt: number } | null = null
let inflightAuth: Promise<string> | null = null

async function fetchAuthToken(): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  try {
    // Management API auth: apiKey + secretKey as HEADERS, no body, no scope.
    // The /v2/merchant/add-on endpoint validates the JWT against this audience.
    // Note: these credentials are Dejavoo-issued for the Management API; if
    // you only have iPOS-Transact creds, request Management API creds from
    // Dejavoo support — they are not always the same key pair.
    const response = await fetch(DEJAVOO_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: DEJAVOO_IPOS_API_KEY,
        secretKey: DEJAVOO_IPOS_SECRET_KEY,
      },
      signal: controller.signal,
    })

    const responseText = await response.text().catch(() => '')
    if (!response.ok) {
      throw new Error(
        `Dejavoo auth failed (${response.status}) at ${DEJAVOO_AUTH_URL}: ${
          responseText || 'no body'
        }`,
      )
    }

    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(responseText) as Record<string, unknown>
    } catch {
      throw new Error(
        `Dejavoo auth: non-JSON response from ${DEJAVOO_AUTH_URL}: ${responseText.slice(0, 200)}`,
      )
    }

    // Some iPOSpays errors come back as 200 with { responseCode: "AUTH_ERR_xxx" }.
    const responseCode =
      typeof data.responseCode === 'string' ? data.responseCode : null
    if (responseCode && responseCode !== '00') {
      const message =
        typeof data.responseMessage === 'string'
          ? data.responseMessage
          : 'Unknown auth error'
      throw new Error(`Dejavoo auth ${responseCode}: ${message}`)
    }

    const token =
      (typeof data.token === 'string' && data.token) ||
      (typeof data.access_token === 'string' && data.access_token) ||
      (typeof data.jwt === 'string' && data.jwt) ||
      ''

    if (!token) {
      throw new Error(
        `Dejavoo auth: no token field in response body: ${responseText.slice(0, 200)}`,
      )
    }

    const expiresInMin =
      typeof data.tokenExpiresInMinutes === 'number'
        ? data.tokenExpiresInMinutes
        : null
    const expiresAt = expiresInMin
      ? Date.now() + Math.max(0, expiresInMin * 60_000 - TOKEN_EXPIRY_BUFFER_MS)
      : Date.now() + TOKEN_MAX_TTL_MS

    cachedToken = DEJAVOO_DISABLE_TOKEN_CACHE
      ? null
      : { token, expiresAt: Math.min(expiresAt, Date.now() + TOKEN_MAX_TTL_MS) }
    console.log(
      '[DEJAVOO_WHITELIST_FN] Auth OK from',
      DEJAVOO_AUTH_URL,
      'tokenLen=',
      token.length,
      'tokenPrefix=',
      token.slice(0, 16),
      DEJAVOO_DEBUG_LOG_TOKEN ? `\nFULL_TOKEN=${token}` : '',
    )
    return token
  } finally {
    clearTimeout(timeoutId)
  }
}

async function authenticateIPOS(): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { success: true, token: cachedToken.token }
  }

  if (inflightAuth) {
    try {
      const token = await inflightAuth
      return { success: true, token }
    } catch (err) {
      return { success: false, error: String(err instanceof Error ? err.message : err) }
    }
  }

  inflightAuth = fetchAuthToken()
  try {
    const token = await inflightAuth
    return { success: true, token }
  } catch (err) {
    cachedToken = null
    console.error('[DEJAVOO_WHITELIST_FN] Auth error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Dejavoo auth network error',
    }
  } finally {
    inflightAuth = null
  }
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  if (!DEJAVOO_IPOS_API_KEY || !DEJAVOO_IPOS_SECRET_KEY) {
    console.error('[DEJAVOO_WHITELIST_FN] Missing DEJAVOO_IPOS_API_KEY or DEJAVOO_IPOS_SECRET_KEY')
    return jsonResponse(
      {
        success: false,
        error:
          'Dejavoo whitelist requires DEJAVOO_IPOS_API_KEY and DEJAVOO_IPOS_SECRET_KEY edge function secrets.',
      },
      500,
    )
  }

  try {
    let body: {
      merchantId?: string
      // Legacy field accepted for backwards-compatibility during the staging
      // cutover. Callers should send `merchantId`; if only `tpn` arrives we
      // refuse — TPN is no longer the right identifier for this endpoint.
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

    const merchantId = body.merchantId?.trim()
    const storeSlug = body.storeSlug?.trim()

    if (!merchantId) {
      return jsonResponse(
        {
          success: false,
          skipped: 'missing_merchant_id',
          error:
            'merchantId is required. Set the Dejavoo Merchant ID in the Online Store tab.',
        },
        400,
      )
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

    const originUrls = parseDomainList([
      ...DEFAULT_ALLOWED_DOMAINS,
      ...(body.existingDomains ?? []),
      normalizedStoreDomain,
    ])

    const auth = await authenticateIPOS()
    if (!auth.success) {
      return jsonResponse({ success: false, error: auth.error }, 502)
    }

    const whitelistController = new AbortController()
    const whitelistTimeoutId = setTimeout(
      () => whitelistController.abort(),
      WHITELIST_TIMEOUT_MS,
    )

    // Build the auth header for the whitelist call. Default is the raw JWT in
    // `Authorization` (per the Theneo Edit-Merchant docs example). If that
    // returns 401 "TOKEN_INACTIVE", flip the env var to test alternates.
    const whitelistHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    switch (DEJAVOO_WHITELIST_AUTH_HEADER) {
      case 'bearer':
        whitelistHeaders.Authorization = `Bearer ${auth.token}`
        break
      case 'token-header':
        whitelistHeaders.token = auth.token
        break
      case 'raw':
      default:
        whitelistHeaders.Authorization = auth.token
        break
    }

    const whitelistBody = JSON.stringify({
      merchantId,
      whitelistDomains: { originUrls },
    })

    console.log(
      '[DEJAVOO_WHITELIST_FN] Whitelist request:',
      'url=',
      `${DEJAVOO_EXTERNAL_API_URL}/v2/merchant/add-on`,
      'authHeader=',
      DEJAVOO_WHITELIST_AUTH_HEADER,
      'tokenLen=',
      auth.token.length,
      'tokenPrefix=',
      auth.token.slice(0, 16),
      'body=',
      whitelistBody,
      DEJAVOO_DEBUG_LOG_TOKEN ? `\nFULL_TOKEN=${auth.token}` : '',
    )

    let response: Response
    try {
      response = await fetch(`${DEJAVOO_EXTERNAL_API_URL}/v2/merchant/add-on`, {
        method: 'POST',
        headers: whitelistHeaders,
        body: whitelistBody,
        signal: whitelistController.signal,
      })
    } finally {
      clearTimeout(whitelistTimeoutId)
    }

    const responseText = await response.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(responseText)
    } catch {
      // non-JSON body — leave empty
    }

    if (!response.ok) {
      console.error(
        '[DEJAVOO_WHITELIST_FN] Whitelist call failed:',
        response.status,
        'url=',
        `${DEJAVOO_EXTERNAL_API_URL}/v2/merchant/add-on`,
        'authUrl=',
        DEJAVOO_AUTH_URL,
        'body=',
        responseText,
      )

      // 401 from the whitelist call after a fresh auth means the cached token
      // is bad. Drop the cache so the next invocation re-authenticates.
      // Common causes: (1) sandbox token used against prod endpoint or vice
      // versa — DEJAVOO_AUTH_URL and DEJAVOO_EXTERNAL_API_URL must point at
      // the same environment; (2) Management API credentials not issued — the
      // same `DEJAVOO_IPOS_API_KEY` may not work for /v2/merchant/add-on if
      // Dejavoo issued separate Management API creds.
      if (response.status === 401) {
        cachedToken = null
      }

      return jsonResponse(
        {
          success: false,
          error: `Dejavoo domain whitelist failed (${response.status}): ${
            (data as { message?: string }).message ||
            responseText ||
            'Unknown error'
          }`,
        },
        502,
      )
    }

    return jsonResponse({
      success: true,
      domain: normalizedStoreDomain,
      allowedDomains: originUrls,
      response: data,
    })
  } catch (error) {
    console.error('[DEJAVOO_WHITELIST_FN] Unhandled error:', error)
    return jsonResponse(
      {
        success: false,
        error: `Domain whitelist network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      500,
    )
  }
})
