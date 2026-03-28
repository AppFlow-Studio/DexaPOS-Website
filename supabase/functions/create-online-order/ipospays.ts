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

    const responseCode = String(data.responseCode || data.ResultCode || '')
    const responseMessage = data.responseMessage || data.ResultMessage || ''
    const transactionId = data.transactionId || data.TransactionId || ''

    if (responseCode === '200' || responseCode === '00' || responseCode === '0') {
      console.log('[IPOS_FTD] Charge successful:', { transactionId, responseCode })
      return {
        success: true,
        transactionId,
        responseCode,
        responseMessage,
        rawResponse: data,
      }
    }

    console.error('[IPOS_FTD] Charge declined:', { responseCode, responseMessage })
    return {
      success: false,
      error: `Payment declined: ${responseMessage || 'Card was not approved'}`,
      responseCode,
      responseMessage,
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

    const responseCode = String(data.responseCode || data.ResultCode || '')
    const responseMessage = data.responseMessage || data.ResultMessage || ''
    const transactionId = data.transactionId || data.TransactionId || ''

    // iPOS Pays uses "200" as success response code (not HTTP status)
    if (responseCode === '200' || responseCode === '00' || responseCode === '0') {
      console.log('[IPOS_TOKEN] Charge successful:', { transactionId, responseCode })
      return {
        success: true,
        transactionId,
        responseCode,
        responseMessage,
        rawResponse: data,
      }
    }

    console.error('[IPOS_TOKEN] Charge declined:', { responseCode, responseMessage })
    return {
      success: false,
      error: `Payment declined: ${responseMessage || 'Card was not approved'}`,
      responseCode,
      responseMessage,
    }
  } catch (err) {
    console.error('[IPOS_TOKEN] Network error:', err)
    return { success: false, error: `Card charge network error: ${String(err)}` }
  }
}
