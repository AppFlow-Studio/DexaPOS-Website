// ============================================================================
// ipospays.ts
// ============================================================================
// iPOS Pays (Dejavoo) API client for payment processing.
// Handles authentication, hosted payment page creation, and card token charges.
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const IPOS_AUTH_URL = 'https://auth.ipospays.tech/v1/authenticate-token'
const IPOS_PAYMENT_URL = 'https://payment.ipospays.tech/api/v1/external-payment-transaction'
const IPOS_TRANSACT_URL = 'https://payment.ipospays.tech/api/v3/iposTransact'

// Simple in-memory token cache (edge function instances are short-lived,
// but this avoids re-authenticating on rapid sequential calls)
let cachedToken: { token: string; expiresAt: number } | null = null

export interface IPOSCredentials {
  token: string
  apiKey: string
  secretKey: string
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

export async function authenticateIPOS(
  apiKey: string,
  secretKey: string
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  // Check cache (refresh after 23 hours to be safe; token valid 24h)
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { success: true, token: cachedToken.token }
  }

  try {
    const response = await fetch(IPOS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': apiKey,
        'secretKey': secretKey,
        'scope': 'PaymentTokenization',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[IPOS_AUTH] Authentication failed:', response.status, text)
      return { success: false, error: `iPOS authentication failed: ${response.status}` }
    }

    const data = await response.json()
    const token = data.token || data.access_token || data.jwt

    if (!token) {
      console.error('[IPOS_AUTH] No token in response:', JSON.stringify(data))
      return { success: false, error: 'No token returned from iPOS authentication' }
    }

    // Cache for 23 hours
    cachedToken = {
      token,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    }

    return { success: true, token }
  } catch (err) {
    console.error('[IPOS_AUTH] Network error:', err)
    return { success: false, error: `iPOS authentication network error: ${String(err)}` }
  }
}

// ============================================================================
// HOSTED PAYMENT PAGE (HPP)
// ============================================================================

export interface CreateHPPParams {
  tpn: string
  referenceId: string
  amountCents: number
  customerEmail?: string | null
  returnUrl: string
  failureUrl: string
  cancelUrl: string
  webhookUrl: string
}

export async function createHostedPayment(
  token: string,
  params: CreateHPPParams
): Promise<{ success: true; paymentUrl: string } | { success: false; error: string }> {
  try {
    const body = {
      merchantAuthentication: {
        TPN: params.tpn,
        referenceId: params.referenceId,
      },
      transactionRequest: {
        type: 1, // Sale
        amount: params.amountCents,
      },
      notificationOption: {
        notifyByRedirect: {
          returnUrl: params.returnUrl,
          failureUrl: params.failureUrl,
          cancelUrl: params.cancelUrl,
        },
        notifyByPOST: {
          postUrl: params.webhookUrl,
        },
      },
      preferences: {
        requestCardToken: true,
        eReceipt: true,
        ...(params.customerEmail ? { customerEmail: params.customerEmail } : {}),
      },
    }

    console.log('[IPOS_HPP] Creating hosted payment:', {
      tpn: params.tpn,
      referenceId: params.referenceId,
      amountCents: params.amountCents,
    })

    const response = await fetch(IPOS_PAYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[IPOS_HPP] HPP creation failed:', response.status, JSON.stringify(data))
      return { success: false, error: `HPP creation failed: ${response.status} - ${data.message || 'Unknown error'}` }
    }

    // The payment URL is typically in the `information` or `paymentUrl` field
    const paymentUrl = data.information || data.paymentUrl || data.url
    if (!paymentUrl) {
      console.error('[IPOS_HPP] No payment URL in response:', JSON.stringify(data))
      return { success: false, error: 'No payment URL returned from iPOS' }
    }

    console.log('[IPOS_HPP] Payment URL created successfully')
    return { success: true, paymentUrl }
  } catch (err) {
    console.error('[IPOS_HPP] Network error:', err)
    return { success: false, error: `HPP network error: ${String(err)}` }
  }
}

// ============================================================================
// CARD TOKEN CHARGE (Returning customer with saved card)
// ============================================================================

export interface ChargeCardTokenParams {
  tpn: string
  referenceId: string
  amountCents: number
  cardToken: string
}

export interface ChargeCardTokenSuccess {
  success: true
  transactionId: string
  responseCode: string
  responseMessage: string
  rawResponse: Record<string, unknown>
}

