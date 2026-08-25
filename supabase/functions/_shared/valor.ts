// ============================================================================
// [C3] Deno port of the two Valor storefront calls: GetClientToken + Direct Sale.
// ============================================================================
// WHY THIS EXISTS (and mirrors lib/payments/valor):
//   The storefront charge runs inside the create-online-order Deno edge function,
//   which cannot import the Next.js lib/payments module. Rather than relocate the
//   edge function's validated (validate -> charge -> create-order -> record)
//   ordering into Next.js, we mirror exactly two Valor HTTP calls here — the same
//   pattern _shared/nmi.ts already uses alongside the Node NMI client. The Node
//   source of truth is lib/payments/valor/{saleApi,client,config}.ts; a
//   golden-body parity test keeps the sale request body from drifting.
//
// SECURITY: the appkey never appears in a log line here. Do not add one.
//
// Sources mirrored 2026-08-09: [V-DST] direct-sale-token-api, [V-PASS2]
// documentation-v20 (same provenance as the Node modules).
// ============================================================================

export type ValorEnvironment = 'sandbox' | 'production'

export interface ValorEndpoints {
  environment: ValorEnvironment
  /** GetClientToken + Direct Sale host. Sandbox is :443. */
  transactionBaseUrl: string
  /** Legacy GetClientToken host (:4430). Retained for fidelity; unused. */
  clientTokenBaseUrl: string
  /** Passed to Passage.js as isDemo; must not disagree with the browser SDK. */
  isDemo: boolean
}

const SANDBOX_CLIENT_TOKEN_BASE = 'https://securelink-staging.valorpaytech.com:4430'
const SANDBOX_TRANSACTION_BASE = 'https://securelink-staging.valorpaytech.com:443'

const DEFAULT_TIMEOUT_MS = 15_000

/** Valor caps a single transaction at $99,999.99 ([V-DST]). Minor units. */
export const VALOR_MAX_AMOUNT_MINOR = 9_999_999

// Web checkout is card-only: run on the traditional MID with no added fee ("0"
// per [V-DST]). Merchants are boarded surcharge-enabled, so this deliberately
// disagrees with boarding — sending "1" here would add an unauthorized surcharge
// to a customer's card. It is a constant, never a parameter. Note it is the
// *string* "0".
const SURCHARGE_INDICATOR_CARD_ONLY = '0' as const

type JsonRecord = Record<string, unknown>

export interface ValorCredentials {
  appId: string
  appKey: string
  /** 10-digit identifier beginning with 2. */
  epi: string
}

export function readValorEnvironment(): ValorEnvironment {
  return Deno.env.get('VALOR_ENV') === 'production' ? 'production' : 'sandbox'
}

/**
 * Resolve the hosts to call. Production hosts are never hardcoded — Valor only
 * publishes staging hosts, and a guessed production host in a module that moves
 * money is how a live charge ends up pointed somewhere unintended. Production
 * requires VALOR_BASE_URL explicitly (mirrors config.ts:resolveValorEndpoints).
 */
export function resolveValorEndpoints(): ValorEndpoints {
  const environment = readValorEnvironment()

  if (environment === 'production') {
    const base = Deno.env.get('VALOR_BASE_URL')?.trim()
    if (!base) {
      throw new Error(
        'VALOR_ENV=production requires VALOR_BASE_URL to be set explicitly; ' +
          "Valor's published docs only cover demo/staging hosts, so a production " +
          'host must come from Valor, not be guessed.',
      )
    }
    const normalized = base.replace(/\/+$/, '')
    return {
      environment,
      transactionBaseUrl: normalized,
      clientTokenBaseUrl: normalized,
      isDemo: false,
    }
  }

  return {
    environment,
    transactionBaseUrl: SANDBOX_TRANSACTION_BASE,
    clientTokenBaseUrl: SANDBOX_CLIENT_TOKEN_BASE,
    isDemo: true,
  }
}

/** Per [V-DST]: "it's a 10 digit number starts with 2". */
export function isValidEpi(epi: string): boolean {
  return /^2\d{9}$/.test(epi)
}

