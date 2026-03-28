// ============================================================================
// validators.ts
// ============================================================================
// Pure/DB validation functions for the create-online-order edge function.
// Each validator returns { valid: true } or { valid: false, ...details }.
// ============================================================================

import { type SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// STOCK VALIDATION
// ============================================================================

interface StockValidItem {
  id: string
  quantity: number
  name: string
}

interface StockValidationSuccess {
  valid: true
}

interface StockValidationFailure {
  valid: false
  unavailableItems: Array<{ id: string; name: string; reason: string }>
}

export type StockValidationResult = StockValidationSuccess | StockValidationFailure

export async function validateStock(
  supabase: SupabaseClient,
  locationId: string,
  items: StockValidItem[]
): Promise<StockValidationResult> {
  const itemIds = items.map((i) => i.id)

  // Fetch base item availability
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, availability')
    .in('id', itemIds)

  if (menuError) {
    console.error('[STOCK] Failed to fetch menu items:', menuError)
    return { valid: false, unavailableItems: [{ id: '', name: '', reason: 'Failed to check stock availability' }] }
  }

  // Fetch location-level overrides (availability + stock tracking)
  const { data: overrides } = await supabase
    .from('location_item_overrides')
    .select('menu_item_id, is_available, stock_tracking_mode, current_stock')
    .eq('location_id', locationId)
    .in('menu_item_id', itemIds)

  const overrideMap = new Map(
    (overrides ?? []).map((o: any) => [o.menu_item_id, o])
  )
  const menuItemMap = new Map(
    (menuItems ?? []).map((m: any) => [m.id, m])
  )

  const unavailable: Array<{ id: string; name: string; reason: string }> = []

  for (const cartItem of items) {
    const baseItem = menuItemMap.get(cartItem.id)
    const override = overrideMap.get(cartItem.id)

    // Item doesn't exist at all
    if (!baseItem) {
      unavailable.push({ id: cartItem.id, name: cartItem.name, reason: 'Item not found' })
      continue
    }

    // Check availability: override takes precedence over base
    const isAvailable = override?.is_available ?? baseItem.availability
    if (isAvailable === false) {
      unavailable.push({ id: cartItem.id, name: baseItem.name, reason: 'Item is currently unavailable' })
      continue
    }

    // Check stock tracking (only from location override)
    if (override) {
      if (override.stock_tracking_mode === 'out_of_stock') {
        unavailable.push({ id: cartItem.id, name: baseItem.name, reason: 'Item is out of stock' })
        continue
      }

      if (
        override.stock_tracking_mode === 'quantity' &&
        override.current_stock !== null &&
        override.current_stock < cartItem.quantity
      ) {
        unavailable.push({
          id: cartItem.id,
          name: baseItem.name,
          reason: override.current_stock === 0
            ? 'Item is out of stock'
            : `Only ${override.current_stock} available`,
        })
        continue
      }
    }
  }

  if (unavailable.length > 0) {
    return { valid: false, unavailableItems: unavailable }
  }

  return { valid: true }
}

// ============================================================================
// OPERATING HOURS VALIDATION
// ============================================================================

interface OperatingHoursEntry {
  day: number       // 0=Sunday, 1=Monday, ..., 6=Saturday
  open: string      // "HH:MM" 24h format
  close: string     // "HH:MM" 24h format
  is_closed: boolean
}

// WeeklySchedule format saved by the dashboard
interface DaySchedule {
  enabled: boolean
  from: string      // "HH:MM"
  to: string        // "HH:MM"
  is24Hours: boolean
}

interface WeeklySchedule {
  [key: string]: DaySchedule
}

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

function normalizeOperatingHours(raw: unknown): OperatingHoursEntry[] | null {
  if (!raw) return null
  // Already an array (seed data / legacy format)
  if (Array.isArray(raw)) return raw as OperatingHoursEntry[]
  // WeeklySchedule object format from dashboard
  if (typeof raw === 'object') {
    const entries: OperatingHoursEntry[] = []
    for (const [dayName, schedule] of Object.entries(raw as WeeklySchedule)) {
      const dayNum = DAY_NAME_TO_NUMBER[dayName.toLowerCase()]
      if (dayNum === undefined) continue
      entries.push({
        day: dayNum,
        open: (schedule as DaySchedule).is24Hours ? '00:00' : (schedule as DaySchedule).from,
        close: (schedule as DaySchedule).is24Hours ? '23:59' : (schedule as DaySchedule).to,
        is_closed: !(schedule as DaySchedule).enabled,
      })
    }
    return entries.length > 0 ? entries : null
  }
  return null
}

interface HoursValidationSuccess {
  valid: true
}

interface HoursValidationFailure {
  valid: false
  reason: string
  nextOpen?: string
}

export type HoursValidationResult = HoursValidationSuccess | HoursValidationFailure

export function validateOperatingHours(
  rawOperatingHours: unknown,
  requestedTime?: string | null
): HoursValidationResult {
  const operatingHours = normalizeOperatingHours(rawOperatingHours)
  // No hours configured = always open
  if (!operatingHours || operatingHours.length === 0) {
    return { valid: true }
  }

  const checkDate = requestedTime ? new Date(requestedTime) : new Date()
  const dayOfWeek = checkDate.getDay() // 0=Sunday
  const currentMinutes = checkDate.getHours() * 60 + checkDate.getMinutes()

  // Find today's hours
  const todayHours = operatingHours.find((h) => h.day === dayOfWeek)

  if (!todayHours || todayHours.is_closed) {
    const nextOpen = findNextOpen(operatingHours, dayOfWeek)
    return {
      valid: false,
      reason: 'Store is currently closed',
      nextOpen,
    }
  }

  const openMinutes = parseTimeToMinutes(todayHours.open)
  const closeMinutes = parseTimeToMinutes(todayHours.close)

  // Handle overnight hours (close < open means crosses midnight)
  if (closeMinutes < openMinutes) {
    // Open if: current >= open OR current < close
    if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) {
      return { valid: true }
    }
  } else {
    // Normal hours: open <= current < close
    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      return { valid: true }
    }
  }

  const nextOpen = findNextOpen(operatingHours, dayOfWeek)
  return {
    valid: false,
    reason: 'Store is currently closed',
    nextOpen,
  }
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function findNextOpen(hours: OperatingHoursEntry[], currentDay: number): string | undefined {
  // Look ahead up to 7 days
  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i + 1) % 7
    const dayHours = hours.find((h) => h.day === checkDay)
    if (dayHours && !dayHours.is_closed) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return `${dayNames[checkDay]} at ${dayHours.open}`
    }
  }
  return undefined
}