export interface ChargeCardTokenFailure {
  success: false
  error: string
  responseCode?: string
  responseMessage?: string
}

export type ChargeCardTokenResult = ChargeCardTokenSuccess | ChargeCardTokenFailure

export interface IPOSProcessorDetails {
  transactionId: string
  transactionReferenceId: string
  transactionNumber: string
  responseCode: string
  responseMessage: string
  errorResponseCode: string
  errorResponseMessage: string
  authCode: string
  rrn: string
  batchNumber: string
  cardType: string
  cardLastFour: string
  rawPayload: Record<string, unknown>
}

export interface VoidTransactionParams {
  tpn: string
  referenceId: string
  amountCents: number
  rrn: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function getResponsePayload(rawResponse: Record<string, unknown>): Record<string, unknown> {
  const transactPayload = asRecord(rawResponse.iposTransactResponse)
  if (Object.keys(transactPayload).length > 0) return transactPayload

  const hpPayload = asRecord(rawResponse.iposhpresponse)
  if (Object.keys(hpPayload).length > 0) return hpPayload

  return rawResponse
}

export function extractProcessorDetails(rawResponse: Record<string, unknown>): IPOSProcessorDetails {
  const payload = getResponsePayload(rawResponse)

  return {
    transactionId: firstString(payload, ['transactionId', 'TransactionId']),
    transactionReferenceId: firstString(payload, ['transactionReferenceId', 'referenceId', 'merchantReferenceId']),
    transactionNumber: firstString(payload, ['transactionNumber', 'invoiceNumber', 'invoice', 'referenceNumber']),
    responseCode: firstString(payload, ['responseCode', 'ResultCode']),
    responseMessage: firstString(payload, ['responseMessage', 'ResultMessage']),
    errorResponseCode: firstString(payload, ['errResponseCode', 'errorResponseCode']),
    errorResponseMessage: firstString(payload, ['errResponseMessage', 'errorResponseMessage', 'Message']),
    authCode: firstString(payload, ['responseApprovalCode', 'authorizationCode', 'authCode']),
    rrn: firstString(payload, ['rrn', 'RRN']),
    batchNumber: firstString(payload, ['batchNumber', 'BatchNumber']),
    cardType: firstString(payload, ['cardType', 'CardType']),
    cardLastFour: firstString(payload, ['cardLast4Digit', 'cardLastFour', 'cardLast4', 'CardLast4Digit']),
    rawPayload: payload,
  }
}

export interface ChargePaymentTokenParams {
  tpn: string
  referenceId: string
  amountCents: number
  paymentTokenId: string
}

/**
 * Charge using a payment_token_id from the FTD (Freedom to Design) script.
 * Uses iPOS Transact API — same endpoint as card token charges.
 */
export async function chargePaymentToken(
  credentials: IPOSCredentials,
  params: ChargePaymentTokenParams
): Promise<ChargeCardTokenResult> {
  try {
    const body = {
      merchantAuthentication: {
        merchantId: params.tpn,
        transactionReferenceId: params.referenceId,
      },
      transactionRequest: {
        transactionType: 1, // Sale
        amount: params.amountCents,
        paymentTokenId: params.paymentTokenId,
      },
      preferences: {
        eReceipt: false,
      }
    }

    console.log('[IPOS_FTD] Charging payment token:', {
      tpn: params.tpn,
      referenceId: params.referenceId,
      amountCents: params.amountCents,
      paymentTokenId: params.paymentTokenId,
    })

    const response = await fetch(IPOS_TRANSACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': credentials.token,
        'apiKey': credentials.apiKey,
        'secretKey': credentials.secretKey,
        'scope': 'PaymentTokenization',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    console.log('[IPOS_FTD] Response:', data)

    const details = extractProcessorDetails(asRecord(data))
    const responseCode = details.responseCode
    const responseMessage = details.responseMessage
    const transactionId = details.transactionId

    if (responseCode === '200' || responseCode === '00' || responseCode === '0') {
      console.log('[IPOS_FTD] Charge successful:', { transactionId, responseCode })
      return {
        success: true,
        transactionId,
        responseCode,
        responseMessage,
        rawResponse: asRecord(data),
      }
    }

    const declineMessage =
      details.errorResponseMessage ||
      responseMessage ||
      'Card was not approved'

    console.error('[IPOS_FTD] Charge declined:', {
      responseCode,
      responseMessage,
      errorResponseCode: details.errorResponseCode,
      errorResponseMessage: details.errorResponseMessage,
    })
    return {
      success: false,
      error: `Payment declined: ${declineMessage}`,
      responseCode: details.errorResponseCode || responseCode,
      responseMessage: declineMessage,
    }
  } catch (err) {
    console.error('[IPOS_FTD] Network error:', err)
    return { success: false, error: `Card charge network error: ${String(err)}` }
  }
}

export async function chargeCardToken(
  credentials: IPOSCredentials,
  params: ChargeCardTokenParams
): Promise<ChargeCardTokenResult> {
  try {
    const body = {
      merchantAuthentication: {
        merchantId: params.tpn,
        transactionReferenceId: params.referenceId,
      },
      transactionRequest: {
        transactionType: 1, // Sale
        amount: params.amountCents,
        cardToken: params.cardToken,
        applySteamSettingTipFeeTax: false,
      },
      preferences: {
        eReceipt: false,
      }
    }

    console.log('[IPOS_TOKEN] Charging card token:', {
      tpn: params.tpn,
      referenceId: params.referenceId,
      amountCents: params.amountCents,
      cardToken: params.cardToken,
    })

    const response = await fetch(IPOS_TRANSACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': credentials.token,
        'apiKey': credentials.apiKey,
        'secretKey': credentials.secretKey,
        'scope': 'PaymentTokenization',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    const details = extractProcessorDetails(asRecord(data))
    const responseCode = details.responseCode
    const responseMessage = details.responseMessage
    const transactionId = details.transactionId

    // iPOS Pays uses "200" as success response code (not HTTP status)
    if (responseCode === '200' || responseCode === '00' || responseCode === '0') {
      console.log('[IPOS_TOKEN] Charge successful:', { transactionId, responseCode })
      return {
        success: true,
        transactionId,
        responseCode,
        responseMessage,
        rawResponse: asRecord(data),
      }
    }

    const declineMessage =
      details.errorResponseMessage ||
      responseMessage ||
      'Card was not approved'

    console.error('[IPOS_TOKEN] Charge declined:', {
      responseCode,
      responseMessage,
      errorResponseCode: details.errorResponseCode,
      errorResponseMessage: details.errorResponseMessage,
    })
    return {
      success: false,
      error: `Payment declined: ${declineMessage}`,
      responseCode: details.errorResponseCode || responseCode,
      responseMessage: declineMessage,
    }
  } catch (err) {
    console.error('[IPOS_TOKEN] Network error:', err)
    return { success: false, error: `Card charge network error: ${String(err)}` }
  }
}

export async function voidTransaction(
  credentials: IPOSCredentials,
  params: VoidTransactionParams
): Promise<ChargeCardTokenResult> {
  try {
    const body = {
      merchantAuthentication: {
        merchantId: params.tpn,
        transactionReferenceId: params.referenceId,
      },
      transactionRequest: {
        transactionType: 2, // Void
        rrn: params.rrn,
        amount: params.amountCents,
      },
    }

    console.log('[IPOS_VOID] Voiding transaction:', {
      tpn: params.tpn,
      referenceId: params.referenceId,
      rrn: params.rrn,
      amountCents: params.amountCents,
    })

    const response = await fetch(IPOS_TRANSACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': credentials.token,
        'apiKey': credentials.apiKey,
        'secretKey': credentials.secretKey,
        'scope': 'PaymentTokenization',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    const details = extractProcessorDetails(asRecord(data))

    if (details.responseCode === '200' || details.responseCode === '00' || details.responseCode === '0') {
      console.log('[IPOS_VOID] Void successful:', {
        transactionId: details.transactionId,
        rrn: details.rrn,
      })
      return {
        success: true,
        transactionId: details.transactionId,
        responseCode: details.responseCode,
        responseMessage: details.responseMessage,
        rawResponse: asRecord(data),
      }
    }

    console.error('[IPOS_VOID] Void declined:', {
      responseCode: details.responseCode,
      responseMessage: details.responseMessage,
      rawResponse: data,
    })
    return {
      success: false,
      error: `Void failed: ${details.responseMessage || 'Processor declined the reversal'}`,
      responseCode: details.responseCode,
      responseMessage: details.responseMessage,
    }
  } catch (err) {
    console.error('[IPOS_VOID] Network error:', err)
    return { success: false, error: `Void network error: ${String(err)}` }
  }
}
