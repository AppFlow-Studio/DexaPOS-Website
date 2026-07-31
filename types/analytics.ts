// ============================================================================
// DEXA POS: Multi-Location Analytics Types
// ============================================================================

import type { OrderSource } from "@/lib/orderout/platform";

// ============================================================================
// Base Types
// ============================================================================

export type MetricType =
  | "gross_sales"
  | "net_sales"
  | "order_count"
  | "avg_ticket"
  | "items_sold"
  | "labor_cost"
  | "labor_hours"
  | "tips_total"
  | "discounts_total"
  | "refunds_total"
  | "unique_customers"
  | "new_customers"
  | "returning_customers"
  | "avg_ticket_time_seconds"
  | "void_count"
  | "void_amount"
  | "labor_cost_percentage";

export type ChartType = "line" | "bar" | "radar" | "heatmap" | "ranking";

export type TimeRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "mtd"
  | "qtd"
  | "ytd"
  | "custom";

export type ComparisonPeriod =
  | "none"
  | "previous_period"
  | "same_period_last_year"
  | "same_period_last_month";

export type Daypart =
  | "breakfast"
  | "lunch"
  | "afternoon"
  | "dinner"
  | "late_night";

// ============================================================================
// API Response Types (from RPC functions)
// ============================================================================

export interface LocationComparisonRow {
  location_id: string;
  location_name: string;
  business_date: string;
  gross_sales: number;
  net_sales: number;
  order_count: number;
  avg_ticket: number;
  tips_total: number;
  discounts_total: number;
  labor_cost_percentage: number;
  items_sold: number;
}

export interface HourlyComparisonRow {
  location_id: string;
  location_name: string;
  business_date: string;
  hour_of_day: number;
  gross_sales: number;
  order_count: number;
  avg_ticket: number;
}

export interface LocationRankingRow {
  rank: number;
  location_id: string;
  location_name: string;
  metric_value: number;
  metric_vs_avg_pct: number;
  trend_pct: number;
}

export interface DaypartComparisonRow {
  location_id: string;
  location_name: string;
  daypart: Daypart;
  total_sales: number;
  order_count: number;
  pct_of_daily_sales: number;
}

export interface LocationSummary {
  location_id: string;
  location_name: string;
  total_gross_sales: number;
  total_net_sales: number;
  total_orders: number;
  avg_daily_sales: number;
  avg_ticket: number;
  total_tips: number;
  labor_cost_pct: number;
  best_day: string | null;
  best_day_sales: number;
  worst_day: string | null;
  worst_day_sales: number;
}

// ============================================================================
// Chart Data Types
// ============================================================================

export interface TimeSeriesDataPoint {
  date: string;
  [locationId: string]: number | string; // location_id -> value, plus 'date' key
}

export interface HourlyDataPoint {
  hour: number;
  hourLabel: string;
  [locationId: string]: number | string;
}

export interface BarChartDataPoint {
  category: string;
  [locationId: string]: number | string;
}

export interface RadarDataPoint {
  metric: string;
  metricLabel: string;
  [locationId: string]: number | string;
}

