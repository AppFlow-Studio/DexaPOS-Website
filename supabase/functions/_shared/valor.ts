// ============================================================================
// [C3] Deno port of the two Valor storefront calls: GetClientToken + Direct Sale.
// ============================================================================
// WHY THIS EXISTS (and mirrors lib/payments/valor):
//   The storefront charge runs inside the create-online-order Deno edge function,
//   which cannot import the Next.js lib/payments module. Rather than relocate the
//   edge function's validated (validate -> charge -> create-order -> record)
//   ordering into Next.js, we mirror exactly two Valor HTTP calls here - the same
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
export type ValorSurchargeIndicator = '0' | '1'

const VALOR_PUBLIC_SANDBOX_SURCHARGE_EPI = '2412333540'

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

// Request builders default to the traditional MID ("0"). A sandbox-only,
// exact-EPI resolver may select the processor-configured surcharge MID ("1").
type JsonRecord = Record<string, unknown>
type EnvLike = Record<string, string | undefined>

export interface ValorCredentials {
  appId: string
  appKey: string
  /** 10-digit identifier beginning with 2. */
  epi: string
}

export function readValorEnvironment(): ValorEnvironment {
  return Deno.env.get('VALOR_ENV') === 'production' ? 'production' : 'sandbox'
}

/** Enable surcharge mode only for an explicitly supported sandbox processor profile. */
export function resolveValorSurchargeIndicator(
  epi: string,
  env: EnvLike = {
    VALOR_ENV: Deno.env.get('VALOR_ENV'),
    VALOR_QA_SURCHARGE_EPI: Deno.env.get('VALOR_QA_SURCHARGE_EPI'),
  },
): ValorSurchargeIndicator {
  const qaEpi = env.VALOR_QA_SURCHARGE_EPI?.trim()
  const usesSandboxSurchargeProfile =
    epi === VALOR_PUBLIC_SANDBOX_SURCHARGE_EPI || qaEpi === epi
  return env.VALOR_ENV !== 'production' && usesSandboxSurchargeProfile
    ? '1'
    : '0'
}

/**
 * Resolve the hosts to call. Production hosts are never hardcoded - Valor only
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
 * error_code "00" (mirrors client.ts:isValorSuccess - the vault-host `code`
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
 * POST to a securelink endpoint with credentials merged into the body - the same
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
 * (mirrors saleApi.ts:getClientToken - confirmed live against sandbox; the prior
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
  ecomm_channel: 'passagejs'
  surchargeIndicator: ValorSurchargeIndicator
  shipping_country: string
  productIds?: ValorProductLine[]
  tax_amount?: string
  orderdescription?: string
  email?: string
  phone?: string
  address1?: string
  zip?: string
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, maxLength)
  return normalized || undefined
}

function normalizeAlphanumericText(value: string | undefined, maxLength: number): string | undefined {
  return normalizeOptionalText(value?.replace(/[^A-Za-z0-9 ]/g, ' '), maxLength)
}

function normalizePhone(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '') ?? ''
  const domestic = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return domestic.length === 10 ? domestic : undefined
}

function normalizeZip(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '') ?? ''
  return digits.length >= 5 ? digits.slice(0, 5) : undefined
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized.length <= 50 ? normalized : undefined
}

/** Valor accepts a maximum of 12 alphanumeric characters for invoice IDs. */
export function normalizeValorInvoiceNumber(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '')
  if (!normalized) {
    throw new RangeError('Valor invoice number must contain an alphanumeric character')
  }
  return normalized.slice(-12)
}

/**
 * Build the Direct Sale Token request body. Pure - exported so the golden-body
 * parity test can assert this matches lib/payments/valor/saleApi.ts's
 * buildSaleRequestBody for identical inputs.
 */
