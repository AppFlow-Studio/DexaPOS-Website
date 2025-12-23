// ============================================================================
// Inventory Control Types
// Description: Types for channel availability and inventory management
// ============================================================================

import { TaxCategory } from './tax'
import { MenuItemsModel } from './db-modles'

// ============================================================================
// Sales Channels
// ============================================================================

// Available sales channels where items can be sold
export const AVAILABLE_CHANNELS = ['pos', 'online', 'kiosk'] as const

export type AvailableChannel = typeof AVAILABLE_CHANNELS[number]

// Channel display configuration
export const CHANNEL_LABELS: Record<AvailableChannel, string> = {
    pos: 'POS',
    online: 'Online',
    kiosk: 'Kiosk',
}

export const CHANNEL_DESCRIPTIONS: Record<AvailableChannel, string> = {
    pos: 'Available for sale at the Point of Sale terminal',
    online: 'Available for online ordering (web/mobile app)',
    kiosk: 'Available on self-service kiosks',
}

// Channel icon names (Lucide icons)
export const CHANNEL_ICONS: Record<AvailableChannel, string> = {
    pos: 'CreditCard',
    online: 'Globe',
    kiosk: 'Monitor',
}

// ============================================================================
// Extended Menu Item with Controls
// ============================================================================

// Menu item with tax and channel controls
export interface MenuItemWithControls extends MenuItemsModel {
    // Tax controls (Level 1 - Global)
    tax_category: TaxCategory
    is_tax_exempt: boolean
    available_channels: AvailableChannel[]

    // Effective values (after L2 override if applicable)
    effective_tax_category: TaxCategory
    effective_is_tax_exempt: boolean
    effective_available_channels: AvailableChannel[]

    // Source indicators
    has_tax_override: boolean
    has_channel_override: boolean
}

// ============================================================================
// Stock Tracking
// ============================================================================

export const STOCK_TRACKING_MODES = [
    'quantity',      // Track exact quantity
    'in_stock',      // Simple in/out of stock
    'out_of_stock',  // Marked as out of stock
    'use_default',   // Inherit from global setting
] as const

export type StockTrackingMode = typeof STOCK_TRACKING_MODES[number]

export const STOCK_TRACKING_LABELS: Record<StockTrackingMode, string> = {
    quantity: 'Track Quantity',
    in_stock: 'In Stock',
    out_of_stock: 'Out of Stock',
    use_default: 'Use Global Setting',
}

// Stock status derived from tracking mode and quantity
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked'

export interface StockInfo {
    tracking_mode: StockTrackingMode
    current_stock: number | null
    status: StockStatus
    is_available: boolean
}

// ============================================================================
// Inventory Filters
// ============================================================================

export interface InventoryFilters {
    search?: string
    category_ids?: string[]
    tax_categories?: TaxCategory[]
    channels?: AvailableChannel[]
    stock_status?: StockStatus[]
    is_tax_exempt?: boolean
    has_overrides?: boolean
}

// ============================================================================
// Inventory Statistics
// ============================================================================

export interface InventoryStats {
    total_items: number
    available_items: number
    out_of_stock_items: number
    tax_exempt_items: number

    // Per-channel counts
    channel_counts: Record<AvailableChannel, number>

    // Per-tax-category counts
    tax_category_counts: Record<TaxCategory, number>

    // Pricing
    average_price: number
    total_inventory_value: number
}
