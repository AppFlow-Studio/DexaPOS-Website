// ============================================================================
// Audit Log Types
// Description: Types for the audit logging system
// ============================================================================

// Audit log action categories
export const AUDIT_CATEGORIES = [
  "merchant",
  "user_management",
  "device",
  "notes",
  "inventory",
  "purchase_order",
  "expense",
  "staff",
  "menu",
  "settings",
  "authentication",
  "order",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

// Severity levels
export const AUDIT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

// Resource types that can be audited
export const AUDIT_RESOURCE_TYPES = [
  "inventory_item",
  "purchase_order",
  "vendor",
  "expense",
  "menu_item",
  "staff_member",
  "location",
  "order",
] as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

// Common action types
export const AUDIT_ACTIONS = {
  // Inventory
  "inventory.item_created": "Item Created",
  "inventory.item_updated": "Item Updated",
  "inventory.item_deleted": "Item Deleted",
  "inventory.stock_updated": "Stock Updated",

  // Purchase Orders
  "purchase_order.created": "Purchase Order Created",
  "purchase_order.received": "Delivery Logged",
  "purchase_order.paid": "Payment Logged",
  "purchase_order.cancelled": "Purchase Order Cancelled",

  // Expenses
  "expense.logged": "Expense Logged",

  // Staff
  "staff.added": "Staff Added",
  "staff.removed": "Staff Removed",
  "staff.role_changed": "Role Changed",
  "staff.pin_reset": "PIN Reset",
  "staff.clock_in": "Clocked In",
  "staff.clock_out": "Clocked Out",

  // Orders
  "order.created": "Order Created",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

// Main Audit Log interface
export interface AuditLog {
  id: string;
  merchant_id: string;
  location_id: string | null;

  // Actor (who performed the action)
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;

  // Action details
  action: string;
  action_category: AuditCategory;
  severity: AuditSeverity;

  // Resource (what was affected)
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;

  // Change tracking
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
  } | null;
  metadata: Record<string, unknown> | null;

  // Timestamp
  created_at: string;
}

// Extended with location name for UI
export interface AuditLogWithLocation extends AuditLog {
  location?: {
    id: string;
    name: string;
  } | null;
}

// Stock update log interface
export interface StockUpdateLog {
  id: string;
  merchant_id: string;
  location_id: string | null;
  inventory_item_id: string | null;

  previous_stock: number;
  new_stock: number;
  change_amount: number;

  update_reason: string | null;
  update_source:
    | "manual"
    | "delivery"
    | "sale"
    | "waste"
    | "adjustment"
    | "transfer";

  updated_by_user_id: string | null;
  updated_by_name: string | null;

  purchase_order_id: string | null;

  created_at: string;
}

// Adhoc expense (non-vendor purchase) interface
export interface AdhocExpenseInput {
  expense_vendor_name: string;
  expense_category?: string;
  expense_notes?: string;
  payment_method: "card" | "cash";
  card_last_four?: string;
  total_amount: number;
  items: Array<{
    inventory_item_id?: string;
    name: string;
    quantity: number;
    unit_cost: number;
  }>;
}

// Filters for audit log queries
export interface AuditLogFilters {
  location_id?: string | null;
  action_category?: AuditCategory;
  severity?: AuditSeverity;
  resource_type?: string;
  /** Filter by multiple resource types (used by merchant category tabs) */
  resource_types?: string[];
  actor_user_id?: string;
  staff_profile_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  station_id?: string; // Filter by station_id in metadata
}

// Category display configuration
export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  merchant: "Merchant",
  user_management: "User Management",
  device: "Device",
  notes: "Notes",
  inventory: "Inventory",
  purchase_order: "Purchase Orders",
  expense: "Expenses",
  staff: "Staff",
  menu: "Menu",
  settings: "Settings",
  authentication: "Authentication",
  order: "Orders",
};

export const CATEGORY_COLORS: Record<AuditCategory, string> = {
  merchant:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400",
  user_management:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400",
  device:
    "bg-slate-100 text-slate-700 dark:bg-slate-950/50 dark:text-slate-400",
  notes:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  inventory:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  purchase_order:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  expense:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  staff:
    "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
  menu: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-400",
  settings: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  authentication:
    "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  order:
    "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
};

export const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
};
