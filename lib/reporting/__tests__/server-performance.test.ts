import { describe, expect, it } from "vitest";
import {
  buildServerPerformanceRows,
  summarizeServerPerformance,
} from "../server-performance";
import type {
  ServerLeaderboardRow,
  UnattributedChannelRow,
} from "@/types/analytics";

function staffRow(overrides: Partial<ServerLeaderboardRow>): ServerLeaderboardRow {
  return {
    staff_id: "staff-1",
    staff_name: "Sadem Awawdeh",
    role: "clerk",
    total_sales: 0,
    avg_check_size: 0,
    total_tips: 0,
    avg_tip_pct: 0,
    tables_turned: 0,
    avg_table_turn_minutes: 0,
    order_count: 0,
    ...overrides,
  };
}

function channelRow(
  overrides: Partial<UnattributedChannelRow>
): UnattributedChannelRow {
  return {
    channel: "kiosk",
    order_count: 0,
    total_sales: 0,
    avg_check_size: 0,
    total_tips: 0,
    avg_tip_pct: 0,
    ...overrides,
  };
}

// Prod repro: 460 BREAD AND BUTTER CORP, 2026-09-19..26.
const leaderboard = [
  staffRow({ order_count: 76, total_sales: 703.89, avg_check_size: 8.51 }),
];
const unattributed = [
  channelRow({
    order_count: 138,
    total_sales: 2323.32,
    avg_check_size: 15.46,
    total_tips: 159.38,
    avg_tip_pct: 7.47,
  }),
];

describe("buildServerPerformanceRows", () => {
  it("appends a labelled row per no-staff channel after the staff rows", () => {
    const rows = buildServerPerformanceRows({ leaderboard, unattributed });

    expect(rows.map((row) => row.staff_name)).toEqual([
      "Sadem Awawdeh",
      "Kiosk (no server)",
    ]);
    expect(rows.map((row) => row.is_staff)).toEqual([true, false]);
    expect(rows[1]).toMatchObject({
      staff_id: "unattributed:kiosk",
      order_count: 138,
      total_sales: 2323.32,
      total_tips: 159.38,
    });
  });

  it("reconciles to the period's recognized orders and sales", () => {
    const rows = buildServerPerformanceRows({ leaderboard, unattributed });

    expect(rows.reduce((sum, row) => sum + row.order_count, 0)).toBe(214);
    expect(summarizeServerPerformance(rows).totalSales).toBeCloseTo(3027.21, 2);
  });

  it("tolerates an RPC response without the unattributed key", () => {
    expect(buildServerPerformanceRows({ leaderboard })).toHaveLength(1);
    expect(buildServerPerformanceRows(null)).toEqual([]);
  });
});

describe("summarizeServerPerformance", () => {
  it("never names a channel bucket as top server, but totals its tips", () => {
    const summary = summarizeServerPerformance(
      buildServerPerformanceRows({ leaderboard, unattributed })
    );

    expect(summary.topServerName).toBe("Sadem Awawdeh");
    expect(summary.totalTips).toBeCloseTo(159.38, 2);
  });

  it("falls back to N/A when only channel buckets have sales", () => {
    const summary = summarizeServerPerformance(
      buildServerPerformanceRows({ leaderboard: [], unattributed })
    );

    expect(summary.topServerName).toBe("N/A");
  });
});