/** Integer minor units to a fixed-2 string, e.g. 2550 -> "25.50". */
export function formatMinorUnits(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

/**
 * Valor signals success on the securelink hosts with error_no "S00" +
 * error_code "00" (mirrors client.ts:isValorSuccess — the vault-host `code`
 * path is intentionally not ported; the storefront never touches the vault).
 */
export function isValorSuccess(body: JsonRecord): boolean {
  return body.error_no === 'S00' && body.error_code === '00'
}

/** Human-readable error from a failed securelink response (mirrors client.ts). */
export function extractValorError(body: JsonRecord): string | null {
  for (const key of ['error_message', 'response_text', 'message', 'status']) {
    const value = body[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function firstString(source: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const v = source[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

/**
 * POST to a securelink endpoint with credentials merged into the body — the same
 * injection client.ts does, so a call site cannot forget or mismatch them.
 */
async function postWithBodyCredentials(
  path: string,
  payload: JsonRecord,
  credentials: ValorCredentials,
  endpoints: ValorEndpoints,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ status: number; body: JsonRecord }> {
  const response = await fetch(`${endpoints.transactionBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appid: credentials.appId,
      appkey: credentials.appKey,
      epi: credentials.epi,
      ...payload,
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })

  const text = await response.text()
  let body: JsonRecord = {}
  try {
    if (text) body = JSON.parse(text) as JsonRecord
  } catch {
    body = {}
  }
  return { status: response.status, body }
}

// ---------------------------------------------------------------------------
// GetClientToken
// ---------------------------------------------------------------------------

export interface ValorClientToken {
  clientToken: string
  /** Absolute expiry timestamp, e.g. "2026-01-05 12:44:01". */
  validity: string
  epi: string
  isDemo: boolean
}

/**
 * Mint the short-lived token Passage.js needs to render the card form.
 *
 * POST /?gptoken txn_type "clientToken" on the :443 transaction host
 * (mirrors saleApi.ts:getClientToken — confirmed live against sandbox; the prior
 * :4430 /?saleapi= guess was rejected with error_no D07). The clientToken is
 * safe to hand the browser; the appKey used to obtain it is not.
 */
export async function getClientToken(
  credentials: ValorCredentials,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorClientToken> {
  if (!isValidEpi(credentials.epi)) {
    throw new Error(`EPI must be 10 digits beginning with 2, received "${credentials.epi}"`)
  }

  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const { status, body } = await postWithBodyCredentials(
    '/?gptoken',
    { txn_type: 'clientToken' },
    credentials,
    endpoints,
    options.timeoutMs,
  )

  const clientToken = typeof body.clientToken === 'string' ? body.clientToken : ''
  if (!isValorSuccess(body) || !clientToken) {
    throw new Error(
      extractValorError(body) ??
        `Valor GetClientToken failed (HTTP ${status}, error_no ${String(body.error_no ?? 'none')})`,
    )
  }

  return {
    clientToken,
    validity: typeof body.validity === 'string' ? body.validity : '',
    epi: credentials.epi,
    isDemo: endpoints.isDemo,
  }
}

// ---------------------------------------------------------------------------
// Direct Sale Token
// ---------------------------------------------------------------------------

/** Product line required by [V-DST] when order details are included. */
export interface ValorProductLine {
  product_id: string
  qty: number
  modifierIds?: string[]
}

export interface ValorSaleParams {
  /** Grand-total charge amount in integer minor units. */
  amountMinor: number
  /** Card token from Passage.js onTokenReceived. */
  token: string
  /** Merchant-facing reference; also aligns Valor's duplicate check with ours. */
  invoiceNumber: string
  productLines: ValorProductLine[]
  taxMinor?: number
  tipMinor?: number
  cardholderName?: string
  orderDescription?: string
  email?: string
  phone?: string
  address1?: string
  zip?: string
  shippingCountry?: string
}

export interface ValorSaleRequestBody {
  appid: string
  appkey: string
  epi: string
  txn_type: 'sale'
  /** Major units as a string, e.g. "25.50". */
  amount: string
  token: string
  invoicenumber: string
  surchargeIndicator: typeof SURCHARGE_INDICATOR_CARD_ONLY
  shipping_country: string
  productIds: ValorProductLine[]
  tax_amount?: string
  tip?: string
  cardholdername?: string
  orderdescription?: string
  email?: string
  phone?: string
  address1?: string
  zip?: string
}

/**
 * Build the Direct Sale Token request body. Pure — exported so the golden-body
 * parity test can assert this matches lib/payments/valor/saleApi.ts's
 * buildSaleRequestBody for identical inputs.
 */
export function buildSaleRequestBody(
  credentials: ValorCredentials,
  params: ValorSaleParams,
): ValorSaleRequestBody {
  if (!Number.isInteger(params.amountMinor)) {
    throw new RangeError(
      `Valor sale amount must be an integer in minor units, received ${params.amountMinor}`,
    )
  }
  if (params.amountMinor <= 0) {
    throw new RangeError('Valor will not process a zero- or negative-amount sale')
  }
  if (params.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      `Amount exceeds Valor's $99,999.99 per-transaction cap (received ${formatMinorUnits(params.amountMinor)})`,
    )
  }

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: 'sale',
    amount: formatMinorUnits(params.amountMinor),
    token: params.token,
    invoicenumber: params.invoiceNumber,
    surchargeIndicator: SURCHARGE_INDICATOR_CARD_ONLY,
    shipping_country: params.shippingCountry ?? 'US',
    productIds: params.productLines,
    ...(params.taxMinor !== undefined ? { tax_amount: formatMinorUnits(params.taxMinor) } : {}),
    ...(params.tipMinor !== undefined ? { tip: formatMinorUnits(params.tipMinor) } : {}),
    ...(params.cardholderName ? { cardholdername: params.cardholderName } : {}),
    ...(params.orderDescription ? { orderdescription: params.orderDescription } : {}),
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.address1 ? { address1: params.address1 } : {}),
    ...(params.zip ? { zip: params.zip } : {}),
  }
}

export type ValorSaleOutcome = 'approved' | 'declined' | 'error'

export interface ValorSaleResult {
  /** True only when Valor approved. */
  success: boolean
  /**
   * `declined` = Valor answered and refused (try another card). `error` =
   * transport/5xx, no clean answer (retry the same card). Kept distinct so a
   * gateway outage is never surfaced to a payer as a decline.
   */
  outcome: ValorSaleOutcome
  status: number
  details: {
    transactionId: string
    authCode: string
    responseCode: string
    responseText: string
    rrn: string
  }
  body: JsonRecord
}

/** Map a Valor sale response onto a provider-neutral result (mirrors toProcessorTransaction). */
export function toSaleResult(status: number, body: JsonRecord): ValorSaleResult {
  const approved = isValorSuccess(body)
  const transportFailed = status >= 500 || status === 0
  const outcome: ValorSaleOutcome = approved ? 'approved' : transportFailed ? 'error' : 'declined'

  return {
    success: approved,
    outcome,
    status,
    details: {
      transactionId: firstString(body, ['txn_id', 'transaction_id']),
      authCode: firstString(body, ['approval_code', 'auth_code']),
      responseCode: firstString(body, ['error_code']),
      responseText:
        firstString(body, ['response_text', 'error_message']) ||
        (transportFailed
          ? 'Payment service is temporarily unavailable. Please try again.'
          : 'Your card was declined. Please try another card.'),
      rrn: firstString(body, ['rrn']),
    },
    body,
  }
}

/** Charge a Passage.js card token (Direct Sale Token). */
export async function createSale(
  credentials: ValorCredentials,
  params: ValorSaleParams,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorSaleResult> {
  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const body = buildSaleRequestBody(credentials, params)
  const { status, body: responseBody } = await postWithBodyCredentials(
    '/?saleToken',
    body as unknown as JsonRecord,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toSaleResult(status, responseBody)
}
