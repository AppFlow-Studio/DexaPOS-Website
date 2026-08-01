import { describe, expect, it } from "vitest";
import {
  REPORT_CHANNEL_OPTIONS,
  aggregateAdminTransactionSummary,
  buildSalesByItemReportV2Args,
  toOrderSourceRpcParam,
  type AdminTransactionSummaryV2Row,
} from "../order-channel";

function transactionRow(
  overrides: Partial<AdminTransactionSummaryV2Row>
): AdminTransactionSummaryV2Row {
  return {
    channel: "pos",
    channel_label: "In-Store",
    current_period_from: "2026-07-01",
    current_period_to: "2026-07-31",
    previous_period_from: "2026-06-01",
    previous_period_to: "2026-06-30",
    current_total_transactions: 0,
    previous_total_transactions: 0,
    current_card_revenue: 0,
    previous_card_revenue: 0,
    current_card_count: 0,
    previous_card_count: 0,
    current_cash_revenue: 0,
    previous_cash_revenue: 0,
    current_cash_count: 0,
    previous_cash_count: 0,
    current_total_revenue: 0,
    previous_total_revenue: 0,
    current_avg_tip: 0,
    previous_avg_tip: 0,
    current_avg_tip_pct: 0,
    previous_avg_tip_pct: 0,
    current_void_return_count: 0,
    previous_void_return_count: 0,
    current_void_return_amount: 0,
    previous_void_return_amount: 0,
    current_void_rate_pct: 0,
    previous_void_rate_pct: 0,
    ...overrides,
  };
}

describe("report channel filters", () => {
  it("uses the canonical source values and merchant-facing labels", () => {
    expect(REPORT_CHANNEL_OPTIONS).toEqual([
      { value: "all", label: "All Channels" },
      { value: "pos", label: "In-Store" },
      { value: "kiosk", label: "Kiosk" },
      { value: "online_store", label: "Online" },
      { value: "orderout", label: "Delivery Apps" },
    ]);
  });

  it("preserves legacy all-channel behavior by passing NULL", () => {
    expect(toOrderSourceRpcParam("all")).toBeNull();
    expect(toOrderSourceRpcParam(null)).toBeNull();
    expect(toOrderSourceRpcParam(undefined)).toBeNull();
    expect(toOrderSourceRpcParam("kiosk")).toBe("kiosk");
  });

  it("builds the v2 item-sales arguments with a nullable source", () => {
    const input = {
      merchantId: "merchant-1",
      locationId: "all",
      dateFrom: new Date("2026-07-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-31T23:59:59.999Z"),
    };

    expect(
      buildSalesByItemReportV2Args({ ...input, orderSource: "all" })
    ).toMatchObject({
      p_merchant_id: "merchant-1",
      p_location_id: null,
      p_order_source: null,
    });
    expect(
      buildSalesByItemReportV2Args({
        ...input,
        locationId: "location-1",
        orderSource: "kiosk",
      })
    ).toMatchObject({
      p_location_id: "location-1",
      p_order_source: "kiosk",
    });
  });
});

describe("HQ transaction channel aggregation", () => {
  it("preserves channel rows and recomputes the overall summary", () => {
    const result = aggregateAdminTransactionSummary([
      transactionRow({
        channel: "pos",
        channel_label: "In-Store",
        current_total_transactions: "2",
        current_card_revenue: "20",
        current_card_count: "2",
        current_total_revenue: "20",
        current_avg_tip: "2",
        current_avg_tip_pct: "10",
      }),
      transactionRow({
        channel: "kiosk",
        channel_label: "Kiosk",
        current_total_transactions: "1",
        current_cash_revenue: "8",
        current_cash_count: "1",
        current_total_revenue: "8",
        current_void_return_count: "1",
        current_void_return_amount: "3",
      }),
    ]);

    expect(result?.channels.map((channel) => channel.channel)).toEqual([
      "pos",
      "kiosk",
    ]);
    expect(result?.current).toMatchObject({
      totalTransactions: 3,
      cardRevenue: 20,
      cashRevenue: 8,
      totalRevenue: 28,
      avgTip: 2,
      avgTipPct: 10,
      voidReturnCount: 1,
      voidReturnAmount: 3,
    });
    expect(result?.current.voidRatePct).toBeCloseTo(100 / 3);
  });

  it("returns null for an empty RPC response", () => {
    expect(aggregateAdminTransactionSummary([])).toBeNull();
  });
});
