const NMI_API_BASE_URL =
  (Deno.env.get('NMI_API_BASE_URL') ?? 'https://secure.nmi.com').replace(/\/+$/, '')

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function firstString(source: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function firstNumber(source: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

export type NmiRequestConfig = {
  apiKey: string
  timeoutMs?: number
}

export type NmiTransactionDetails = {
  id: string
  response: string
  responseCode: string
  responseText: string
  authCode: string
  transactionId: string
  transactionType: string
  referenceNumber: string
  orderId: string
  condition: string
  gatewayFee: number | null
  raw: JsonRecord
}

export type NmiVaultCustomerDetails = {
  customerVaultId: string
  initialTransactionId: string
  raw: JsonRecord
}

function parseTransactionDetails(raw: JsonRecord): NmiTransactionDetails {
  return {
    id: firstString(raw, ['id', 'transaction_id', 'transactionid']),
    response: firstString(raw, ['response']),
    responseCode: firstString(raw, ['response_code', 'responseCode', 'responsecode']),
    responseText: firstString(raw, ['response_text', 'responseText', 'responsetext', 'message']),
    authCode: firstString(raw, ['authcode', 'authorization_code', 'authorizationCode']),
    transactionId: firstString(raw, ['transactionid', 'transaction_id', 'id']),
    transactionType: firstString(raw, ['type', 'transaction_type', 'transactionType']),
    referenceNumber: firstString(raw, ['orderid', 'order_id', 'merchant_defined_field_1', 'customer_receipt']),
    orderId: firstString(raw, ['orderid', 'order_id']),
    condition: firstString(raw, ['condition', 'status']),
    gatewayFee: firstNumber(raw, ['fee_amount', 'gateway_fee']),
    raw,
  }
}

function isApproved(details: NmiTransactionDetails): boolean {
  return details.response === '1' || details.responseCode === '100'
}

async function callNmi(
  path: string,
  init: RequestInit,
  config: NmiRequestConfig,
): Promise<{
  ok: boolean
  status: number
  body: JsonRecord
  text: string
  details: NmiTransactionDetails
}> {
  const response = await fetch(`${NMI_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.apiKey,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(config.timeoutMs ?? 15000),
  })

  const text = await response.text()
  let body: JsonRecord = {}
  try {
    body = text ? asRecord(JSON.parse(text)) : {}
  } catch {
    body = {}
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
    details: parseTransactionDetails(body),
  }
}

async function callNmiClassic(
  form: Record<string, string>,
  config: NmiRequestConfig,
): Promise<{
  ok: boolean
  status: number
  body: JsonRecord
  text: string
  details: NmiTransactionDetails
}> {
  const response = await fetch(`${NMI_API_BASE_URL}/api/transact.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      security_key: config.apiKey,
      ...form,
    }).toString(),
    signal: AbortSignal.timeout(config.timeoutMs ?? 15000),
  })

  const text = await response.text()
  const body = Object.fromEntries(new URLSearchParams(text)) as JsonRecord

  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
    details: parseTransactionDetails(body),
  }
}

export async function createSale(
  config: NmiRequestConfig,
  params: {
    amount: number
    currency?: string
    paymentToken: string
    industry?: 'retail' | 'restaurant' | 'ecommerce' | 'moto' | 'lodging'
  },
) {
  const result = await callNmi(
    '/api/v5/payments/sale',
    {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency ?? 'USD',
        industry: params.industry ?? 'ecommerce',
        payment_details: {
          payment_token: params.paymentToken,
        },
      }),
    },
    config,
  )

  return {
    success: result.ok && isApproved(result.details),
    ...result,
  }
}

/** Values accepted by NMI's v5 void endpoint. */
export const NMI_VOID_REASONS = [
  'fraud',
  'user_cancel',
  'icc_rejected',
  'icc_card_removed',
  'icc_no_confirmation',
  'pos_timeout',
] as const

export type NmiVoidReason = typeof NMI_VOID_REASONS[number]

function isReversalApproved(result: {
  ok: boolean
  details: NmiTransactionDetails
}): boolean {
  if (!result.ok) return false
  if (isApproved(result.details)) return true

  const condition = (result.details.condition ?? '').toLowerCase()
  return ['canceled', 'cancelled', 'voided', 'refunded', 'complete'].includes(condition)
}

export async function voidSale(
  config: NmiRequestConfig,
  transactionId: string,
  voidReason?: NmiVoidReason,
) {
  const isValidReason =
    !!voidReason && (NMI_VOID_REASONS as readonly string[]).includes(voidReason)
  const result = await callNmi(
    `/api/v5/payments/${transactionId}/void`,
    {
      method: 'POST',
      body: JSON.stringify(isValidReason ? { void_reason: voidReason } : {}),
    },
    config,
  )

  return {
    success: isReversalApproved(result),
    ...result,
  }
}

