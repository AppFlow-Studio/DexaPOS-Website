// tests/order-type-labels.test.ts
import { describe, it, expect } from "vitest";
import {
  ORDER_TYPE_ORDER,
  ORDER_TYPE_LABELS,
  orderTypeLabel,
} from "@/lib/constants/order-type";
import type { OrderType } from "@/types/order-management";

// The single source of truth for order-type display labels. These canonical
// strings are signed off by product (esp. "QR Dine-In"); changing them is a
// deliberate decision, not an accident — this test pins them so labels can't
// silently drift across the filter, order list, detail sheet, and receipts.
const CANONICAL: Record<OrderType, string> = {
  dine_in: "Dine In",
  qr_dine_in: "QR Dine-In",
  takeout: "Takeout",
  delivery: "Delivery",
  online: "Online",
  catering: "Catering",
};

describe("order-type labels", () => {
  it("maps every enum value to its canonical label", () => {
    expect(ORDER_TYPE_LABELS).toEqual(CANONICAL);
  });

  it("orders the same 6 values shown in the Type filter without dupes", () => {
    expect([...ORDER_TYPE_ORDER].sort()).toEqual(
      (Object.keys(CANONICAL) as OrderType[]).sort()
    );
    expect(new Set(ORDER_TYPE_ORDER).size).toBe(ORDER_TYPE_ORDER.length);
  });

  it("orderTypeLabel() resolves known values", () => {
    for (const [value, label] of Object.entries(CANONICAL)) {
      expect(orderTypeLabel(value)).toBe(label);
    }
  });

  it("orderTypeLabel() degrades gracefully for unknown / empty input", () => {
    expect(orderTypeLabel(null)).toBe("");
    expect(orderTypeLabel(undefined)).toBe("");
    expect(orderTypeLabel("")).toBe("");
    // Unknown future enum value: humanize rather than render a raw snake_case token.
    expect(orderTypeLabel("drive_thru")).toBe("drive thru");
  });
});
