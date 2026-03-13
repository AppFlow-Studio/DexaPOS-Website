// ============================================================================
// online-order-types.ts (local copy for edge function isolation)
// ============================================================================
// Supabase Edge Functions are deployed independently — cross-function imports
// don't work. This file contains the subset of types and helpers from
// orderout-orders-webhook/online-order-types.ts that this function needs.
// ============================================================================

export type OnlineOrderProvider =
  | 'orderout'
  | 'doordash'
  | 'ubereats'
  | 'grubhub'
  | 'website'
  | 'app'
  | 'other'

export interface OnlineOrderModifier {
  id: string | null
  name: string
  price: number
  quantity: number
  group_name: string | null
}

export interface OnlineOrderItem {
  id: string
  name: string
  note: string | null
  price: number
  total: number
  quantity: number
  external_id: string
  modifiers: OnlineOrderModifier[]
}

export interface DeliveryAddress {
  street: string | null
  unit: string | null
  city: string | null
  state: string | null
  zip: string | null
  delivery_notes: string | null
}

export interface OnlineOrderRpcParams {
  p_location_id: string
  p_provider: OnlineOrderProvider
  p_provider_order_id: string
  p_provider_restaurant_id?: string | null
  p_external_reference?: string | null
  p_delivery_company?: string | null
  p_provider_metadata?: Record<string, unknown>
  p_order_type_raw?: string
  p_customer_name?: string | null
  p_customer_phone?: string | null
  p_customer_email?: string | null
  p_subtotal?: number
  p_tax?: number
  p_total?: number
  p_gratuity?: number
  p_surcharge?: number
  p_delivery_charge?: number
  p_discount?: number
  p_placed_at?: string | null
  p_ready_by?: string | null
  p_estimated_delivery?: string | null
  p_items?: OnlineOrderItem[]
  p_delivery_address?: DeliveryAddress | null
  p_order_notes?: string | null
  p_raw_payload?: Record<string, unknown> | null
  p_auto_accept?: boolean
}

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
  warnings?: Array<{ type: string; external_id?: string; item_name?: string; message: string }>
  error?: string
  error_detail?: string
  provider_order_id?: string
}

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
