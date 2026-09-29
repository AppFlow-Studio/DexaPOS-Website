import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { ChartEmpty, isEmptySeries } from "../ChartEmpty";

// UI-DESIGN-SYSTEM §4.9: an empty chart says so in words, at the chart's own
// height, and a series of zeros counts as empty.

describe("isEmptySeries", () => {
  const orders = (row: { orders: number }) => row.orders;
  const refunds = (row: { refunds: number }) => row.refunds;

  it("treats no rows as empty", () => {
    expect(isEmptySeries([], orders)).toBe(true);
  });

  it("treats rows whose measures are all zero as empty", () => {
    // A feed that always returns 24 hourly buckets draws a bare frame when
    // every bucket is 0 — the length check alone never fires.
    expect(isEmptySeries([{ orders: 0 }, { orders: 0 }], orders)).toBe(true);
  });

  it("is not empty once any measure on any row is non-zero", () => {
    const rows = [
      { orders: 0, refunds: 0 },
      { orders: 0, refunds: 2 },
    ];

    expect(isEmptySeries(rows, orders, refunds)).toBe(false);
  });
});

describe("ChartEmpty", () => {
  it("states the title and the hint at the chart's height", () => {
    const html = renderToString(
      <ChartEmpty height={300} title="No orders in this period" hint="Orders will appear here." />,
    );

    expect(html).toContain("No orders in this period");
    expect(html).toContain("Orders will appear here.");
    expect(html).toContain("height:300px");
  });
});
