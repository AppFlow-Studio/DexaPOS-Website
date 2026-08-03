import {
  ORDER_SOURCE_META,
  type OrderSource,
} from "@/lib/orderout/platform";

export type ReportChannelSelection = OrderSource | "all";

export const REPORT_CHANNEL_OPTIONS: ReadonlyArray<{
  value: ReportChannelSelection;
  label: string;
}> = [
  { value: "all", label: "All Channels" },
  ...(Object.entries(ORDER_SOURCE_META) as Array<
    [OrderSource, (typeof ORDER_SOURCE_META)[OrderSource]]
  >).map(([value, metadata]) => ({
    value,
    label: metadata.label,
  })),
];

export function toOrderSourceRpcParam(
  selection: ReportChannelSelection | null | undefined
): OrderSource | null {
  return !selection || selection === "all" ? null : selection;
}

export interface BusinessDayChannelSummary {
  channel: OrderSource;
  label: string;
  orders: number;
  gross: number;
  net: number;
  avg_ticket: number;
}

export interface BusinessDaySummaryV2 {
  by_channel: BusinessDayChannelSummary[];
  [key: string]: unknown;
}

export interface SalesByItemReportV2Item {
  item_name: string;
  category: string;
  quantity_sold: number;
  gross_sales: number;
  net_sales: number;
}

export interface PaymentSummaryStatsV2Row {
  total_transactions: number | string | null;
  total_failed: number | string | null;
  overall_failure_rate: number | string | null;
  total_chargebacks: number | string | null;
  total_chargeback_amount: number | string | null;
}

export interface AdminTransactionSummaryV2Row {
  channel: OrderSource;
  channel_label: string;
  current_period_from: string | null;
  current_period_to: string | null;
  previous_period_from: string | null;
  previous_period_to: string | null;
  current_total_transactions: number | string | null;
  previous_total_transactions: number | string | null;
  current_card_revenue: number | string | null;
  previous_card_revenue: number | string | null;
  current_card_count: number | string | null;
  previous_card_count: number | string | null;
  current_cash_revenue: number | string | null;
  previous_cash_revenue: number | string | null;
  current_cash_count: number | string | null;
  previous_cash_count: number | string | null;
  current_total_revenue: number | string | null;
  previous_total_revenue: number | string | null;
  current_avg_tip: number | string | null;
  previous_avg_tip: number | string | null;
  current_avg_tip_pct: number | string | null;
  previous_avg_tip_pct: number | string | null;
  current_void_return_count: number | string | null;
  previous_void_return_count: number | string | null;
  current_void_return_amount: number | string | null;
  previous_void_return_amount: number | string | null;
  current_void_rate_pct: number | string | null;
  previous_void_rate_pct: number | string | null;
}

export interface TransactionSummaryPeriod {
  totalTransactions: number;
  cardRevenue: number;
  cardCount: number;
  cashRevenue: number;
  cashCount: number;
  totalRevenue: number;
  avgTip: number;
  avgTipPct: number;
  voidReturnCount: number;
  voidReturnAmount: number;
  voidRatePct: number;
}

export interface TransactionChannelSummary {
  channel: OrderSource;
  label: string;
  current: TransactionSummaryPeriod;
  previous: TransactionSummaryPeriod;
}

export interface AggregatedAdminTransactionSummary {
  currentPeriodFrom?: string;
  currentPeriodTo?: string;
  previousPeriodFrom?: string;
  previousPeriodTo?: string;
  current: TransactionSummaryPeriod;
  previous: TransactionSummaryPeriod;
  channels: TransactionChannelSummary[];
}

export interface SalesByItemReportV2Args {
  p_merchant_id: string;
  p_location_id: string | null;
  p_start_date: string;
  p_end_date: string;
  p_order_source: OrderSource | null;
}

export function buildSalesByItemReportV2Args(input: {
  merchantId: string;
  locationId: string | null;
  dateFrom: Date;
  dateTo: Date;
  orderSource?: ReportChannelSelection | null;
}): SalesByItemReportV2Args {
  return {
    p_merchant_id: input.merchantId,
    p_location_id: input.locationId === "all" ? null : input.locationId,
    p_start_date: input.dateFrom.toISOString(),
    p_end_date: input.dateTo.toISOString(),
    p_order_source: toOrderSourceRpcParam(input.orderSource),
  };
}

