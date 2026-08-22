import { describe, expect, it } from "vitest";

import {
  inventoryStockState,
  purchaseOrderStatusStyle,
} from "@/lib/constants/inventory-status";
import {
  deviceLifecycleStatusStyle,
  deviceWarrantyState,
} from "@/lib/constants/device-status";
import { cashDrawerStatus } from "@/lib/constants/cash-drawer-status";

describe("dashboard domain status presentation", () => {
  it("derives stock state from the inventory mode and threshold", () => {
    expect(inventoryStockState("out_of_stock", 12, 3)).toBe("out_of_stock");
    expect(inventoryStockState("in_stock", 0, 3)).toBe("in_stock");
    expect(inventoryStockState("stock_tracking", 0, 3)).toBe("out_of_stock");
    expect(inventoryStockState("stock_tracking", 3, 3)).toBe("low_stock");
    expect(inventoryStockState("stock_tracking", 4, 3)).toBe("in_stock");
  });

  it("falls back to a neutral purchase-order style for unknown states", () => {
    expect(purchaseOrderStatusStyle("not-a-real-status")).toMatchObject({
      dot: "bg-slate-400",
      text: "text-slate-600 dark:text-slate-400",
      bg: "bg-slate-100 dark:bg-slate-800/40",
    });
  });

  it("classifies device warranties at the expired and 60-day boundaries", () => {
    const today = new Date("2026-08-14T12:00:00Z");

    expect(deviceWarrantyState("2026-08-13T00:00:00Z", today).state).toBe("expired");
    expect(deviceWarrantyState("2026-10-13T00:00:00Z", today).state).toBe("expiring");
    expect(deviceWarrantyState("2026-10-14T00:00:00Z", today).state).toBe("active");
    expect(deviceWarrantyState(null, today).state).toBe("unknown");
  });

  it("provides a complete lifecycle badge style", () => {
    expect(deviceLifecycleStatusStyle("deployed")).toEqual({
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    });
  });

  it("prioritizes inactive drawer state over session state", () => {
    expect(cashDrawerStatus(false, true)).toBe("inactive");
    expect(cashDrawerStatus(true, true)).toBe("open");
    expect(cashDrawerStatus(true, false)).toBe("closed");
  });
});
