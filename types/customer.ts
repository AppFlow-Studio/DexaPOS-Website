// =============================================================================
// Customer Types - Matching Supabase Database Schema and RPC Functions
// =============================================================================

/**
 * Activity types tracked in customer_activities table
 */
export type CustomerActivityType =
  | "order"
  | "refund"
  | "visit"
  | "loyalty"
  | "feedback";

/**
 * Base Customer type matching the customers table schema
 */
export interface Customer {
  id: string;
  merchant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  last_visit: string | null;
  visits: number;
  last_order_date: string | null;
  lifetime_spend: number;
  avg_spend: number;
  avg_tip_percent: number;
  total_orders: number;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Customer activity record from customer_activities table
 */
export interface CustomerActivity {
  id: string;
  customer_id: string;
  merchant_id: string;
  activity_type: CustomerActivityType;
  related_order_id: string | null;
  metadata: CustomerActivityMetadata | null;
  created_at: string;
}

/**
 * Metadata stored in customer_activities.metadata JSONB column
 */
export interface CustomerActivityMetadata {
  // Order activity
  order_total?: number;
  order_type?: string;
  item_count?: number;
  payment_method?: string;

  // Refund activity
  refund_amount?: number;
  refund_reason?: string;

  // Loyalty activity
  points_earned?: number;
  points_redeemed?: number;
  reward_name?: string;

  // Feedback activity
  rating?: number;
  comment?: string;

  // Generic fields
  notes?: string;
  [key: string]: unknown;
}

/**
 * Order channel breakdown from get_customer_order_channels RPC
 */
export interface OrderChannel {
  channel: string; // order_type: dine_in, takeout, delivery, online, catering
  order_count: number;
  percentage: number;
}

/**
 * Most ordered item from get_customer_most_ordered_items RPC
 */
export interface MostOrderedItem {
  item_id: string;
  item_name: string;
  order_count: number;
  total_quantity: number;
}

/**
 * Complete customer profile from get_customer_profile RPC
 */
export interface CustomerProfile {
  customer: Customer;
  order_channels: OrderChannel[] | null;
  most_ordered_items: MostOrderedItem[] | null;
  recent_activity: CustomerActivity[] | null;
}

/**
 * Customer for list display (subset of full customer data)
 */
export interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  lifetime_spend: number;
  visits: number;
  last_visit: string | null;
  total_orders: number;
  avg_spend: number;
  tags: string[];
}

// =============================================================================
// Customer Status Type
// =============================================================================

/**
 * Customer segmentation status based on visit behavior
 */
export type CustomerStatus = "New" | "Active" | "At Risk" | "Lapsed";

/**
 * Get customer status based on visit count and last visit date
 */
export function getCustomerStatus(customer: CustomerListItem): CustomerStatus {
  // New: fewer than 3 visits
  if (customer.visits < 3) return "New";

  // If no last visit, treat as lapsed
  if (!customer.last_visit) return "Lapsed";

  const now = new Date();
  const lastVisit = new Date(customer.last_visit);
  const daysSinceVisit = Math.floor(
    (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Active: visited within last 30 days
  if (daysSinceVisit < 30) return "Active";

  // At Risk: visited 30-90 days ago
  if (daysSinceVisit < 90) return "At Risk";

  // Lapsed: visited more than 90 days ago
  return "Lapsed";
}

/**
 * Format a date as relative time ("3 days ago", "2 months ago", etc)
 */
export function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return "Never";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`;
    if (diffMonths < 12)
      return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
    return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
  } catch {
    return "Unknown";
  }
}

// =============================================================================
// UI Mapping Helpers
// =============================================================================

/**
 * Channel display configuration for pie charts
 */
export interface ChannelDisplayConfig {
  name: string;
  color: string;
}

/**
 * Map order_type values to display names and colors
 */
export const CHANNEL_DISPLAY_MAP: Record<string, ChannelDisplayConfig> = {
  takeout: { name: "Pickup", color: "#3b82f6" }, // blue
  dine_in: { name: "Dine-in", color: "#eab308" }, // yellow
  delivery: { name: "Delivery", color: "#ec4899" }, // pink
  online: { name: "Online", color: "#10b981" }, // green
  catering: { name: "Catering", color: "#8b5cf6" }, // purple
};

/**
 * Activity type display configuration
 */
export interface ActivityDisplayConfig {
  label: string;
  color: string;
  bgColor: string;
}

/**
 * Map activity types to display names and colors
 */
export const ACTIVITY_DISPLAY_MAP: Record<
  CustomerActivityType,
  ActivityDisplayConfig
> = {
  order: {
    label: "Order",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  refund: {
    label: "Refund",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
  },
  visit: {
    label: "Visit",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
  },
  loyalty: {
    label: "Loyalty",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  feedback: {
    label: "Feedback",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Transform order channels from RPC to pie chart format
 */
export function transformOrderChannelsForChart(
  channels: OrderChannel[] | null
): Array<{ name: string; value: number; color: string }> {
  if (!channels || channels.length === 0) {
    return [];
  }

  return channels.map((channel) => {
    const config = CHANNEL_DISPLAY_MAP[channel.channel] || {
      name: channel.channel,
      color: "#6b7280", // gray fallback
    };

    return {
      name: config.name,
      value: channel.percentage,
      color: config.color,
    };
  });
}

/**
 * Get display name for a customer (fallback to phone/email if no name)
 */
export function getCustomerDisplayName(customer: Customer | CustomerListItem): string {
  if (customer.name) return customer.name;
  if (customer.phone) return customer.phone;
  if (customer.email) return customer.email;
  return "Unknown Customer";
}

/**
 * Format relative time for activity display
 */
export function formatActivityTime(dateString: string): {
  time: string;
  date: string;
} {
  const date = new Date(dateString);
  return {
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    date: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}