function numberValue(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPeriod(
  row: AdminTransactionSummaryV2Row,
  period: "current" | "previous"
): TransactionSummaryPeriod {
  return {
    totalTransactions: numberValue(row[`${period}_total_transactions`]),
    cardRevenue: numberValue(row[`${period}_card_revenue`]),
    cardCount: numberValue(row[`${period}_card_count`]),
    cashRevenue: numberValue(row[`${period}_cash_revenue`]),
    cashCount: numberValue(row[`${period}_cash_count`]),
    totalRevenue: numberValue(row[`${period}_total_revenue`]),
    avgTip: numberValue(row[`${period}_avg_tip`]),
    avgTipPct: numberValue(row[`${period}_avg_tip_pct`]),
    voidReturnCount: numberValue(row[`${period}_void_return_count`]),
    voidReturnAmount: numberValue(row[`${period}_void_return_amount`]),
    voidRatePct: numberValue(row[`${period}_void_rate_pct`]),
  };
}

function aggregatePeriod(
  channels: TransactionChannelSummary[],
  period: "current" | "previous"
): TransactionSummaryPeriod {
  const totals = channels.reduce(
    (sum, channel) => {
      const metrics = channel[period];
      sum.totalTransactions += metrics.totalTransactions;
      sum.cardRevenue += metrics.cardRevenue;
      sum.cardCount += metrics.cardCount;
      sum.cashRevenue += metrics.cashRevenue;
      sum.cashCount += metrics.cashCount;
      sum.totalRevenue += metrics.totalRevenue;
      sum.tipAmountWeighted += metrics.avgTip * metrics.cardCount;
      sum.tipPctWeighted += metrics.avgTipPct * metrics.cardCount;
      sum.voidReturnCount += metrics.voidReturnCount;
      sum.voidReturnAmount += metrics.voidReturnAmount;
      return sum;
    },
    {
      totalTransactions: 0,
      cardRevenue: 0,
      cardCount: 0,
      cashRevenue: 0,
      cashCount: 0,
      totalRevenue: 0,
      tipAmountWeighted: 0,
      tipPctWeighted: 0,
      voidReturnCount: 0,
      voidReturnAmount: 0,
    }
  );

  return {
    totalTransactions: totals.totalTransactions,
    cardRevenue: totals.cardRevenue,
    cardCount: totals.cardCount,
    cashRevenue: totals.cashRevenue,
    cashCount: totals.cashCount,
    totalRevenue: totals.totalRevenue,
    avgTip:
      totals.cardCount > 0
        ? totals.tipAmountWeighted / totals.cardCount
        : 0,
    avgTipPct:
      totals.cardCount > 0 ? totals.tipPctWeighted / totals.cardCount : 0,
    voidReturnCount: totals.voidReturnCount,
    voidReturnAmount: totals.voidReturnAmount,
    voidRatePct:
      totals.totalTransactions > 0
        ? (totals.voidReturnCount / totals.totalTransactions) * 100
        : 0,
  };
}

export function aggregateAdminTransactionSummary(
  rows: AdminTransactionSummaryV2Row[]
): AggregatedAdminTransactionSummary | null {
  if (rows.length === 0) return null;

  const channels = rows.map((row) => ({
    channel: row.channel,
    label: row.channel_label || ORDER_SOURCE_META[row.channel].label,
    current: mapPeriod(row, "current"),
    previous: mapPeriod(row, "previous"),
  }));
  const first = rows[0];

  return {
    currentPeriodFrom: first.current_period_from || undefined,
    currentPeriodTo: first.current_period_to || undefined,
    previousPeriodFrom: first.previous_period_from || undefined,
    previousPeriodTo: first.previous_period_to || undefined,
    current: aggregatePeriod(channels, "current"),
    previous: aggregatePeriod(channels, "previous"),
    channels,
  };
}
