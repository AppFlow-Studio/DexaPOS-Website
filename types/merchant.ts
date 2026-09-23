// types/merchant.ts
// Merchant types for admin management interface

// ============================================================================
// MERCHANT SUMMARY (from admin_merchant_summary view)
// ============================================================================

export type MerchantOnboardingStatus =
  | 'created'
  | 'onboarding'
  | 'active'
  | 'suspended'
  | 'cancelled'

export interface MerchantOnboardingChecklist {
  businessInfo: boolean
  ownerInvited: boolean
  billingAdded: boolean
  firstLocation: boolean
  firstPayment: boolean
}

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
  onboarding_status?: MerchantOnboardingStatus
  onboarding_completed_at?: string | null
  activated_at?: string | null
  owner_first_name?: string | null
  owner_last_name?: string | null
  owner_email?: string | null
  owner_phone?: string | null
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
  business_legal_name?: string | null
  dba_name?: string | null
  business_type?: string | null
  ein_last_four?: string | null
  business_address_line1?: string | null
  business_address_line2?: string | null
  business_city?: string | null
  business_state?: string | null
  business_postal_code?: string | null
  business_country?: string | null
  /**
   * 12-char Dejavoo / iPOSpays merchantId. Per-merchant; required for the
   * domain-whitelist Management API call. Distinct from `id` (UUID) and
   * `clerk_org_id`.
   */
  external_merchant_id?: string | null
  billing_exempt?: boolean
  billing_exempt_reason?: string | null
  billing_exempt_expires_at?: string | null
  billing_exempt_granted_at?: string | null
  billing_exempt_granted_by?: string | null
  onboarding_checklist?: MerchantOnboardingChecklist
  locations: LocationSummary[]
}

// ============================================================================
// FILTERS AND PAGINATION
// ============================================================================

export interface MerchantFilters {
  search: string
  status: 'all' | MerchantOnboardingStatus | 'inactive'
  sortBy: 'name' | 'created_at' | 'status' | 'orders_today' | 'revenue_today'
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
  business_legal_name?: string | null
  dba_name?: string | null
  business_type?: string | null
  ein_last_four?: string | null
  // Owner / contact + business address — required for Valor boarding.
  owner_first_name?: string | null
  owner_last_name?: string | null
  owner_email?: string | null
  owner_phone?: string | null
  business_address_line1?: string | null
  business_address_line2?: string | null
  business_city?: string | null
  business_state?: string | null
  business_postal_code?: string | null
  business_country?: string | null
}

export interface ToggleLocationResult {
  success: boolean
  error?: string
}

export interface UpdateMerchantResult {
  success: boolean
  error?: string
}

export interface UpdateMerchantStatusResult {
  success: boolean
  error?: string
}

// ============================================================================
// MERCHANT HEALTH GRID
// ============================================================================

/**
 * `unscored` is a real tier, not a styling variant.
 *
 * A merchant with no locations, no devices and no staff has not failed any
 * health check — there is nothing yet to check. Scoring one anyway produced
 * this dashboard's worst bug: a red "Critical 58" card whose own detail line
 * read "All systems optimal", because the score was dragged down by zero
 * order activity while the alert generators found no stations to report on.
 *
 * When the tier is `unscored`, `healthScore` is null: there is no number to
 * show, to sort by, or to threshold against, and making that unrepresentable
 * is the point. Consumers branch on the tier rather than reading a sentinel
 * score that would quietly re-enter the ranking.
 */
export type MerchantHealthTier = 'green' | 'yellow' | 'red' | 'unscored'

export interface MerchantHealthSummary extends MerchantSummary {
  healthScore: number | null
  healthTier: MerchantHealthTier
  alerts: string[]
  totalStations: number
  onlineStations: number
}
