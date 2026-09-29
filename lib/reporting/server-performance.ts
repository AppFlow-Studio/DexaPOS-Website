import { orderSourceLabel } from "@/lib/orderout/platform";
import type {
  ServerLeaderboardRow,
  StaffPerformanceStats,
} from "@/types/analytics";

/** A Server Performance table row: a staff member, or a no-staff channel bucket. */
export interface ServerPerformanceTableRow extends ServerLeaderboardRow {
  is_staff: boolean;
}

/**
 * Staff rows followed by one row per channel whose orders nobody rang up
 * (kiosk, online, delivery apps), so the table reconciles to recognized sales.
 */
export function buildServerPerformanceRows(
  data: Pick<StaffPerformanceStats, "leaderboard" | "unattributed"> | null | undefined
): ServerPerformanceTableRow[] {
  const staffRows = (data?.leaderboard ?? []).map((row) => ({
    ...row,
    is_staff: true,
  }));

  const channelRows = (data?.unattributed ?? []).map((row) => ({
    staff_id: `unattributed:${row.channel}`,
    staff_name: `${orderSourceLabel(row.channel) || "Other"} (no server)`,
    role: "",
    total_sales: row.total_sales,
    avg_check_size: row.avg_check_size,
    total_tips: row.total_tips,
    avg_tip_pct: row.avg_tip_pct,
    tables_turned: 0,
    avg_table_turn_minutes: 0,
    order_count: row.order_count,
    is_staff: false,
  }));

  return [...staffRows, ...channelRows];
}

/** Top server is chosen among staff only; tips are totalled across every row. */
export function summarizeServerPerformance(rows: ServerPerformanceTableRow[]) {
  const staffRows = rows.filter((row) => row.is_staff);
  const topServer = staffRows.reduce<ServerPerformanceTableRow | null>(
    (best, row) =>
      !best || (row.total_sales || 0) > (best.total_sales || 0) ? row : best,
    null
  );

  return {
    topServerName: topServer?.staff_name || "N/A",
    totalTips: rows.reduce((sum, row) => sum + (row.total_tips || 0), 0),
    totalSales: rows.reduce((sum, row) => sum + (row.total_sales || 0), 0),
  };
}