export function buildSaleRequestBody(
  credentials: ValorCredentials,
  params: ValorSaleParams,
  surchargeIndicator: ValorSurchargeIndicator = '0',
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

  const orderDescription = normalizeAlphanumericText(params.orderDescription, 50)
  const email = normalizeEmail(params.email)
  const phone = normalizePhone(params.phone)
  const address1 = normalizeAlphanumericText(params.address1, 100)
  const zip = normalizeZip(params.zip)

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: 'sale',
    amount: formatMinorUnits(params.amountMinor),
    token: params.token,
    invoicenumber: normalizeValorInvoiceNumber(params.invoiceNumber),
    ecomm_channel: 'passagejs',
    surchargeIndicator,
    shipping_country: params.shippingCountry ?? 'US',
    ...(params.productLines.length > 0 ? { productIds: params.productLines } : {}),
    ...(params.taxMinor !== undefined ? { tax_amount: formatMinorUnits(params.taxMinor) } : {}),
    ...(orderDescription ? { orderdescription: orderDescription } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(address1 ? { address1 } : {}),
    ...(zip ? { zip } : {}),
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
  const declined = body.error_no === 'E98' || body.error_code === 'E98'
  const gatewayFailed = !approved && !declined
  const outcome: ValorSaleOutcome = approved ? 'approved' : gatewayFailed ? 'error' : 'declined'
  const responseText = gatewayFailed
    ? firstString(body, ['desc', 'error_message', 'response_text', 'msg', 'mesg'])
    : firstString(body, ['msg', 'mesg', 'response_text', 'error_message', 'desc'])

  return {
    success: approved,
    outcome,
    status,
    details: {
      transactionId: firstString(body, ['txn_id', 'txnid', 'transaction_id']),
      authCode: firstString(body, ['approval_code', 'auth_code']),
      responseCode: firstString(body, ['error_code', 'error_no']),
      responseText:
        responseText ||
        (gatewayFailed
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
  const body = buildSaleRequestBody(
    credentials,
    params,
    resolveValorSurchargeIndicator(credentials.epi),
  )
  const { status, body: responseBody } = await postWithBodyCredentials(
    '/?sale',
    body as unknown as JsonRecord,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toSaleResult(status, responseBody)
}

// ---------------------------------------------------------------------------
// Native recurring subscriptions (SaaS billing)
// ---------------------------------------------------------------------------

export interface ValorRecurringParams {
  amountMinor: number
  vaultCustomerId: string
  paymentProfileId?: string | null
  billingCustomerName: string
  billingZip: string
  startsOn: Date
  chargeOn: number
  invoiceNumber?: string
  email?: string | null
  validateOnly?: boolean
}

export interface ValorRecurringResult {
  success: boolean
  status: number
  subscriptionId: string
  transactionId: string
  responseText: string
  body: JsonRecord
}

function formatValorSubscriptionDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid Valor subscription date')
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function buildValorRecurringBody(
  params: ValorRecurringParams,
  surchargeIndicator: ValorSurchargeIndicator = '0',
): JsonRecord {
  if (!Number.isInteger(params.amountMinor) || params.amountMinor <= 0) {
    throw new Error('Valor subscription amount must be a positive integer in minor units')
  }
  if (params.amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new Error('Valor subscription amount exceeds the processor limit')
  }
  if (!Number.isInteger(params.chargeOn) || params.chargeOn < 1 || params.chargeOn > 30) {
    throw new Error('Valor monthly charge day must be between 1 and 30')
  }

  return {
    amount: formatMinorUnits(params.amountMinor),
    surchargeAmount: '0.00',
    payment_info: {
      vault_id: params.vaultCustomerId,
      ...(params.paymentProfileId ? { payment_id: params.paymentProfileId } : {}),
    },
    surchargeIndicator,
    recurring_type: '2',
    is_validate_card: params.validateOnly ? '1' : '0',
    shipping_customer_name: params.billingCustomerName,
    shipping_zip: params.billingZip,
    billing_customer_name: params.billingCustomerName,
    billing_zip: params.billingZip,
    subscription_starts_from: formatValorSubscriptionDate(params.startsOn),
    charge_until: 'never_expired',
    charge_on: String(params.chargeOn),
    failure_notification: '1',
    // Valor owns recurring retries. Dexa records and enforces the resulting
    // grace/suspension state but must not independently charge the same cycle.
    retry_count: '1',
    additional_prompts: [],
    ...(params.invoiceNumber ? { invoice_no: params.invoiceNumber.slice(0, 12) } : {}),
    ...(params.email ? { email: params.email.slice(0, 50) } : {}),
  }
}

function toRecurringResult(status: number, body: JsonRecord): ValorRecurringResult {
  return {
    success: status < 400 && isValorSuccess(body),
    status,
    subscriptionId: firstString(body, ['subscription_id', 'subscriptionid']),
    transactionId: firstString(body, ['txn_id', 'transaction_id']),
    responseText:
      firstString(body, ['response_text', 'error_message', 'display_message', 'message']) ||
      extractValorError(body) ||
      'Valor recurring request failed',
    body,
  }
}

export async function createRecurringSubscription(
  credentials: ValorCredentials,
  params: ValorRecurringParams,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorRecurringResult> {
  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const body = {
    txn_type: 'add_subscription',
    ...buildValorRecurringBody(params, resolveValorSurchargeIndicator(credentials.epi)),
  }
  const response = await postWithBodyCredentials(
    '/?addSub',
    body,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toRecurringResult(response.status, response.body)
}

export async function updateRecurringSubscription(
  credentials: ValorCredentials,
  subscriptionId: string,
  params: ValorRecurringParams,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorRecurringResult> {
  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const recurring = buildValorRecurringBody(
    params,
    resolveValorSurchargeIndicator(credentials.epi),
  )
  delete recurring.surchargeAmount
  delete recurring.retry_count
  const body = {
    ...recurring,
    txn_type: 'updateSubscription',
    subscription_id: subscriptionId,
    custom_fee: '0.00',
  }

  const response = await postWithBodyCredentials(
    '/?updateSub',
    body,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toRecurringResult(response.status, response.body)
}

export type ValorRecurringLifecycleAction = 'activate' | 'deactivate' | 'delete'

const VALOR_RECURRING_LIFECYCLE = {
  activate: { path: '/?activateSub', txnType: 'activateSubscription' },
  deactivate: { path: '/?de-Activate', txnType: 'deactivateSubscription' },
  delete: { path: '/?deleteSub', txnType: 'deleteSubscription' },
} as const

export async function changeRecurringSubscriptionLifecycle(
  credentials: ValorCredentials,
  subscriptionId: string,
  action: ValorRecurringLifecycleAction,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorRecurringResult> {
  const normalizedSubscriptionId = subscriptionId.trim()
  if (!normalizedSubscriptionId) throw new Error('Valor subscription id is required')

  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const contract = VALOR_RECURRING_LIFECYCLE[action]
  const response = await postWithBodyCredentials(
    contract.path,
    {
      txn_type: contract.txnType,
      subscription_id: normalizedSubscriptionId,
    },
    credentials,
    endpoints,
    options.timeoutMs,
  )
  const result = toRecurringResult(response.status, response.body)
  return {
    ...result,
    subscriptionId: result.subscriptionId || normalizedSubscriptionId,
  }
}

export function activateRecurringSubscription(
  credentials: ValorCredentials,
  subscriptionId: string,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
) {
  return changeRecurringSubscriptionLifecycle(credentials, subscriptionId, 'activate', options)
}

export function deactivateRecurringSubscription(
  credentials: ValorCredentials,
  subscriptionId: string,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
) {
  return changeRecurringSubscriptionLifecycle(credentials, subscriptionId, 'deactivate', options)
}

export function deleteRecurringSubscription(
  credentials: ValorCredentials,
  subscriptionId: string,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
) {
  return changeRecurringSubscriptionLifecycle(credentials, subscriptionId, 'delete', options)
}

// ---------------------------------------------------------------------------
// Refund / void
// ---------------------------------------------------------------------------

export interface ValorRefundParams {
  transactionId: string
  amountMinor: number
  authCode?: string
  rrn?: string
  invoiceNumber?: string
}

export interface ValorVoidParams {
  transactionId: string
  amountMinor?: number
}

export interface ValorReversalRequestBody {
  appid: string
  appkey: string
  epi: string
  txn_type: 'refund' | 'void'
  ref_txn_id: string
  amount?: string
  sale_refund?: string
  surchargeIndicator?: string
  surchargeindicator?: string
  auth_code?: string
  rrn?: string
  invoicenumber?: string
}

function assertReversalAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError(
      `Valor reversal amount must be an integer in minor units, received ${amountMinor}`,
    )
  }
  if (amountMinor <= 0) {
    throw new RangeError('Valor will not process a zero- or negative-amount reversal')
  }
  if (amountMinor > VALOR_MAX_AMOUNT_MINOR) {
    throw new RangeError(
      `Refund exceeds Valor's $99,999.99 per-transaction cap (received ${formatMinorUnits(amountMinor)})`,
    )
  }
}

/** Pure builder kept in parity with lib/payments/valor/refundApi.ts. */
export function buildRefundRequestBody(
  credentials: ValorCredentials,
  params: ValorRefundParams,
  surchargeIndicator: ValorSurchargeIndicator = '0',
): ValorReversalRequestBody {
  assertReversalAmount(params.amountMinor)

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: 'refund',
    amount: formatMinorUnits(params.amountMinor),
    ref_txn_id: params.transactionId,
    sale_refund: '1',
    surchargeIndicator,
    ...(params.authCode ? { auth_code: params.authCode } : {}),
    ...(params.rrn ? { rrn: params.rrn } : {}),
    ...(params.invoiceNumber ? { invoicenumber: params.invoiceNumber } : {}),
  }
}

/** Pure builder kept in parity with lib/payments/valor/refundApi.ts. */
export function buildVoidRequestBody(
  credentials: ValorCredentials,
  params: ValorVoidParams,
  surchargeIndicator: ValorSurchargeIndicator = '0',
): ValorReversalRequestBody {
  if (params.amountMinor !== undefined) assertReversalAmount(params.amountMinor)

  return {
    appid: credentials.appId,
    appkey: credentials.appKey,
    epi: credentials.epi,
    txn_type: 'void',
    ref_txn_id: params.transactionId,
    surchargeindicator: surchargeIndicator,
    ...(params.amountMinor !== undefined
      ? { amount: formatMinorUnits(params.amountMinor) }
      : {}),
  }
}

export type ValorReversalOutcome = 'approved' | 'declined' | 'error'

export interface ValorReversalResult {
  success: boolean
  outcome: ValorReversalOutcome
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

export function toReversalResult(
  status: number,
  body: JsonRecord,
): ValorReversalResult {
  const approved = isValorSuccess(body)
  const transportFailed = status >= 500 || status === 0

  return {
    success: approved,
    outcome: approved ? 'approved' : transportFailed ? 'error' : 'declined',
    status,
    details: {
      transactionId: firstString(body, ['txn_id', 'txnid', 'transaction_id']),
      authCode: firstString(body, ['approval_code', 'auth_code']),
      responseCode: firstString(body, ['error_code']),
      responseText:
        firstString(body, ['response_text', 'msg', 'error_message']) ||
        extractValorError(body) ||
        (transportFailed
          ? 'The reversal could not be completed right now. Please try again.'
          : 'The reversal was not accepted. Please review and try again.'),
      rrn: firstString(body, ['rrn']),
    },
    body,
  }
}

export async function refundSale(
  credentials: ValorCredentials,
  params: ValorRefundParams,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorReversalResult> {
  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const body = buildRefundRequestBody(
    credentials,
    params,
    resolveValorSurchargeIndicator(credentials.epi),
  )
  const { status, body: responseBody } = await postWithBodyCredentials(
    '/?refund',
    body as unknown as JsonRecord,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toReversalResult(status, responseBody)
}

export async function voidSale(
  credentials: ValorCredentials,
  params: ValorVoidParams,
  options: { endpoints?: ValorEndpoints; timeoutMs?: number } = {},
): Promise<ValorReversalResult> {
  const endpoints = options.endpoints ?? resolveValorEndpoints()
  const body = buildVoidRequestBody(
    credentials,
    params,
    resolveValorSurchargeIndicator(credentials.epi),
  )
  const { status, body: responseBody } = await postWithBodyCredentials(
    '/?void',
    body as unknown as JsonRecord,
    credentials,
    endpoints,
    options.timeoutMs,
  )
  return toReversalResult(status, responseBody)
}
