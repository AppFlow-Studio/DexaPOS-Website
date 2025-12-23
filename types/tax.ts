// ============================================================================
// Tax System Types
// Description: Type definitions for category-based tax rates and calculations
// ============================================================================

// Tax Categories (Global Constants)
// Items belong to tax categories, locations set rates for each category
export const TAX_CATEGORIES = [
    'standard',
    'alcohol',
    'food',
    'grocery',
    'retail',
    'service',
] as const

export type TaxCategory = typeof TAX_CATEGORIES[number]

// Tax Category Display Names
export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
    standard: 'Standard',
    alcohol: 'Alcohol',
    food: 'Food',
    grocery: 'Grocery',
    retail: 'Retail',
    service: 'Service',
}

// Tax Category Descriptions
export const TAX_CATEGORY_DESCRIPTIONS: Record<TaxCategory, string> = {
    standard: 'Default tax category for most items',
    alcohol: 'Alcoholic beverages and spirits',
    food: 'Prepared food and restaurant meals',
    grocery: 'Unprepared groceries and staples',
    retail: 'Retail goods and merchandise',
    service: 'Service charges and fees',
}

// ============================================================================
// Tax Rate (Location-Specific Percentage)
// ============================================================================

export interface TaxRate {
    id: string
    location_id: string
    name: string                // e.g., "NYC Liquor Tax", "CA Sales Tax"
    percentage: number          // e.g., 8.875 (for 8.875%)
    tax_category: TaxCategory
    is_active: boolean
    created_at: string
    updated_at: string
}

// For creating/updating tax rates
export interface TaxRateInput {
    location_id: string
    name: string
    percentage: number
    tax_category: TaxCategory
}

// ============================================================================
// Tax Calculation Types
// ============================================================================

// Tax calculation result for a single item
export interface ItemTaxInfo {
    item_id: string
    item_name: string
    tax_category: TaxCategory
    is_tax_exempt: boolean

    // Applicable rate (null if exempt or no rate set)
    applicable_rate: TaxRate | null

    // Calculated amounts
    subtotal: number            // Item price × quantity
    tax_amount: number          // Calculated tax
    total: number               // Subtotal + tax_amount
}

// Tax breakdown for an entire order
export interface OrderTaxBreakdown {
    order_id: string
    location_id: string

    // Totals
    subtotal: number
    total_tax: number
    total: number

    // Per-category breakdown
    categories: Array<{
        tax_category: TaxCategory
        tax_rate: TaxRate | null
        category_subtotal: number
        category_tax: number
        item_count: number
    }>

    // Exempt items
    exempt_items: Array<{
        item_id: string
        item_name: string
        subtotal: number
    }>
}

// ============================================================================
// Effective Tax Settings (With Inheritance)
// ============================================================================

// Represents the effective tax settings after L2 > L1 inheritance
export interface EffectiveTaxSettings {
    tax_category: TaxCategory
    is_tax_exempt: boolean

    // Source indicators
    tax_category_source: 'global' | 'location'
    is_tax_exempt_source: 'global' | 'location'

    // Applicable rate (if location and category have a rate)
    applicable_rate: TaxRate | null
}

// ============================================================================
// Helper Types
// ============================================================================

// Tax rate lookup result (from RPC function)
export interface TaxRateLookupResult {
    success: boolean
    tax_category: TaxCategory
    is_tax_exempt: boolean
    tax_rate: TaxRate | null
    percentage: number
    error?: string
}

// Tax calculation result (from calculate_order_tax RPC)
export interface TaxCalculationResult {
    success: boolean
    tax_amount: number
    order_id: string
    error?: string
}
