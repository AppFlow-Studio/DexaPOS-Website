import { describe, expect, it } from "vitest";
import { buildMethodBreakdown } from "../method-breakdown";
import type { PaymentSummary } from "@/types/payment";

type ByMethod = PaymentSummary["byMethod"];

function byMethod(entries: Array<[string, number]>): ByMethod {
  return entries.map(([method, amount]) => ({
    method: method as ByMethod[number]["method"],
    count: 1,
    amount,
  }));
}

describe("buildMethodBreakdown", () => {
  it("labels and colors each method from the token map", () => {
    const rows = buildMethodBreakdown(
      byMethod([
        ["card", 21742],
        ["cash", 54937],
        ["external", 2128],
      ])
    );

    expect(rows.map((r) => [r.label, r.color])).toEqual([
      ["Cash", "#16A34A"],
      ["Card", "#0C4FD1"],
      ["External", "#F59E0B"],
    ]);
  });

  it("sorts descending by amount", () => {
    const rows = buildMethodBreakdown(
      byMethod([
        ["external", 2128],
        ["cash", 54937],
        ["card", 21742],
      ])
    );
    expect(rows.map((r) => r.amount)).toEqual([54937, 21742, 2128]);
  });

  // AC 1 — no float drift in the displayed percent math.
  it("keeps percentages summing to exactly 100 for repeating thirds", () => {
    const rows = buildMethodBreakdown(
      byMethod([
        ["card", 100],
        ["cash", 100],
        ["external", 100],
      ])
    );
    // Sum in tenths — adding the displayed floats would itself drift.
    const totalTenths = rows.reduce((sum, r) => sum + Math.round(r.percent * 10), 0);
    expect(totalTenths).toBe(1000);
    // Largest-remainder gives the leftover tenth to one row, not all three.
    expect(rows.map((r) => r.percent).sort()).toEqual([33.3, 33.3, 33.4]);
  });

  it("keeps percentages summing to 100 across many uneven splits", () => {
    const cases: Array<Array<[string, number]>> = [
      [["card", 0.01], ["cash", 0.01], ["external", 0.01]],
      [["card", 1], ["cash", 2], ["external", 7], ["gift_card", 11]],
      [["card", 1234.56], ["cash", 78.9], ["external", 0.55]],
      [["card", 999999.99], ["cash", 0.01]],
    ];

    for (const entries of cases) {
      const rows = buildMethodBreakdown(byMethod(entries));
      const totalTenths = rows.reduce(
        (sum, r) => sum + Math.round(r.percent * 10),
        0
      );
      expect(totalTenths).toBe(1000);
    }
  });

  it("reconciles summed amounts with the source total to the cent", () => {
    // 0.1 + 0.2 style inputs: summing as floats would drift.
    const rows = buildMethodBreakdown(
      byMethod([
        ["card", 0.1],
        ["cash", 0.2],
        ["external", 0.3],
      ])
    );
    const summedCents = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
    expect(summedCents).toBe(60);
  });

  // AC 5 — methods with $0 don't render.
  it("omits zero-amount methods", () => {
    const rows = buildMethodBreakdown(
      byMethod([
        ["card", 500],
        ["cash", 0],
        ["gift_card", 0],
      ])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Card");
    expect(rows[0].percent).toBe(100);
  });

  // QA matrix — single method renders a full ring / one legend row.
  it("gives a single method 100 percent", () => {
    const rows = buildMethodBreakdown(byMethod([["cash", 42.5]]));
    expect(rows).toEqual([
      expect.objectContaining({ label: "Cash", amount: 42.5, percent: 100 }),
    ]);
  });

  // AC 4 — empty range renders no phantom ring.
  it("returns no rows for an empty or undefined range", () => {
    expect(buildMethodBreakdown([])).toEqual([]);
    expect(buildMethodBreakdown(undefined)).toEqual([]);
    expect(buildMethodBreakdown(byMethod([["card", 0]]))).toEqual([]);
  });

  it("falls back to a humanized label and neutral color for unmapped methods", () => {
    const rows = buildMethodBreakdown(byMethod([["some_new_method", 10]]));
    expect(rows[0].label).toBe("Some New Method");
    expect(rows[0].color).toBe("#64748B");
  });

  it("maps every payment_method enum member to a distinct color", () => {
    // Mirrors Database["public"]["Enums"]["payment_method"].
    const enumMembers = [
      "cash",
      "card_spinapi",
      "card_dvpaylite",
      "card_manual",
      "gift_card",
      "house_account",
      "external",
      "card",
      "card_online",
    ];

    const rows = buildMethodBreakdown(
      byMethod(enumMembers.map((m, i) => [m, i + 1]))
    );

    expect(rows).toHaveLength(enumMembers.length);
    // No member falls through to the neutral fallback...
    expect(rows.every((r) => r.color !== "#64748B")).toBe(true);
    // ...and no two methods share a hue.
    expect(new Set(rows.map((r) => r.color)).size).toBe(enumMembers.length);
  });
});
