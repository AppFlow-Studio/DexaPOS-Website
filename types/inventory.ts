// ============================================================================
// Inventory Control Types
// Description: Types for channel availability and inventory management
// ============================================================================

import { TaxCategory } from "./tax";
import { MenuItemsModel } from "./db-modles";

// ============================================================================
// Sales Channels
// ============================================================================

// Available sales channels where items can be sold
export const AVAILABLE_CHANNELS = ["pos", "online", "kiosk"] as const;

export type AvailableChannel = (typeof AVAILABLE_CHANNELS)[number];

// Channel display configuration
export const CHANNEL_LABELS: Record<AvailableChannel, string> = {
  pos: "POS",
  online: "Online",
  kiosk: "Kiosk",
};

export const CHANNEL_DESCRIPTIONS: Record<AvailableChannel, string> = {
  pos: "Available for sale at the Point of Sale terminal",
  online: "Available for online ordering (web/mobile app)",
  kiosk: "Available on self-service kiosks",
};

// Channel icon names (Lucide icons)
export const CHANNEL_ICONS: Record<AvailableChannel, string> = {
  pos: "CreditCard",
  online: "Globe",
  kiosk: "Monitor",
};

// ============================================================================
// Extended Menu Item with Controls
// ============================================================================

// Menu item with tax and channel controls
export interface MenuItemWithControls extends MenuItemsModel {
  // Tax controls (Level 1 - Global)
  tax_category: TaxCategory;
  is_tax_exempt: boolean;
  available_channels: AvailableChannel[];

  // Effective values (after L2 override if applicable)
  effective_tax_category: TaxCategory;
  effective_is_tax_exempt: boolean;
  effective_available_channels: AvailableChannel[];

  // Source indicators
  has_tax_override: boolean;
  has_channel_override: boolean;
}

// ============================================================================
// Stock Tracking
// ============================================================================

export const STOCK_TRACKING_MODES = [
  "quantity", // Track exact quantity
  "in_stock", // Simple in/out of stock
  "out_of_stock", // Marked as out of stock
  "use_default", // Inherit from global setting
] as const;

export type StockTrackingMode = (typeof STOCK_TRACKING_MODES)[number];

export const STOCK_TRACKING_LABELS: Record<StockTrackingMode, string> = {
  quantity: "Track Quantity",
  in_stock: "In Stock",
  out_of_stock: "Out of Stock",
  use_default: "Use Global Setting",
};

// Stock status derived from tracking mode and quantity
export type StockStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "not_tracked";

export interface StockInfo {
  tracking_mode: StockTrackingMode;
  current_stock: number | null;
  status: StockStatus;
  is_available: boolean;
}

// ============================================================================
// Inventory Filters
// ============================================================================

export interface InventoryFilters {
  search?: string;
  category_ids?: string[];
  tax_categories?: TaxCategory[];
  channels?: AvailableChannel[];
  stock_status?: StockStatus[];
  is_tax_exempt?: boolean;
  has_overrides?: boolean;
}

// ============================================================================
// Inventory Statistics
// ============================================================================

export interface InventoryStats {
  total_items: number;
  available_items: number;
  out_of_stock_items: number;
  tax_exempt_items: number;

  // Per-channel counts
  channel_counts: Record<AvailableChannel, number>;
  // Per-tax-category counts
  tax_category_counts: Record<TaxCategory, number>;

  // Pricing
  average_price: number;
  total_inventory_value: number;
}

// ============================================================================
// Core Database Models (Matches 017_inventory_management_system.sql)
// ============================================================================

export interface Vendor {
  id: string;
  merchant_id: string;
  location_id: string | null; // NULL = global, UUID = location-specific
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
  updated_at: string;
}

export type StockMode = "in_stock" | "stock_tracking" | "out_of_stock";

export interface InventoryItem {
  id: string;
  merchant_id: string;
  location_id: string | null; // NULL = global, UUID = location-specific
  name: string;
  sku: string | null;
  category: string | null;
  stock_mode: StockMode;
  current_stock: number;
  reorder_point: number;
  unit_type: string; // 'pcs', 'kg', 'oz'
  cost_per_unit: number;
  vendor_id: string | null;
  created_at: string;
  updated_at: string;
}

// Extended type with vendor details joined
export interface InventoryItemWithVendor extends InventoryItem {
  vendor?: {
    id: string;
    name: string;
  } | null;
}

// DEPRECATED: Stock is now directly on InventoryItem
// Kept for backward compatibility
export interface InventoryLocationStock {
  id: string;
  inventory_item_id: string;
  location_id: string;
  stock_mode: StockMode;
  current_stock: number;
  reorder_point: number;
  last_counted_at: string | null;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  merchant_id: string;
  location_id: string | null;
  po_number: string;
  vendor_id: string | null;
  status: "draft" | "pending" | "received" | "paid" | "cancelled";
  total_amount: number;
  ordered_at: string | null;
  received_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
}

export interface MenuItemRecipe {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_used: number;
  created_at: string;
}

// ============================================================================
// Phase 2: Vendor Items & Location Relationships
// ============================================================================

/**
 * Vendor Item - What items a vendor sells
 * Links vendors to inventory items with vendor-specific details
 */
export interface VendorItem {
  id: string;
  vendor_id: string;
  inventory_item_id: string;
  vendor_sku: string | null;
  default_cost: number;
  pack_size: string | null;
  is_preferred: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * VendorItem with joined inventory item data
 */
export interface VendorItemWithDetails extends VendorItem {
  inventory_item?: {
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    unit_type: string;
  } | null;
}

/**
 * Location Vendor - Which vendors serve which locations
 */
export interface LocationVendor {
  id: string;
  location_id: string;
  vendor_id: string;
  is_preferred: boolean;
  account_number: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * LocationVendor with joined vendor data
 */
export interface LocationVendorWithDetails extends LocationVendor {
  vendor?: {
    id: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  location?: {
    id: string;
    name: string;
  } | null;
}

/**
 * Location Vendor Pricing - Location-specific pricing for vendor items
 */
export interface LocationVendorPricing {
  id: string;
  location_id: string;
  vendor_id: string;
  inventory_item_id: string;
  unit_cost: number;
  last_updated: string;
}

/**
 * Extended Vendor with Phase 2 stats
 */
export interface VendorWithRelations extends Vendor {
  payment_terms?: string | null;
  is_active?: boolean;
  items_count?: number;
  locations_served_count?: number;
}
