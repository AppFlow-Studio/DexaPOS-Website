﻿// ============================================================================
// create-online-order Edge Function
// ============================================================================
// Validates stock, hours, delivery zone, recalculates prices server-side,
// creates a payment intent, and processes payment through NMI using a
// tokenized storefront payment token. On successful card charge, calls
// process_online_order RPC to create the order immediately.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js'
import type {
  OnlineOrderRpcParams,
  OnlineOrderRpcResult,
  OnlineOrderItem,
} from './online-order-types.ts'
import {
  buildDeliveryAddress,
  sanitizeItems,
} from './online-order-types.ts'
import {
  validateStock,
  validateOperatingHours,
  validateDeliveryZone,
  validateMinimumOrder,
} from './validators.ts'
import {
  createSale,
} from '../_shared/nmi.ts'
import { sendOnlineOrderPaymentEmail } from '../_shared/payment-emails.ts'
// ============================================================================
// ENV
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// ============================================================================
// REQUEST TYPES
// ============================================================================

interface CreateOnlineOrderRequest {
  session_token?: string           // optional — authenticated customers
  store_config_id?: string         // required for guest checkout (no session)
  items: Array<{
    id: string           // menu_item_id
    name: string
    price: number        // effective unit price shown to customer (full cascade)
    quantity: number
    notes?: string
    menu_id?: string     // optional — enables L5 server-side price verification
    category_id?: string // optional — enables L3/L4/L5 server-side price verification
    modifiers?: Array<{
      id: string | null
      name: string
      price: number
      quantity: number
      groupName: string | null
    }>
  }>
  order_type: 'pickup' | 'delivery'
  delivery_address?: {
    street: string
    unit?: string
    city: string
    state: string
    zip: string
    lat?: number
    lng?: number
    delivery_notes?: string
  } | null
  requested_time?: string | null  // ISO 8601 or null for ASAP
  tip: number                     // dollars
  special_instructions?: string
  card_token?: string             // for returning customers with saved cards
  payment_token?: string          // NMI payment token from the embedded payment component
  payment_token_id?: string       // legacy alias accepted during NMI cutover
  pay_cash_in_store?: boolean
  payment_card_type?: string | null
  payment_card_last_four?: string | null
  // Guest checkout contact info (used when session is not authenticated)
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  // Client-supplied idempotency key. Header `Idempotency-Key` takes precedence over this.
  // Reused across retries of the same logical order so the server dedupes.
  transaction_reference_id?: string
}

interface MenuItemPriceRow {
  id: string
  price: number | null
  delivery_price: number | null
}

interface LocationItemOverrideRow {
  menu_item_id: string
  custom_price: number | null
}

interface StorefrontPaymentConfig {
  device_id: string
  provider: string
  environment: string
  provider_public_key: string | null
  supports_apple_pay: boolean
  supports_google_pay: boolean
  supports_customer_vault: boolean
}

interface NmiDeviceCredential {
  merchant_id: string
  location_id: string
  device_id: string
  environment: string
  provider_merchant_id: string | null
  provider_gateway_id: string | null
  provider_public_key: string | null
  decrypted_security_key: string
}

interface StorefrontPaymentDeviceAccessLog {
  device_id: string
  provider: string
  environment: string
}

interface MerchantEmailRow {
  name: string | null
  owner_email: string | null
}

interface LocationEmailRow {
  name: string | null
}

// ============================================================================
// CORS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function successResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
}