// ============================================================================
// DELIVERY ZONE VALIDATION
// ============================================================================

interface StoreAddress {
  lat?: number
  lng?: number
  [key: string]: unknown
}

interface CustomerDeliveryAddress {
  lat?: number
  lng?: number
  [key: string]: unknown
}

interface DeliveryZoneSuccess {
  valid: true
  zone?: { id: string; zone_name: string }
  deliveryFeeCents: number
  minOrderCents: number
  freeDeliveryThresholdCents: number | null
}

interface DeliveryZoneFailure {
  valid: false
  reason: string
}

export type DeliveryZoneResult = DeliveryZoneSuccess | DeliveryZoneFailure

export async function validateDeliveryZone(
  supabase: SupabaseClient,
  storeConfigId: string,
  storeAddress: StoreAddress | null,
  customerAddress: CustomerDeliveryAddress,
  deliveryRadiusMiles?: number | null,
  storeDeliveryFeeCents?: number,
  storeMinOrderCents?: number,
  storeFreeDeliveryThresholdCents?: number | null
): Promise<DeliveryZoneResult> {
  // Fetch active delivery zones
  const { data: zones } = await supabase
    .from('delivery_zones')
    .select('*')
    .eq('store_config_id', storeConfigId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  // If customer has lat/lng, check against zones
  if (customerAddress.lat && customerAddress.lng && storeAddress?.lat && storeAddress?.lng) {
    // Check each zone
    for (const zone of (zones ?? [])) {
      if (zone.zone_type === 'radius' && zone.radius_miles) {
        const distance = haversineDistance(
          storeAddress.lat,
          storeAddress.lng,
          customerAddress.lat,
          customerAddress.lng
        )
        if (distance <= zone.radius_miles) {
          return {
            valid: true,
            zone: { id: zone.id, zone_name: zone.zone_name },
            deliveryFeeCents: zone.delivery_fee_cents ?? 0,
            minOrderCents: zone.min_order_cents ?? 0,
            freeDeliveryThresholdCents: zone.free_delivery_threshold_cents ?? null,
          }
        }
      }
      // polygon zones would be checked here in the future
    }

    // No zone matched — check store-level radius fallback
    if (deliveryRadiusMiles) {
      const distance = haversineDistance(
        storeAddress.lat,
        storeAddress.lng,
        customerAddress.lat,
        customerAddress.lng
      )
      if (distance <= deliveryRadiusMiles) {
        return {
          valid: true,
          deliveryFeeCents: storeDeliveryFeeCents ?? 0,
          minOrderCents: storeMinOrderCents ?? 0,
          freeDeliveryThresholdCents: storeFreeDeliveryThresholdCents ?? null,
        }
      }

      return {
        valid: false,
        reason: `Delivery address is outside our delivery area (${deliveryRadiusMiles} mile radius)`,
      }
    }
  }

  // No lat/lng or no zones configured — allow delivery with store-level defaults
  // (address will be validated by the driver)
  if (!zones || zones.length === 0) {
    return {
      valid: true,
      deliveryFeeCents: storeDeliveryFeeCents ?? 0,
      minOrderCents: storeMinOrderCents ?? 0,
      freeDeliveryThresholdCents: storeFreeDeliveryThresholdCents ?? null,
    }
  }

  // Zones exist but we couldn't match (no coordinates) — reject
  return {
    valid: false,
    reason: 'Could not verify delivery address. Please ensure your address includes valid coordinates.',
  }
}

/**
 * Haversine formula to calculate distance in miles between two lat/lng points.
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// ============================================================================
// MINIMUM ORDER VALIDATION
// ============================================================================

interface MinOrderSuccess {
  valid: true
}

interface MinOrderFailure {
  valid: false
  minimumCents: number
  currentCents: number
}

export type MinOrderResult = MinOrderSuccess | MinOrderFailure

export function validateMinimumOrder(
  subtotalCents: number,
  minOrderCents: number
): MinOrderResult {
  if (minOrderCents <= 0 || subtotalCents >= minOrderCents) {
    return { valid: true }
  }
  return { valid: false, minimumCents: minOrderCents, currentCents: subtotalCents }
}
