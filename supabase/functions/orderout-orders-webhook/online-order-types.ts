// ============================================================================
// online-order-types.ts
// ============================================================================
// Shared type definitions for the provider-agnostic online order system.
// Every delivery provider translator imports these types to ensure
// consistent payloads flowing into the universal process_online_order RPC.
//
// ADDING A NEW PROVIDER:
//   1. Create a new Edge Function: supabase/functions/<provider>-webhook/
//   2. Import these types
//   3. Write a translate() function: ProviderPayload → OnlineOrderRpcParams
//   4. Add provider to the online_order_provider enum via migration
//   5. Add any provider-specific config table (e.g. doordash_stores)
// ============================================================================

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * All known delivery provider identifiers.
 * Must match the online_order_provider PostgreSQL enum.
 */
export type OnlineOrderProvider =
  | 'orderout'      // OrderOut aggregator (GrubHub, DoorDash via OO, etc.)
  | 'doordash'      // DoorDash direct integration
  | 'ubereats'      // UberEats direct integration
  | 'grubhub'       // GrubHub direct integration
  | 'website'       // Restaurant's own website ordering
  | 'app'           // Restaurant's own app ordering
  | 'other'         // Catch-all

// ============================================================================
// UNIVERSAL ITEM FORMAT
// ============================================================================
// Every translator must normalize provider-specific items into this shape.
// ============================================================================

export interface OnlineOrderModifier {
  /** Provider's modifier ID (for tracing) */
  id: string | null
  /** Human-readable modifier name */
  name: string
  /** Modifier price in DOLLARS (e.g. 1.25) — stored as-is */
  price: number
  /** Modifier quantity */
  quantity: number
  /** Modifier group name (e.g. "Toppings", "Extras") */
  group_name: string | null
}

export interface OnlineOrderItem {
  /** Provider's item ID (for tracing) */
  id: string
  /** Human-readable item name */
  name: string
  /** Special instructions / notes for this item */
  note: string | null
  /** Unit price in DOLLARS */
  price: number
  /** Line total in DOLLARS (price × quantity + modifiers) */
  total: number
  /** Quantity ordered */
  quantity: number
  /** DEXA POS menu_item_id — this is the critical link to our menu.
   *  If the provider synced their menu from us, this should be our UUID.
   *  If not found, the RPC inserts it as an open item. */
  external_id: string
  /** Modifiers / customizations */
  modifiers: OnlineOrderModifier[]
}

// ============================================================================
// DELIVERY ADDRESS
// ============================================================================

export interface DeliveryAddress {
  street: string | null
  unit: string | null
  city: string | null
  state: string | null
  zip: string | null
  delivery_notes: string | null
}

// ============================================================================
// RPC PARAMETERS — the universal shape that goes into process_online_order()
// ============================================================================
// Every translator's final output must match this interface.
// ============================================================================

export interface OnlineOrderRpcParams {
  // ---- Location & Provider ----
  p_location_id: string              // UUID — matched from provider config
  p_provider: OnlineOrderProvider
  p_provider_order_id: string        // Provider's unique order ID (idempotency key)

  // ---- Provider metadata (optional) ----
  p_provider_restaurant_id?: string | null
  p_external_reference?: string | null
  p_delivery_company?: string | null
  p_provider_metadata?: Record<string, unknown>

  // ---- Order details ----
  p_order_type_raw?: string          // 'DELIVERY', 'PICKUP', etc.
  p_customer_name?: string | null
  p_customer_phone?: string | null
  p_customer_email?: string | null

  // ---- Money (ALL IN DOLLARS e.g. 55.50 — stored as-is, no conversion) ----
  p_subtotal?: number
  p_tax?: number
  p_total?: number
  p_gratuity?: number
  p_surcharge?: number
  p_delivery_charge?: number
  p_discount?: number

  // ---- Timestamps ----
  p_placed_at?: string | null        // ISO 8601
  p_ready_by?: string | null         // ISO 8601
  p_estimated_delivery?: string | null // ISO 8601

  // ---- Items (universal format) ----
  p_items?: OnlineOrderItem[]

  // ---- Customer address ----
  p_delivery_address?: DeliveryAddress | null

  // ---- Notes ----
  p_order_notes?: string | null

  // ---- Raw payload (for debugging) ----
  p_raw_payload?: Record<string, unknown> | null

  // ---- Behavior ----
  p_auto_accept?: boolean
}

// ============================================================================
// RPC RESPONSE — what process_online_order() returns
// ============================================================================

export interface OnlineOrderRpcResult {
  success: boolean
  order_id?: string
  order_number?: string
  display_number?: string
  status?: string
  payment_status?: string
  item_count?: number
  total?: number
  auto_accepted?: boolean
  provider?: string
  duplicate?: boolean
  message?: string
  warnings?: OnlineOrderWarning[]
  // Error fields (only present when success = false)
  error?: string
  error_detail?: string
  provider_order_id?: string
}

export interface OnlineOrderWarning {
  type: string
  external_id?: string
  item_name?: string
  message: string
}

// ============================================================================
// RESTAURANT MATCH — result of looking up which location a webhook maps to
// ============================================================================
// Each provider has its own config table (orderout_restaurants, etc.),
// but they all need to produce this common shape for the webhook handler.
// ============================================================================

export interface ProviderRestaurantMatch {
  /** Provider-specific restaurant record ID */
  provider_record_id: string
  /** DEXA POS location UUID */
  location_id: string
  /** Whether to auto-accept incoming orders */
  auto_accept_orders: boolean
  /** Whether this restaurant is currently accepting orders */
  is_accepting_orders: boolean
  /** Optional provider-specific restaurant ID (for logging) */
  provider_restaurant_id?: string
}

// ============================================================================
// WEBHOOK HANDLER INTERFACE
// ============================================================================
// Convenience type for structuring provider Edge Functions consistently.
// ============================================================================

export interface WebhookValidation {
  valid: boolean
  error?: string
}

// ============================================================================
// HELPER: Build delivery address from common fields
// ============================================================================

export function buildDeliveryAddress(
  street: string | null | undefined,
  unit: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
  notes: string | null | undefined,
): DeliveryAddress | null {
  if (!street && !city && !state && !zip) return null
  return {
    street: street ?? null,
    unit: unit ?? null,
    city: city ?? null,
    state: state ?? null,
    zip: zip ?? null,
    delivery_notes: notes ?? null,
  }
}

// ============================================================================
// HELPER: Normalize items from any provider format
// ============================================================================
// Providers can call this after mapping their items to OnlineOrderItem[].
// It handles null/missing fields gracefully.
// ============================================================================

export function sanitizeItems(items: Partial<OnlineOrderItem>[]): OnlineOrderItem[] {
  return items.map((item, index) => ({
    id: item.id ?? `item_${index}`,
    name: item.name ?? 'Unknown Item',
    note: item.note ?? null,
    price: item.price ?? 0,
    total: item.total ?? (item.price ?? 0) * (item.quantity ?? 1),
    quantity: item.quantity ?? 1,
    external_id: item.external_id ?? '',
    modifiers: (item.modifiers ?? []).map((mod) => ({
      id: mod.id ?? null,
      name: mod.name ?? 'Unknown Modifier',
      price: mod.price ?? 0,
      quantity: mod.quantity ?? 1,
      group_name: mod.group_name ?? null,
    })),
  }))
}