function errorResponse(
  error: string,
  code: string,
  status: number,
  details?: unknown
): Response {
  console.error(`[ERROR] ${code}: ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, code, details }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
}

// ============================================================================
// LOGGING
// ============================================================================

function logEvent(tag: string, message: string, data?: unknown): void {
  console.log(`[${new Date().toISOString()}] [${tag}] ${message}`, data ? JSON.stringify(data) : '')
}

function logError(tag: string, message: string, error: unknown): void {
  console.error(`[${new Date().toISOString()}] [${tag}] ERROR: ${message}`, error)
}

// ============================================================================
// HELPERS
// ============================================================================

/** Convert dollars to cents (rounded to avoid floating point issues) */
function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Convert cents to dollars */
function toDollars(cents: number): number {
  return cents / 100
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ---- Step 1: Parse & basic validation ----
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'method_not_allowed', 405)
  }

  let body: CreateOnlineOrderRequest
  try {
    body = await req.json() as CreateOnlineOrderRequest
  } catch {
    return errorResponse('Invalid JSON body', 'invalid_request', 400)
  }

  if (!body.session_token && !body.store_config_id) {
    return errorResponse('session_token or store_config_id is required', 'invalid_request', 400)
  }
  if (!body.items || body.items.length === 0) {
    return errorResponse('Cart is empty', 'empty_cart', 400)
  }
  if (!body.order_type || !['pickup', 'delivery'].includes(body.order_type)) {
    return errorResponse('order_type must be "pickup" or "delivery"', 'invalid_request', 400)
  }

  logEvent('HANDLER', 'Received create-online-order request', {
    itemCount: body.items.length,
    orderType: body.order_type,
    hasCardToken: !!body.card_token,
    hasNmiPaymentToken: !!body.payment_token,
    hasPaymentToken: !!body.payment_token_id,
    hasDeliveryAddress: !!body.delivery_address,
  })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Step 1.5: Idempotency short-circuit ----
  // If the client supplied a key (header preferred, body field as fallback) and we already
  // created an order for that key, return the existing order immediately. This prevents
  // duplicate orders from network retries, customer "Place Order" double-clicks, and POS
  // tablet offline-queue replays. Backed by the partial unique index on
  // online_orders(provider, provider_order_id) — see migration 20260425010000.
  const clientIdempotencyKey =
    req.headers.get('idempotency-key') ?? body.transaction_reference_id ?? null

  if (clientIdempotencyKey) {
    const { data: existing } = await supabase
      .from('online_orders')
      .select('order_id')
      .eq('provider', 'website')
      .eq('provider_order_id', clientIdempotencyKey)
      .maybeSingle()

    if (existing?.order_id) {
      const { data: ord } = await supabase
        .from('orders')
        .select('order_number, display_number')
        .eq('id', existing.order_id)
        .maybeSingle()

      logEvent('IDEMPOTENT', 'Returning existing order for replayed request', {
        key: clientIdempotencyKey,
        orderId: existing.order_id,
      })

      return successResponse({
        requires_redirect: false,
        order_id: existing.order_id,
        order_number: ord?.order_number ?? null,
        display_number: ord?.display_number ?? null,
        estimated_time: null,
        auto_accepted: false,
        idempotent: true,
      })
    }
  }

  // ---- Step 2: Load session (if authenticated) + store config ----
  let session: any = null

  if (body.session_token) {
    const { data: sessionData, error: sessionError } = await supabase
      .from('online_order_sessions')
      .select(`
        *,
        online_store_config!inner(
          id, location_id, merchant_id, is_active,
          operating_hours, accepts_pickup, accepts_delivery,
          delivery_pricing_enabled,
          min_order, estimated_prep_minutes,
          delivery_radius_miles, delivery_fee,
          free_delivery_threshold, address,
          slug, auto_accept_orders
        )
      `)
      .eq('session_token', body.session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!sessionError && sessionData) {
      session = sessionData
    }
  }

  // Load store config: from session if available, otherwise from store_config_id
  let storeConfig: any
  if (session) {
    storeConfig = session.online_store_config
  } else if (body.store_config_id) {
    const { data: configData, error: configError } = await supabase
      .from('online_store_config')
      .select(`
        id, location_id, merchant_id, is_active,
        operating_hours, accepts_pickup, accepts_delivery,
        delivery_pricing_enabled,
        min_order, estimated_prep_minutes,
        delivery_radius_miles, delivery_fee,
        free_delivery_threshold, address,
        slug, auto_accept_orders
      `)
      .eq('id', body.store_config_id)
      .single()

    if (configError || !configData) {
      return errorResponse('Store not found.', 'store_not_found', 404)
    }
    storeConfig = configData
  } else {
    return errorResponse('Unable to identify store.', 'invalid_request', 400)
  }

  if (storeConfig.is_active === false) {
    return errorResponse('Store not found.', 'store_not_found', 404)
  }

  const locationId: string = storeConfig.location_id
  const merchantId: string = storeConfig.merchant_id
  const storeConfigId: string = storeConfig.id
  const estimatedMinutes: number = storeConfig.estimated_prep_minutes ?? 20
  // Auto-create guest session if none exists (guest checkout)
  if (!session && storeConfig) {
    const guestSessionToken = `guest-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min

    const { data: guestSession, error: guestError } = await supabase
      .from('online_order_sessions')
      .insert({
        store_config_id: storeConfigId,
        session_token: guestSessionToken,
        is_authenticated: false,
        customer_name: body.customer_name || 'Guest',
        customer_phone: body.customer_phone || null,
        customer_email: body.customer_email || null,
        order_type: body.order_type,
        delivery_address: body.delivery_address || null,
        cart_data: body.items,
        expires_at: expiresAt,
      })
      .select('*')
      .single()

    if (!guestError && guestSession) {
      session = guestSession
      logEvent('SESSION', 'Created guest session', { sessionId: guestSession.id })
    } else {
      console.error('[SESSION] Failed to create guest session:', guestError)
    }
  }

  logEvent('SESSION', 'Request loaded', {
    sessionId: session?.id ?? 'guest',
    locationId,
    merchantId,
    isGuest: !session,
  })

  // ---- Step 3: Validate stock ----
  const stockResult = await validateStock(supabase, locationId, body.items.map((i) => ({
    id: i.id,
    quantity: i.quantity,
    name: i.name,
  })))

  if (!stockResult.valid) {
    logEvent('STOCK', 'Items unavailable', stockResult.unavailableItems)
    return errorResponse(
      'Some items are no longer available',
      'items_unavailable',
      422,
      { unavailable_items: stockResult.unavailableItems }
    )
  }

  // ---- Step 4: Validate operating hours ----
  const hoursResult = validateOperatingHours(
    storeConfig.operating_hours,
    body.requested_time
  )

  if (!hoursResult.valid) {
    logEvent('HOURS', 'Store closed', { reason: hoursResult.reason })
    return errorResponse(
      hoursResult.reason,
      'store_closed',
      422,
      { next_open: hoursResult.nextOpen }
    )
  }

  // ---- Step 5: Validate delivery zone (if delivery) ----
  let deliveryFeeCents = 0
  let deliveryMinOrderCents = 0
  let deliveryFreeThresholdCents: number | null = null

  if (body.order_type === 'delivery') {
    if (!storeConfig.accepts_delivery) {
      return errorResponse(
        'This store does not accept delivery orders',
        'delivery_not_available',
        422
      )
    }

    if (!body.delivery_address) {
      return errorResponse(
        'Delivery address is required for delivery orders',
        'invalid_request',
        400
      )
    }

    const zoneResult = await validateDeliveryZone(
      supabase,
      storeConfigId,
      storeConfig.address,
      body.delivery_address,
      storeConfig.delivery_radius_miles,
      Math.round((storeConfig.delivery_fee ?? 0) * 100),
      Math.round((storeConfig.min_order ?? 0) * 100),
      storeConfig.free_delivery_threshold != null
        ? Math.round(storeConfig.free_delivery_threshold * 100)
        : null
    )

    if (!zoneResult.valid) {
      logEvent('DELIVERY', 'Outside delivery zone', { reason: zoneResult.reason })
      return errorResponse(
        zoneResult.reason,
        'outside_delivery_zone',
        422
      )
    }

    deliveryFeeCents = zoneResult.deliveryFeeCents
    deliveryMinOrderCents = zoneResult.minOrderCents
    deliveryFreeThresholdCents = zoneResult.freeDeliveryThresholdCents
  } else {
    // Pickup — check accepts_pickup
    if (!storeConfig.accepts_pickup) {
      return errorResponse(
        'This store does not accept pickup orders',
        'pickup_not_available',
        422
      )
    }
  }

  // ---- Step 6: Server-side price recalculation ----
  // Use get_effective_price() — the canonical 5-level cascade (L5>L4>L3>L2>L1).
  // menu_id and category_id are optional; when absent the function falls back to
  // L2>L1, which still correctly applies L2 modifier math (add/percent).
  const effectivePrices = await Promise.all(
    body.items.map(async (cartItem) => {
      const { data } = await supabase.rpc('get_effective_price', {
        p_item_id:     cartItem.id,
        p_location_id: locationId,
        p_menu_id:     cartItem.menu_id     ?? null,
        p_category_id: cartItem.category_id ?? null,
      })
      return { id: cartItem.id, prices: data as { effective_price: number; effective_cash_price: number; effective_delivery_price: number } | null }
    })
  )
  const effectivePriceMap = new Map(effectivePrices.map(({ id, prices }) => [id, prices]))

  // Fetch tax rate — prefer 'standard'/'default', fall back to any active rate
  let { data: taxRate } = await supabase
    .from('tax_rates')
    .select('percentage')
    .eq('location_id', locationId)
    .eq('is_active', true)
    .in('tax_category', ['standard', 'default'])
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!taxRate) {
    // Fallback: any active rate for this location (handles custom category names)
    const { data: fallbackRate } = await supabase
      .from('tax_rates')
      .select('percentage')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    taxRate = fallbackRate
  }

  const taxPercent = taxRate?.percentage ?? 0

  // Recalculate prices from DB values
  let subtotalCents = 0
  const recalculatedItems: Partial<OnlineOrderItem>[] = []

  for (const cartItem of body.items) {
    const serverPrices = effectivePriceMap.get(cartItem.id)

    // Use the canonical DB price from get_effective_price() (full 5-level cascade).
    // Falls back to the cart-submitted price only if the RPC returned nothing
    // (item not found in DB — should not happen in practice).
    //
    // delivery_pricing_enabled (default true) controls whether online orders
    // use the separate delivery price. When false, every online order — pickup
    // or delivery — uses the regular price, matching what the storefront shows.
    const deliveryPricingEnabled = storeConfig.delivery_pricing_enabled !== false
    let unitPrice: number
    if (deliveryPricingEnabled && body.order_type === 'delivery') {
      unitPrice = serverPrices?.effective_delivery_price ?? serverPrices?.effective_price ?? cartItem.price
    } else if (payCashInStore && body.order_type === 'pickup') {
      unitPrice = serverPrices?.effective_cash_price ?? serverPrices?.effective_price ?? cartItem.price
    } else {
      unitPrice = serverPrices?.effective_price ?? cartItem.price
    }

    // Modifier totals (modifiers are trusted from client — they come from our DB originally)
    const modifierTotal = (cartItem.modifiers ?? []).reduce(
      (sum, m) => sum + m.price * m.quantity, 0
    )

    const linePrice = unitPrice + modifierTotal
    const lineTotal = linePrice * cartItem.quantity
    subtotalCents += toCents(lineTotal)

    recalculatedItems.push({
      id: cartItem.id,
      name: cartItem.name,
      note: cartItem.notes ?? null,
      price: linePrice,
      total: lineTotal,
      quantity: cartItem.quantity,
      external_id: cartItem.id,
      modifiers: (cartItem.modifiers ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        quantity: m.quantity,
        group_name: m.groupName,
      })),
    })
  }

  const taxCents = Math.round(subtotalCents * (taxPercent / 100))
  const tipCents = toCents(body.tip ?? 0)

  // Apply free delivery threshold
  if (
    body.order_type === 'delivery' &&
    deliveryFreeThresholdCents !== null &&
    subtotalCents >= deliveryFreeThresholdCents
  ) {
    deliveryFeeCents = 0
  }

  const totalCents = subtotalCents + taxCents + tipCents + deliveryFeeCents

  logEvent('PRICE', 'Server-side price recalculation', {
    subtotalCents,
    taxCents,
    tipCents,
    deliveryFeeCents,
    totalCents,
    taxPercent,
  })

  // ---- Step 7: Validate minimum order ----
  const storeMinOrderCents = Math.round((storeConfig.min_order ?? 0) * 100)
  const effectiveMinOrderCents = body.order_type === 'delivery'
    ? Math.max(deliveryMinOrderCents, storeMinOrderCents)
    : storeMinOrderCents

  const minResult = validateMinimumOrder(subtotalCents, effectiveMinOrderCents)
  if (!minResult.valid) {
    return errorResponse(
      `Minimum order is $${toDollars(minResult.minimumCents).toFixed(2)}. Your subtotal is $${toDollars(minResult.currentCents).toFixed(2)}.`,
      'below_minimum',
      422,
      { minimum_cents: minResult.minimumCents, current_cents: minResult.currentCents }
    )
  }

  // ---- Step 8: Resolve payment path ----
  const payCashInStore = body.pay_cash_in_store === true
  const effectivePaymentToken =
    body.payment_token?.trim() ||
    body.payment_token_id?.trim() ||
    body.card_token?.trim() ||
    null
  let storefrontPaymentConfig: StorefrontPaymentConfig | null = null
  let nmiDeviceCredential: NmiDeviceCredential | null = null

  if (!payCashInStore) {
    const { data: paymentConfigRows, error: paymentConfigError } = await supabase.rpc(
      'get_storefront_payment_config',
      {
        p_location_id: locationId,
      },
    )

    if (paymentConfigError) {
      logError('PAYMENT_CONFIG', 'Failed to resolve storefront payment config', paymentConfigError)
      return errorResponse(
        'Payment configuration is unavailable for this store.',
        'payment_not_configured',
        503,
      )
    }

    storefrontPaymentConfig =
      ((paymentConfigRows as StorefrontPaymentConfig[] | null) ?? []).find(
        (row) => row.provider === 'nmi',
      ) ?? null

    if (!storefrontPaymentConfig?.device_id) {
      logError('PAYMENT', 'No active NMI payment device configured for this store', {
        storeConfigId,
        locationId,
        merchantId,
      })
      return errorResponse(
        'Online payment is not configured for this store. Please contact the store.',
        'payment_not_configured',
        503
      )
    }

    const { data: credentialRows, error: credentialError } = await supabase.rpc(
      'get_nmi_device_credentials',
      {
        p_device_id: storefrontPaymentConfig.device_id,
      },
    )

    if (credentialError) {
      logError('PAYMENT_DEVICE', 'Failed to resolve NMI device credentials', credentialError)
      return errorResponse(
        'Payment configuration is unavailable for this store.',
        'payment_not_configured',
        503,
      )
    }

    nmiDeviceCredential = ((credentialRows as NmiDeviceCredential[] | null) ?? [])[0] ?? null

    if (!nmiDeviceCredential?.decrypted_security_key) {
      logError('PAYMENT', 'No active NMI device secret configured for this store', {
        storeConfigId,
        locationId,
        merchantId,
        paymentDeviceId: storefrontPaymentConfig.device_id,
      })
      return errorResponse(
        'Online payment is not configured for this store. Please contact the store.',
        'payment_not_configured',
        503
      )
    }

    await supabase
      .from('payment_credential_access_log')
      .insert({
        device_id: storefrontPaymentConfig.device_id,
        function_name: 'create-online-order',
        store_config_id: storeConfigId,
        actor_user_id: null,
        metadata: {
          source: 'storefront_order_submit',
          has_legacy_token_field: Boolean(body.payment_token_id),
          order_type: body.order_type,
        },
      })
  }

  if (!payCashInStore && !effectivePaymentToken) {
    return errorResponse(
      'A valid payment token is required for online card payments.',
      'payment_token_required',
      422
    )
  }

  // ---- Step 9: Build frozen order data (RPC params snapshot) ----
  // Idempotency key precedence: client header → client body field → server-generated.
  // Server-generated fallback is UUID-suffixed so two concurrent guest requests in the
  // same millisecond cannot collide on the unique index.
  const sessionPrefix = session?.id ? session.id.slice(0, 8) : 'guest'
  const transactionReferenceId =
    clientIdempotencyKey ?? `dexa-${sessionPrefix}-${crypto.randomUUID()}`

  const deliveryAddr = body.delivery_address
    ? buildDeliveryAddress(
        body.delivery_address.street,
        body.delivery_address.unit,
        body.delivery_address.city,
        body.delivery_address.state,
        body.delivery_address.zip,
        body.delivery_address.delivery_notes
      )
    : null

  // Use session customer info if authenticated, otherwise fall back to guest info from body
  const customerName = session?.customer_name || body.customer_name || 'Guest'
  const customerPhone = session?.customer_phone || body.customer_phone || null
  const customerEmail = session?.customer_email || body.customer_email || null

  const sanitizedRpcItems = sanitizeItems(recalculatedItems)

  const rpcParams: OnlineOrderRpcParams = {
    p_location_id: locationId,
    p_provider: 'website',
    p_provider_order_id: transactionReferenceId,
    p_order_type_raw: body.order_type === 'delivery' ? 'DELIVERY' : 'PICKUP',
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: customerEmail,
    p_subtotal: toDollars(subtotalCents),
    p_tax: toDollars(taxCents),
    p_total: toDollars(totalCents),
    p_gratuity: toDollars(tipCents),
    p_delivery_charge: toDollars(deliveryFeeCents),
    p_items: sanitizedRpcItems,
    p_delivery_address: deliveryAddr,
    p_order_notes: body.special_instructions ?? null,
    p_placed_at: new Date().toISOString(),
    p_ready_by: body.requested_time ?? null,
    p_auto_accept: storeConfig.auto_accept_orders ?? false,
  }

  // ---- Step 10: Charge card payment via NMI ----
  let nmiChargeDetails: {
    transactionId: string
    responseCode: string
    responseMessage: string
    authCode: string
    cardType: string
    cardLastFour: string
    gatewayFee: number | null
    rawResponse: Record<string, unknown>
  } | null = null

  if (!payCashInStore && effectivePaymentToken) {
    logEvent('PAYMENT', 'Charging payment token via NMI', {
      merchantId,
      referenceId: transactionReferenceId,
      totalCents,
    })

    const chargeResult = await createSale(
      { apiKey: nmiDeviceCredential!.decrypted_security_key },
      {
        amount: Number(toDollars(totalCents).toFixed(2)),
        paymentToken: effectivePaymentToken,
        industry: 'ecommerce',
      },
    )

    if (!chargeResult.success) {
      const declineCode = chargeResult.details.responseCode || String(chargeResult.status)
      const declineMessage =
        chargeResult.details.responseText ||
        (chargeResult.status >= 500
          ? 'Payment service is temporarily unavailable. Please try again.'
          : 'Your card was declined. Please try a different card.')

      logError('PAYMENT_CHARGE', 'NMI card charge failed', {
        status: chargeResult.status,
        details: chargeResult.details,
        body: chargeResult.body,
      })
      return errorResponse(
        declineMessage,
        chargeResult.status >= 500 ? 'payment_gateway_error' : 'payment_declined',
        chargeResult.status >= 500 ? 502 : 402,
        { responseCode: declineCode, responseMessage: declineMessage }
      )
    }

    nmiChargeDetails = {
      transactionId: chargeResult.details.transactionId || chargeResult.details.id,
      responseCode: chargeResult.details.responseCode || chargeResult.details.response,
      responseMessage: chargeResult.details.responseText || 'Approved',
      authCode: chargeResult.details.authCode,
      cardType: body.payment_card_type || '',
      cardLastFour: body.payment_card_last_four || '',
      gatewayFee: chargeResult.details.gatewayFee,
      rawResponse: chargeResult.body,
    }

    logEvent('PAYMENT', 'Card charged successfully', {
      transactionId: nmiChargeDetails.transactionId,
      authCode: nmiChargeDetails.authCode,
      responseCode: nmiChargeDetails.responseCode,
    })
  }

  // ---- Step 11: Create order via RPC ----
  if (!session) {
    logEvent('SESSION', 'Proceeding without persisted session row (guest insert failed or skipped)', {
      storeConfigId,
    })
  }

  logEvent('ORDER', 'Creating order via process_online_order RPC', {
    totalCents,
    referenceId: transactionReferenceId,
    payCashInStore,
    sanitizedItemsSample: sanitizedRpcItems.map((it) => ({
      id: it.id,
      qty: it.quantity,
      modQtys: it.modifiers?.map((m) => m.quantity),
    })),
  })

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'process_online_order',
    rpcParams
  )

  if (rpcError) {
    // Race-condition fallback: two concurrent retries with the same client key both
    // missed the Step 1.5 SELECT, both proceeded to insert, the second hit the unique
    // index. Treat as idempotent success — refetch and return the existing order.
    if (rpcError.code === '23505' && clientIdempotencyKey) {
      const { data: existing } = await supabase
        .from('online_orders')
        .select('order_id')
        .eq('provider', 'website')
        .eq('provider_order_id', clientIdempotencyKey)
        .maybeSingle()

      if (existing?.order_id) {
        const { data: ord } = await supabase
          .from('orders')
          .select('order_number, display_number')
          .eq('id', existing.order_id)
          .maybeSingle()

        logEvent('IDEMPOTENT', 'Returning existing order after unique-violation race', {
          key: clientIdempotencyKey,
          orderId: existing.order_id,
        })

        return successResponse({
          requires_redirect: false,
          order_id: existing.order_id,
          order_number: ord?.order_number ?? null,
          display_number: ord?.display_number ?? null,
          estimated_time: null,
          auto_accepted: false,
          idempotent: true,
        })
      }
    }

    logError('RPC', 'process_online_order failed', rpcError)
    return errorResponse(
      'Failed to create order. Please try again.',
      'order_creation_failed',
      500,
      { error: rpcError.message, hint: rpcError.hint, code: rpcError.code }
    )
  }

  const orderResult = rpcResult as OnlineOrderRpcResult

  if (!orderResult.success) {
    logError('RPC', 'Order processing returned failure', orderResult)
    const rpcMsg =
      typeof orderResult === 'object' && orderResult && 'error' in orderResult
        ? String((orderResult as { error?: string }).error)
        : ''
    return errorResponse(
      rpcMsg || 'Failed to place your order. Please try again or contact support.',
      'order_creation_failed',
      500,
      { rpc: orderResult }
    )
  }

  // Update session with order ID
  if (session?.id) {
    await supabase
      .from('online_order_sessions')
      .update({
        order_id: orderResult.order_id,
        cart_data: rpcParams.p_items,
        order_type: body.order_type,
        delivery_address: deliveryAddr,
        requested_time: body.requested_time ?? null,
      })
      .eq('id', session.id)
  }

  // ---- Step 12: Update payment record with real transaction details ----
  const paymentUpdatePayload = payCashInStore
    ? {
        payment_method: 'cash',
        status: 'pending',
        terminal_type: 'none',
        card_type: null,
        card_last_four: null,
        transaction_id: null,
        reference_number: null,
        authorization_code: null,
        auth_code: null,
        rrn: null,
        result_code: null,
        result_message: null,
        batch_number: null,
        approved_at: null,
        captured_at: null,
        processor_name: null,
        payment_device_id: null,
        processor_response: null,
        terminal_response: null,
        dejavoo_response_code: null,
        dejavoo_response_message: null,
        dejavoo_batch_number: null,
        dejavoo_invoice_number: null,
        metadata: {
          source: 'online_order',
          provider: 'cash',
          provider_order_id: transactionReferenceId,
          payment_status_from_source: 'PENDING_CASH_IN_STORE',
          payment_device_id: null,
        },
      }
    : {
        payment_method: 'card',
        status: 'captured',
        terminal_type: 'none',
        card_type: nmiChargeDetails?.cardType || body.payment_card_type || null,
        card_last_four: nmiChargeDetails?.cardLastFour || body.payment_card_last_four || null,
        transaction_id: nmiChargeDetails?.transactionId || null,
        reference_number: transactionReferenceId,
        authorization_code: nmiChargeDetails?.authCode || null,
        auth_code: nmiChargeDetails?.authCode || null,
        rrn: null,
        result_code: nmiChargeDetails?.responseCode || null,
        result_message: nmiChargeDetails?.responseMessage || null,
        batch_number: null,
        approved_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        processor_name: 'nmi',
        payment_device_id: storefrontPaymentConfig?.device_id ?? null,
        processor_response: nmiChargeDetails?.rawResponse ?? null,
        terminal_response: null,
        gateway_fee: nmiChargeDetails?.gatewayFee ?? null,
        dejavoo_response_code: null,
        dejavoo_response_message: null,
        dejavoo_batch_number: null,
        dejavoo_invoice_number: null,
        metadata: {
          source: 'online_order',
          provider: 'nmi',
          provider_order_id: transactionReferenceId,
          payment_status_from_source: 'CAPTURED',
          payment_device_id: storefrontPaymentConfig?.device_id ?? null,
        },
      }

  const { data: paymentUpdateData, error: paymentUpdateError } = await supabase
    .from('order_payments')
    .update(paymentUpdatePayload)
    .eq('order_id', orderResult.order_id)
    .select('id, payment_method, card_last_four, rrn, status')

  if (payCashInStore) {
    const { error: orderPaymentStateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'pending',
        amount_paid: 0,
        amount_due: toDollars(totalCents),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderResult.order_id)

    if (orderPaymentStateError) {
      logError('ORDER_UPDATE', 'Failed to reset cash-in-store order payment state', orderPaymentStateError)
    }
  } else {
    const { error: orderPaymentStateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        amount_paid: toDollars(totalCents),
        amount_due: 0,
        check_status: 'Closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderResult.order_id)

    if (orderPaymentStateError) {
      logError('ORDER_UPDATE', 'Failed to set card order payment state', orderPaymentStateError)
    }
  }

  if (paymentUpdateError) {
    logError('PAYMENT_UPDATE', 'Failed to update payment record with card info', paymentUpdateError)
  } else {
    logEvent('PAYMENT_UPDATE', 'Payment record updated with payment details', {
      rows: paymentUpdateData?.length ?? 0,
      data: paymentUpdateData,
    })
  }

  if (!payCashInStore) {
    const customerEmail =
      session?.customer_email?.trim() ||
      body.customer_email?.trim() ||
      null

    if (customerEmail) {
      try {
        const [{ data: merchant }, { data: location }] = await Promise.all([
          supabase
            .from('merchants')
            .select('name, owner_email')
            .eq('id', merchantId)
            .maybeSingle(),
          supabase
            .from('locations')
            .select('name')
            .eq('id', locationId)
            .maybeSingle(),
        ])

        await sendOnlineOrderPaymentEmail({
          to: customerEmail,
          merchantName: (merchant as MerchantEmailRow | null)?.name || 'Dexa POS',
          locationName: (location as LocationEmailRow | null)?.name || 'Store',
          displayNumber: orderResult.display_number ?? null,
          orderNumber: orderResult.order_number ?? null,
          totalAmount: toDollars(totalCents),
          orderType: body.order_type,
        })
      } catch (emailError) {
        logError('EMAIL', 'Failed to send online-order payment email', emailError)
      }
    }
  }

  // Link order to customer if session has customer_id
  if (session?.customer_id) {
    await supabase
      .from('orders')
      .update({ customer_id: session.customer_id })
      .eq('id', orderResult.order_id)
  }

  logEvent('ORDER', 'Order created successfully', {
    orderId: orderResult.order_id,
    orderNumber: orderResult.order_number,
    displayNumber: orderResult.display_number,
    payCashInStore,
    charged: !!nmiChargeDetails,
  })

  const autoAccepted: boolean = storeConfig.auto_accept_orders ?? false

  return successResponse({
    requires_redirect: false,
    order_id: orderResult.order_id,
    order_number: orderResult.order_number,
    display_number: orderResult.display_number,
    estimated_time: estimatedMinutes,
    auto_accepted: autoAccepted,
  })
})
