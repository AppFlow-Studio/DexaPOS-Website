// ============================================================================
// create-online-order Edge Function
// ============================================================================
// Validates stock, hours, delivery zone, recalculates prices server-side,
// creates a payment intent, and processes payment via iPOS Pays (HPP or
// card token). On successful card token charge, calls process_online_order
// RPC to create the order immediately.
//
// For HPP flow, the order is created later by the ipospays-payment-webhook
// after the customer completes payment on the hosted page.
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
  authenticateIPOS,
  chargePaymentToken,
  extractProcessorDetails,
} from './ipospays.ts'
// ============================================================================
// ENV
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEJAVOO_IPOS_API_KEY = Deno.env.get('DEJAVOO_IPOS_API_KEY') ?? ''
const DEJAVOO_IPOS_SECRET_KEY = Deno.env.get('DEJAVOO_IPOS_SECRET_KEY') ?? ''
// ============================================================================
// REQUEST TYPES
// ============================================================================

interface CreateOnlineOrderRequest {
  session_token?: string           // optional — authenticated customers
  store_config_id?: string         // required for guest checkout (no session)
  items: Array<{
    id: string          // menu_item_id
    name: string
    price: number       // unit price in dollars
    quantity: number
    notes?: string
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
  payment_token_id?: string       // from FTD (Freedom to Design) card tokenization
  payment_device_id?: string      // selected payment device used during tokenization
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

function successResponse(data: unknown, status = 200): Response {
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
    hasPaymentToken: !!body.payment_token_id,
    paymentDeviceId: body.payment_device_id ?? null,
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
          id, location_id, merchant_id, ipospays_tpn, is_active,
          operating_hours, accepts_pickup, accepts_delivery,
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
        id, location_id, merchant_id, ipospays_tpn, is_active,
        operating_hours, accepts_pickup, accepts_delivery,
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
  const ipospaysTpn: string | null = storeConfig.ipospays_tpn
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
    hasTpn: !!ipospaysTpn,
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
  const itemIds = body.items.map((i) => i.id)

  // Fetch actual prices from DB
  const { data: dbItems } = await supabase
    .from('menu_items')
    .select('id, price, delivery_price')
    .in('id', itemIds)

  // custom_price is the correct column name in location_item_overrides (not 'price')
  const { data: locationOverrides } = await supabase
    .from('location_item_overrides')
    .select('menu_item_id, custom_price')
    .eq('location_id', locationId)
    .in('menu_item_id', itemIds)

  const dbItemMap = new Map((dbItems ?? []).map((i: any) => [i.id, i]))
  const overrideMap = new Map((locationOverrides ?? []).map((o: any) => [o.menu_item_id, o]))

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
    const dbItem = dbItemMap.get(cartItem.id)
    const override = overrideMap.get(cartItem.id)

    // Determine the correct base price.
    // The storefront already applies the full 5-level price cascade (including category overrides L3-L5)
    // via the get_menu_with_categories RPC. We trust the cart-submitted price as the effective price,
    // but still verify against L2 (location override) and L1 (base price) for security.
    // cartItem.price already reflects the full effective_price shown to the customer.
    let unitPrice: number
    if (body.order_type === 'delivery') {
      // For delivery: L2 custom_price > L1 delivery_price > L1 base price > cart-submitted effective price
      unitPrice = override?.custom_price ?? dbItem?.delivery_price ?? dbItem?.price ?? cartItem.price
    } else {
      // For pickup: L2 custom_price > L1 base price > cart-submitted effective price
      // If no L2 override exists, fall back to cart price (which includes L3-L5 category overrides)
      unitPrice = override?.custom_price ?? (dbItem ? dbItem.price : cartItem.price)
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
  let paymentDevice: { id: string; tpn: string } | null = null

  if (!payCashInStore) {
    let paymentDeviceQuery = supabase
      .from('location_payment_devices')
      .select('id, tpn')
      .eq('location_id', locationId)
      .eq('is_active', true)

    if (body.payment_device_id) {
      paymentDeviceQuery = paymentDeviceQuery.eq('id', body.payment_device_id)
    } else {
      paymentDeviceQuery = paymentDeviceQuery.eq('use_for_online_ordering', true)
    }

    const { data: paymentDeviceRow, error: paymentDeviceError } = await paymentDeviceQuery.maybeSingle()

    if (paymentDeviceError) {
      logError('PAYMENT_DEVICE', 'Failed to resolve payment device', paymentDeviceError)
      return errorResponse(
        'Payment device configuration is unavailable for this store.',
        'payment_device_unavailable',
        503
      )
    }

    if (paymentDeviceRow) {
      paymentDevice = paymentDeviceRow
    }
  }

  const effectiveIposTpn = paymentDevice?.tpn ?? ipospaysTpn

  if (!payCashInStore && !effectiveIposTpn) {
    logError('PAYMENT', 'No iPOS Pays TPN configured for this store', { storeConfigId, paymentDeviceId: body.payment_device_id ?? null })
    return errorResponse(
      'Online payment is not configured for this store. Please contact the store.',
      'payment_not_configured',
      503
    )
  }

  if (!payCashInStore && !body.payment_token_id && !body.card_token) {
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
    p_items: sanitizeItems(recalculatedItems),
    p_delivery_address: deliveryAddr,
    p_order_notes: body.special_instructions ?? null,
    p_placed_at: new Date().toISOString(),
    p_ready_by: body.requested_time ?? null,
    p_auto_accept: storeConfig.auto_accept_orders ?? false,
  }

  // ---- Step 10: Charge card payment via iPOS ----
  let iposChargeDetails: {
    transactionId: string
    transactionNumber: string   // 4-digit invoice number from processor
    processorReferenceId: string // transactionReferenceId echoed back by processor
    rrn: string                 // retrieval reference number e.g. #219313501821
    authCode: string            // approval code e.g. TAS164
    batchNumber: string
    responseCode: string
    responseMessage: string
    cardType: string
    cardLastFour: string
  } | null = null

  if (!payCashInStore && body.payment_token_id) {
    if (!DEJAVOO_IPOS_API_KEY || !DEJAVOO_IPOS_SECRET_KEY) {
      logError('PAYMENT', 'iPOS API credentials not configured', { storeConfigId })
      return errorResponse(
        'Payment service is not configured. Please contact support.',
        'payment_not_configured',
        503
      )
    }

    logEvent('PAYMENT', 'Authenticating with iPOS', { referenceId: transactionReferenceId })
    const authResult = await authenticateIPOS(DEJAVOO_IPOS_API_KEY, DEJAVOO_IPOS_SECRET_KEY)
    if (!authResult.success) {
      logError('PAYMENT_AUTH', 'iPOS authentication failed', authResult.error)
      return errorResponse(
        'Payment service authentication failed. Please try again.',
        'payment_auth_failed',
        502
      )
    }

    logEvent('PAYMENT', 'Charging payment token via iPOS', {
      tpn: effectiveIposTpn,
      referenceId: transactionReferenceId,
      totalCents,
    })

    const chargeResult = await chargePaymentToken(
      { token: authResult.token, apiKey: DEJAVOO_IPOS_API_KEY, secretKey: DEJAVOO_IPOS_SECRET_KEY },
      {
        tpn: effectiveIposTpn!,
        referenceId: transactionReferenceId,
        amountCents: totalCents,
        paymentTokenId: body.payment_token_id,
      }
    )

    if (!chargeResult.success) {
      logError('PAYMENT_CHARGE', 'iPOS card charge declined', chargeResult)
      return errorResponse(
        chargeResult.error || 'Your card was declined. Please try a different card.',
        'payment_declined',
        402,
        { responseCode: chargeResult.responseCode, responseMessage: chargeResult.responseMessage }
      )
    }

    const details = extractProcessorDetails(chargeResult.rawResponse)
    iposChargeDetails = {
      transactionId: chargeResult.transactionId || details.transactionId,
      transactionNumber: details.transactionNumber,
      processorReferenceId: details.transactionReferenceId,
      rrn: details.rrn,
      authCode: details.authCode,
      batchNumber: details.batchNumber,
      responseCode: chargeResult.responseCode,
      responseMessage: chargeResult.responseMessage,
      cardType: details.cardType || body.payment_card_type || '',
      cardLastFour: details.cardLastFour || body.payment_card_last_four || '',
    }

    logEvent('PAYMENT', 'Card charged successfully', {
      transactionId: iposChargeDetails.transactionId,
      transactionNumber: iposChargeDetails.transactionNumber,
      rrn: iposChargeDetails.rrn,
      authCode: iposChargeDetails.authCode,
      responseCode: iposChargeDetails.responseCode,
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
    sanitizedItemsSample: rpcParams.p_items.map((it) => ({
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
        processor_response: null,
        terminal_response: null,
        dejavoo_response_code: null,
        dejavoo_response_message: null,
        dejavoo_batch_number: null,
        dejavoo_invoice_number: null,
        metadata: {
          source: 'online_order',
          provider: 'website',
          provider_order_id: transactionReferenceId,
          payment_status_from_source: 'PENDING_CASH_IN_STORE',
          payment_device_id: paymentDevice?.id ?? null,
          payment_device_tpn: paymentDevice?.tpn ?? effectiveIposTpn ?? null,
        },
      }
    : {
        payment_method: 'card',
        status: 'captured',
        terminal_type: 'dejavoo',
        card_type: iposChargeDetails?.cardType || body.payment_card_type || null,
        card_last_four: iposChargeDetails?.cardLastFour || body.payment_card_last_four || null,
        // processor's unique transaction ID (displayed as TXN.# on POS)
        transaction_id: iposChargeDetails?.transactionId || null,
        // processor's echoed-back transactionReferenceId (displayed as REF ID on POS)
        reference_number: iposChargeDetails?.processorReferenceId || transactionReferenceId,
        authorization_code: iposChargeDetails?.authCode || null,
        auth_code: iposChargeDetails?.authCode || null,
        // RRN — retrieval reference number e.g. #219313501821
        rrn: iposChargeDetails?.rrn || null,
        result_code: iposChargeDetails?.responseCode || null,
        result_message: iposChargeDetails?.responseMessage || null,
        batch_number: iposChargeDetails?.batchNumber || null,
        approved_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        processor_name: 'iPOSPays',
        processor_response: null,
        terminal_response: null,
        dejavoo_response_code: iposChargeDetails?.responseCode || null,
        dejavoo_response_message: iposChargeDetails?.responseMessage || null,
        dejavoo_batch_number: iposChargeDetails?.batchNumber || null,
        // 4-digit processor invoice/transaction number from Dejavoo
        dejavoo_invoice_number: iposChargeDetails?.transactionNumber || null,
        metadata: {
          source: 'online_order',
          provider: 'website',
          provider_order_id: transactionReferenceId,
          payment_status_from_source: 'CAPTURED',
          payment_device_id: paymentDevice?.id ?? null,
          payment_device_tpn: paymentDevice?.tpn ?? effectiveIposTpn ?? null,
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
    charged: !!iposChargeDetails,
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