export interface HeatmapCell {
  locationId: string;
  locationName: string;
  day: number; // 0-6 (Sunday-Saturday)
  dayLabel: string;
  value: number;
  intensity: "low" | "medium" | "high";
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface LocationSelectorProps {
  merchantId: string;
  selectedLocationIds: string[];
  onSelectionChange: (ids: string[]) => void;
  maxSelections?: number;
  showAllLocationsToggle?: boolean;
}

export interface TimeRangeSelectorProps {
  value: TimeRange;
  customRange?: { start: Date; end: Date };
  onChange: (
    range: TimeRange,
    customRange?: { start: Date; end: Date }
  ) => void;
  comparisonPeriod: ComparisonPeriod;
  onComparisonChange: (period: ComparisonPeriod) => void;
}

export interface MetricPickerProps {
  selectedMetrics: MetricType[];
  onChange: (metrics: MetricType[]) => void;
  maxSelections?: number;
}

export interface ComparisonChartProps {
  type: ChartType;
  data: TimeSeriesDataPoint[] | HourlyDataPoint[] | BarChartDataPoint[];
  locations: LocationInfo[];
  metric: MetricType;
  isLoading?: boolean;
  height?: number;
}

export interface LocationRankingTableProps {
  data: LocationRankingRow[];
  metric: MetricType;
  isLoading?: boolean;
  onLocationClick?: (locationId: string) => void;
}

// ============================================================================
// State Types
// ============================================================================

export interface AnalyticsFilters {
  merchantId: string;
  locationIds: string[];
  timeRange: TimeRange;
  customDateRange: { start: Date; end: Date } | null;
  comparisonPeriod: ComparisonPeriod;
  selectedMetrics: MetricType[];
  chartType: ChartType;
}

export interface LocationInfo {
  id: string;
  name: string;
  color: string;
}

export interface SavedComparisonView {
  id: string;
  merchant_id: string;
  created_by_user_id: string;
  name: string;
  description: string | null;
  location_ids: string[];
  metrics: MetricType[];
  default_time_range: TimeRange;
  chart_type: ChartType;
  show_comparison_period: boolean;
  comparison_period: ComparisonPeriod;
  color_assignments: Record<string, string>;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Metric Configuration
// ============================================================================

export interface MetricConfig {
  key: MetricType;
  label: string;
  shortLabel: string;
  format: "currency" | "number" | "percentage" | "duration";
  description: string;
  category: "revenue" | "orders" | "customers" | "labor" | "performance";
  higherIsBetter: boolean;
}

export const METRIC_CONFIGS: Record<MetricType, MetricConfig> = {
  gross_sales: {
    key: "gross_sales",
    label: "Gross Sales",
    shortLabel: "Gross",
    format: "currency",
    description: "Total sales before discounts and refunds",
    category: "revenue",
    higherIsBetter: true,
  },
  net_sales: {
    key: "net_sales",
    label: "Net Sales",
    shortLabel: "Net",
    format: "currency",
    description: "Sales after discounts and refunds",
    category: "revenue",
    higherIsBetter: true,
  },
  order_count: {
    key: "order_count",
    label: "Order Count",
    shortLabel: "Orders",
    format: "number",
    description: "Total number of orders",
    category: "orders",
    higherIsBetter: true,
  },
  avg_ticket: {
    key: "avg_ticket",
    label: "Average Ticket",
    shortLabel: "Avg Ticket",
    format: "currency",
    description: "Average order value",
    category: "orders",
    higherIsBetter: true,
  },
  items_sold: {
    key: "items_sold",
    label: "Items Sold",
    shortLabel: "Items",
    format: "number",
    description: "Total items sold",
    category: "orders",
    higherIsBetter: true,
  },
  tips_total: {
    key: "tips_total",
    label: "Total Tips",
    shortLabel: "Tips",
    format: "currency",
    description: "Total tips collected",
    category: "revenue",
    higherIsBetter: true,
  },
  discounts_total: {
    key: "discounts_total",
    label: "Total Discounts",
    shortLabel: "Discounts",
    format: "currency",
    description: "Total discounts applied",
    category: "revenue",
    higherIsBetter: false,
  },
  refunds_total: {
    key: "refunds_total",
    label: "Total Refunds",
    shortLabel: "Refunds",
    format: "currency",
    description: "Total refunds issued",
    category: "revenue",
    higherIsBetter: false,
  },
  labor_cost: {
    key: "labor_cost",
    label: "Labor Cost",
    shortLabel: "Labor $",
    format: "currency",
    description: "Total labor cost",
    category: "labor",
    higherIsBetter: false,
  },
  labor_hours: {
    key: "labor_hours",
    label: "Labor Hours",
    shortLabel: "Hours",
    format: "number",
    description: "Total labor hours worked",
    category: "labor",
    higherIsBetter: false,
  },
  labor_cost_percentage: {
    key: "labor_cost_percentage",
    label: "Labor Cost %",
    shortLabel: "Labor %",
    format: "percentage",
    description: "Labor cost as percentage of net sales",
    category: "labor",
    higherIsBetter: false,
  },
  unique_customers: {
    key: "unique_customers",
    label: "Unique Customers",
    shortLabel: "Customers",
    format: "number",
    description: "Number of unique customers",
    category: "customers",
    higherIsBetter: true,
  },
  new_customers: {
    key: "new_customers",
    label: "New Customers",
    shortLabel: "New",
    format: "number",
    description: "First-time customers",
    category: "customers",
    higherIsBetter: true,
  },
  returning_customers: {
    key: "returning_customers",
    label: "Returning Customers",
    shortLabel: "Returning",
    format: "number",
    description: "Repeat customers",
    category: "customers",
    higherIsBetter: true,
  },
  avg_ticket_time_seconds: {
    key: "avg_ticket_time_seconds",
    label: "Avg Ticket Time",
    shortLabel: "Ticket Time",
    format: "duration",
    description: "Average time from order to payment",
    category: "performance",
    higherIsBetter: false,
  },
  void_count: {
    key: "void_count",
    label: "Void Count",
    shortLabel: "Voids",
    format: "number",
    description: "Number of voided orders",
    category: "performance",
    higherIsBetter: false,
  },
  void_amount: {
    key: "void_amount",
    label: "Void Amount",
    shortLabel: "Void $",
    format: "currency",
    description: "Total value of voided orders",
    category: "performance",
    higherIsBetter: false,
  },
};

// ============================================================================
// Color Palette for Locations
// ============================================================================

export const LOCATION_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
  "#6366F1", // Indigo
] as const;

export function getLocationColor(index: number): string {
  return LOCATION_COLORS[index % LOCATION_COLORS.length];
}

// ============================================================================
// Utility Types
// ============================================================================

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ComparisonDateRange {
  current: DateRange;
  previous: DateRange | null;
}

export type TrendDirection = "up" | "down" | "flat";

export interface TrendIndicator {
  direction: TrendDirection;
  value: number;
  label: string;
}

// ============================================================================
// Formatter Utilities
// ============================================================================

export function formatMetricValue(
  value: number,
  format: MetricConfig["format"]
): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case "number":
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
      }).format(value);
    case "percentage":
      return `${value.toFixed(1)}%`;
    case "duration":
      const minutes = Math.floor(value / 60);
      const seconds = Math.round(value % 60);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    default:
      return String(value);
  }
}

