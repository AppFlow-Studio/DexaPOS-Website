// types/merchant.ts
// Merchant types for admin management interface

// ============================================================================
// MERCHANT SUMMARY (from admin_merchant_summary view)
// ============================================================================

export interface MerchantSummary {
  id: string
  name: string
  clerk_org_id: string
  type: string | null
  logo_url: string | null
  created_at: string
  updated_at: string | null
  public_metadata: Record<string, unknown> | null
  pricing_strategy?: 'manual' | 'dual'
  dual_pricing_percentage?: number
  total_locations: number
  active_locations: number
  active_staff_count: number
  orders_today: number
  revenue_today: number
  last_order_at: string | null
  derived_status: 'active' | 'inactive' | 'onboarding'
  notes_count?: number
}

// ============================================================================
// LOCATION SUMMARY
// ============================================================================

export interface LocationSummary {
  id: string
  name: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  is_active: boolean
  is_accepting_orders: boolean
  timezone: string | null
  pricing_strategy?: 'manual' | 'dual'
  dual_pricing_percentage?: number
  use_merchant_pricing_defaults?: boolean
  orders_today: number
  revenue_today: number
}

// ============================================================================
// MERCHANT DETAILS (extended with locations)
// ============================================================================

export interface MerchantDetails extends MerchantSummary {
  locations: LocationSummary[]
}

// ============================================================================
// FILTERS AND PAGINATION
// ============================================================================

export interface MerchantFilters {
  search: string
  status: 'all' | 'active' | 'inactive' | 'onboarding'
  sortBy: 'name' | 'created_at' | 'orders_today' | 'revenue_today'
  sortOrder: 'asc' | 'desc'
}

export const DEFAULT_MERCHANT_FILTERS: MerchantFilters = {
  search: '',
  status: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
}

export interface MerchantListResponse {
  merchants: MerchantSummary[]
  total: number
  page: number
  pageSize: number
}

// ============================================================================
// MERCHANT UPDATE TYPES
// ============================================================================

export interface MerchantSettingsUpdate {
  name?: string
  type?: string
  public_metadata?: Record<string, unknown>
  pricing_strategy?: 'manual' | 'dual'
  dual_pricing_percentage?: number
}

export interface ToggleLocationResult {
  success: boolean
  error?: string
}

export interface UpdateMerchantResult {
  success: boolean
  error?: string
}

// ============================================================================
// MERCHANT HEALTH GRID
// ============================================================================

export interface MerchantHealthSummary extends MerchantSummary {
  healthScore: number
  healthTier: 'green' | 'yellow' | 'red'
  alerts: string[]
  totalStations: number
  onlineStations: number
}