export async function refundSale(
  config: NmiRequestConfig,
  transactionId: string,
  params: {
    amount?: number
    payment?: 'creditcard' | 'check'
  } = {},
) {
  const payload: JsonRecord = {}
  if (params.amount !== undefined) payload.amount = params.amount
  if (params.payment) payload.payment = params.payment

  const result = await callNmi(
    `/api/v5/payments/${transactionId}/refund`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    config,
  )

  return {
    success: isReversalApproved(result),
    ...result,
  }
}

export async function getTransaction(
  config: NmiRequestConfig,
  transactionId: string,
) {
  const result = await callNmi(
    `/api/v5/payments/${transactionId}`,
    {
      method: 'GET',
    },
    config,
  )

  return {
    success: result.ok,
    ...result,
  }
}

export function getNmiBaseUrl() {
  return NMI_API_BASE_URL
}

function parseVaultCustomerDetails(raw: JsonRecord): NmiVaultCustomerDetails {
  const customerRecord = asRecord(raw.customer)
  const customerVaultId =
    firstString(customerRecord, ['id', 'customer_vault_id']) ||
    firstString(raw, ['customer_vault_id', 'customer_vaultid', 'customer_id'])

  const initialTransactionId =
    firstString(raw, ['transaction_id', 'transactionid']) ||
    (customerVaultId && firstString(raw, ['id']) === customerVaultId
      ? ''
      : firstString(raw, ['id']))

  return {
    customerVaultId: customerVaultId || firstString(raw, ['id']),
    initialTransactionId,
    raw,
  }
}

export async function createVaultCustomer(
  config: NmiRequestConfig,
  params: {
    paymentToken: string
    firstName?: string
    lastName?: string
    email?: string
    address1?: string
    address2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    phone?: string
  },
) {
  const result = await callNmi(
    '/api/v5/customers',
    {
      method: 'POST',
      body: JSON.stringify({
        billing: {
          payment_details: {
            payment_token: params.paymentToken,
          },
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          address1: params.address1,
          address2: params.address2,
          city: params.city,
          state: params.state,
          zip: params.zip,
          country: params.country ?? 'US',
          phone: params.phone,
        },
      }),
    },
    config,
  )

  const needsClassicFallback =
    !result.ok &&
    (result.status === 400 || result.status === 422) &&
    (
      result.details.responseText === 'The provided data is invalid.' ||
      result.text.includes('E_INVALID_SUBMISSION')
    )

  const finalResult = needsClassicFallback
    ? await callNmiClassic(
        {
          customer_vault: 'add_customer',
          payment_token: params.paymentToken,
          payment: 'creditcard',
          first_name: params.firstName ?? '',
          last_name: params.lastName ?? '',
          email: params.email ?? '',
          address1: params.address1 ?? '',
          address2: params.address2 ?? '',
          city: params.city ?? '',
          state: params.state ?? '',
          zip: params.zip ?? '',
          country: params.country ?? 'US',
          phone: params.phone ?? '',
        },
        config,
      )
    : result

  const vault = parseVaultCustomerDetails(finalResult.body)

  return {
    success:
      (finalResult.ok || finalResult.details.response === '1' || finalResult.details.responseCode === '100') &&
      Boolean(vault.customerVaultId),
    vault,
    ...finalResult,
  }
}

export async function createVaultSale(
  config: NmiRequestConfig,
  params: {
    amount: number
    customerVaultId: string
    currency?: string
    industry?: 'retail' | 'restaurant' | 'ecommerce' | 'moto' | 'lodging'
    initiatedBy?: 'customer' | 'merchant'
    initialTransactionId?: string
  },
) {
  const result = await callNmi(
    '/api/v5/payments/sale',
    {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency ?? 'USD',
        industry: params.industry ?? 'ecommerce',
        payment_details: {
          customer_vault_id: params.customerVaultId,
        },
      }),
    },
    config,
  )

  const needsClassicFallback =
    !result.ok &&
    (result.status === 400 || result.status === 422) &&
    (
      result.details.responseText === 'The provided data is invalid.' ||
      result.text.includes('E_INVALID_SUBMISSION')
    )

  const finalResult = needsClassicFallback
    ? await callNmiClassic(
        {
          type: 'sale',
          payment: 'creditcard',
          amount: String(params.amount.toFixed(2)),
          customer_vault_id: params.customerVaultId,
        },
        config,
      )
    : result

  return {
    success:
      (finalResult.ok || finalResult.details.response === '1' || finalResult.details.responseCode === '100') &&
      isApproved(finalResult.details),
    ...finalResult,
  }
}