export function getMetricConfig(metric: MetricType): MetricConfig {
  return METRIC_CONFIGS[metric];
}

// ============================================================================
// Date Range Helpers
// ============================================================================

export function getDateRangeFromTimeRange(
  timeRange: TimeRange,
  customRange?: { start: Date; end: Date }
): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (timeRange) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    }
    case "7d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: today };
    }
    case "30d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: today };
    }
    case "mtd": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end: today };
    }
    case "qtd": {
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), quarterMonth, 1);
      return { start, end: today };
    }
    case "ytd": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start, end: today };
    }
    case "custom":
      if (customRange) {
        return customRange;
      }
      // Default to last 7 days if no custom range provided
      return getDateRangeFromTimeRange("7d");
    default:
      return getDateRangeFromTimeRange("7d");
  }
}

export function getComparisonDateRange(
  currentRange: DateRange,
  comparisonPeriod: ComparisonPeriod
): DateRange | null {
  if (comparisonPeriod === "none") {
    return null;
  }

  const daysDiff =
    Math.ceil(
      (currentRange.end.getTime() - currentRange.start.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  switch (comparisonPeriod) {
    case "previous_period": {
      const end = new Date(currentRange.start);
      end.setDate(end.getDate() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - daysDiff + 1);
      return { start, end };
    }
    case "same_period_last_year": {
      const start = new Date(currentRange.start);
      start.setFullYear(start.getFullYear() - 1);
      const end = new Date(currentRange.end);
      end.setFullYear(end.getFullYear() - 1);
      return { start, end };
    }
    case "same_period_last_month": {
      const start = new Date(currentRange.start);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(currentRange.end);
      end.setMonth(end.getMonth() - 1);
      return { start, end };
    }
    default:
      return null;
  }
}

export function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ============================================================================
// Order Analytics Types (Phase 1)
// ============================================================================

/** A1 — Revenue Breakdown Card */
export interface RevenueBreakdown {
  subtotal: number;
  tax: number;
  tips: number;
  serviceCharges: number;
  discounts: number;
  netRevenue: number;
  byDate: Array<{
    date: string;
    subtotal: number;
    tax: number;
    tips: number;
    serviceCharges: number;
    discounts: number;
  }>;
}

/** A2 — Dual Pricing Comparison */
export interface DualPricingComparison {
  cardRevenue: number;
  cashRevenue: number;
  cardTransactions: number;
  cashTransactions: number;
  cashDiscountSavings: number;
  hasDualPricing: boolean;
  byDate: Array<{
    date: string;
    cardRevenue: number;
    cashRevenue: number;
  }>;
}

/** A3 — Discount Impact Card */
export interface DiscountImpact {
  totalDiscounts: number;
  discountedOrderCount: number;
  totalOrderCount: number;
  discountedOrderPercent: number;
  avgDiscountPerOrder: number;
  bySource: Array<{ source: string; amount: number; count: number }>;
  topDiscounts: Array<{ name: string; amount: number; count: number }>;
}

/** Sales Summary Report Row */
export interface SalesSummaryRow {
  date: string;
  orderCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  tips: number;
  refunds: number;
}

export interface SalesChannelSummary {
  channel: OrderSource;
  label: string;
  orders: number;
  gross: number;
  net: number;
  avgTicket: number;
}

export interface SalesSummaryReportData {
  rows: SalesSummaryRow[];
  byChannel: SalesChannelSummary[];
}

/** Hourly Sales Report Row */
export interface HourlySalesRow {
  hour: number;
  hourLabel: string;
  orderCount: number;
  grossSales: number;
  avgOrderValue: number;
}

// ============================================================================
// Kitchen Performance Analytics Types (Phase 2)
// ============================================================================

/** Station Performance Stats */
export interface KitchenStationStats {
  station_id: string;
  display_name: string;
  total_items: number;
  avg_prep_minutes: number;
  auto_bumped: number;
  manual_completed: number;
  alert_threshold_minutes: number;
  auto_bump_threshold_minutes: number;
}

/** Kitchen Heatmap Cell (hour x day of week) */
export interface KitchenHeatmapCell {
  hour_of_day: number;
  day_of_week: number;
  avg_ticket_minutes: number;
}

/** Rush Order Statistics */
export interface RushStats {
  rush_items: number;
  total_items: number;
  rush_percentage: number;
  avg_rush_time_minutes: number;
  avg_normal_time_minutes: number;
}

/** Auto-Bump Statistics */
export interface AutoBumpStats {
  auto_bumped: number;
  manual_completed: number;
  total_items: number;
  auto_bump_rate: number;
}

/** Daily Trend Data Point */
export interface DailyTrend {
  date: string;
  avg_ticket_minutes: number;
}

/** K1 — Kitchen Performance Stats (RPC Response) */
export interface KitchenPerformanceStats {
  avg_ticket_time_minutes: number;
  total_items_processed: number;
  by_station: KitchenStationStats[];
  by_hour_and_day: KitchenHeatmapCell[];
  rush_stats: RushStats;
  auto_bump_stats: AutoBumpStats;
  daily_trend: DailyTrend[];
}

// ============================================================================
// Table & Dine-In Performance Analytics Types (Phase 3)
// ============================================================================

/** Party Size Bucket for Turn Time Analysis */
export interface TableTurnBucket {
  bucket: '1-2' | '3-4' | '5-6' | '7+';
  avg_turn_time_minutes: number;
  sessions: number;
}

/** Service Phase Timing Data */
export interface ServicePhase {
  phase: 'seated_to_order' | 'order_to_food' | 'food_to_check' | 'check_to_payment' | 'payment_to_cleared';
  avg_minutes: number;
  sessions: number;
}

/** Revenue Per Available Seat Hour (RevPASH) by Hour */
export interface RevPASHByHour {
  hour: number;
  revpash: number;
  covers: number;
}

/** Per-Table Utilization Statistics */
export interface TableUtilizationRow {
  table_id: string;
  table_name: string;
  capacity: number;
  section_name: string;
  total_sessions: number;
  avg_turn_time_minutes: number;
  total_revenue: number;
  total_covers: number;
  revpash: number;
}

/** Per-Section Statistics */
export interface SectionStatsRow {
  section_name: string;
  total_sessions: number;
  total_revenue: number;
  avg_turn_time_minutes: number;
}

/** C1-C6 — Table Performance Stats (RPC Response) */
export interface TablePerformanceStats {
  avg_turn_time_minutes: number;
  total_sessions: number;
  total_covers: number;
  by_party_size: TableTurnBucket[];
  daily_trend: Array<{
    date: string;
    avg_turn_time_minutes: number;
    sessions: number;
  }>;
  service_phases: ServicePhase[];
  hourly_revpash: RevPASHByHour[];
  table_utilization: TableUtilizationRow[];
  section_stats: SectionStatsRow[];
}

// ============================================================================
// Staff Performance Analytics Types (Phase 4)
// ============================================================================

/** D1 — Per-server leaderboard row */
export interface ServerLeaderboardRow {
  staff_id: string;
  staff_name: string;
  role: string;
  total_sales: number;
  avg_check_size: number;
  total_tips: number;
  avg_tip_pct: number;
  tables_turned: number;
  avg_table_turn_minutes: number;
  order_count: number;
}

/** D2 — Tips analysis summary */
export interface TipsAnalysis {
  total_tips: number;
  avg_tip_pct: number;
  cash_tips: number;
  card_tips: number;
  tip_distribution: Array<{ bucket: string; count: number }>;
  by_staff: Array<{ staff_id: string; staff_name: string; total_tips: number; avg_tip_pct: number }>;
}

/** D3 — Staff order activity row */
export interface StaffOrderActivityRow {
  staff_id: string;
  staff_name: string;
  orders_created: number;
  payments_processed: number;
  voids_count: number;
  void_amount: number;
  refunds_count: number;
  refund_amount: number;
}

/** D1-D3 — Staff Performance Stats (RPC response root) */
export interface StaffPerformanceStats {
  total_active_staff: number;
  total_orders: number;
  total_tips: number;
  avg_tip_pct: number;
  leaderboard: ServerLeaderboardRow[];
  tips_analysis: TipsAnalysis;
  order_activity: StaffOrderActivityRow[];
}

// ============================================================================
// Order Flow & Issues Analytics Types (Phase 5)
// ============================================================================

/** E1 — A single step in the order lifecycle funnel */
export interface OrderFunnelStep {
  status: string;
  label: string;
  count: number;
  pct_of_total: number;
}

/** E2 — Per-reason breakdown for refunds */
export interface RefundReasonRow {
  reason: string;
  count: number;
  total_amount: number;
}

/** E2 — Per-item void/refund attribution */
export interface TopVoidedItem {
  item_name: string;
  void_count: number;
  void_amount: number;
}

/** E2 — Per-staff void attribution */
export interface StaffVoidRow {
  staff_id: string;
  staff_name: string;
  void_count: number;
  void_amount: number;
}

/** E3 — Revenue/count per order type */
export interface OrderTypeStats {
  order_type: string;
  count: number;
  total_revenue: number;
  avg_order_value: number;
  pct_of_total: number;
}

/** E4 — Avg completion time per order type */
export interface CompletionTimeRow {
  order_type: string;
  avg_minutes: number;
  order_count: number;
  min_minutes: number;
  max_minutes: number;
}

/** E1-E4 — Order Flow Stats (RPC response root) */
export interface OrderFlowStats {
  total_orders: number;
  completion_rate: number;
  cancellation_rate: number;
  void_rate: number;
  funnel: OrderFunnelStep[];
  void_refund: {
    total_voids: number;
    void_amount: number;
    total_refunds: number;
    refund_amount: number;
    by_reason: RefundReasonRow[];
    top_voided_items: TopVoidedItem[];
    staff_voids: StaffVoidRow[];
  };
  order_types: OrderTypeStats[];
  completion_times: CompletionTimeRow[];
}
