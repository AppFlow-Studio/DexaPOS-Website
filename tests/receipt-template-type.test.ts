import { describe, expect, it } from "vitest";
import {
  DB_TEMPLATE_TYPES,
  TEMPLATE_TYPE_IDS,
  fromDbTemplateType,
  toDbTemplateType,
} from "@/lib/receipts/template-type";
import {
  DEFAULT_SIGNATURE_DISCLAIMER,
  printsSignatureBlock,
  resolveSignatureDisclaimer,
} from "@/lib/receipts/signature-block";

describe("receipt template type mapping", () => {
  it("stores the Sale Receipt as the 'receipt' row the POS prints from", () => {
    expect(toDbTemplateType("sale")).toBe("receipt");
    expect(fromDbTemplateType("receipt")).toBe("sale");
  });

  it("stores every other type under its own name", () => {
    for (const type of TEMPLATE_TYPE_IDS.filter((t) => t !== "sale")) {
      expect(toDbTemplateType(type)).toBe(type);
      expect(fromDbTemplateType(type)).toBe(type);
    }
  });

  it("round-trips every Website type", () => {
    for (const type of TEMPLATE_TYPE_IDS) {
      expect(fromDbTemplateType(toDbTemplateType(type))).toBe(type);
    }
  });

  it("does not treat a leftover or retired 'sale' row as the Sale Receipt", () => {
    expect(fromDbTemplateType("sale")).toBeNull();
    expect(fromDbTemplateType("sale_retired")).toBeNull();
  });

  it("ignores template types only the POS uses", () => {
    expect(fromDbTemplateType("refund")).toBeNull();
    expect(fromDbTemplateType("void_order")).toBeNull();
  });

  it("reads 'receipt' and never 'sale' from the database", () => {
    expect(DB_TEMPLATE_TYPES).toContain("receipt");
    expect(DB_TEMPLATE_TYPES).not.toContain("sale");
    expect(DB_TEMPLATE_TYPES).toHaveLength(TEMPLATE_TYPE_IDS.length);
  });
});

describe("cardholder signature block", () => {
  const cases = [
    { tender: "card", copy: "merchant", on: true, prints: true },
    { tender: "card", copy: "customer", on: true, prints: false },
    { tender: "cash", copy: "merchant", on: true, prints: false },
    { tender: "cash", copy: "customer", on: true, prints: false },
    { tender: "card", copy: "merchant", on: false, prints: false },
  ] as const;

  it.each(cases)(
    "$tender / $copy copy / toggle $on → prints $prints",
    ({ tender, copy, on, prints }) => {
      expect(
        printsSignatureBlock({ printSignatureLine: on, copy, tender }),
      ).toBe(prints);
    },
  );

  it("falls back to the default disclaimer when blank", () => {
    expect(resolveSignatureDisclaimer(null)).toBe(DEFAULT_SIGNATURE_DISCLAIMER);
    expect(resolveSignatureDisclaimer("")).toBe(DEFAULT_SIGNATURE_DISCLAIMER);
    expect(resolveSignatureDisclaimer("   \n ")).toBe(DEFAULT_SIGNATURE_DISCLAIMER);
  });

  it("uses the merchant's disclaimer when set", () => {
    expect(resolveSignatureDisclaimer("  All sales final.  ")).toBe(
      "All sales final.",
    );
  });
});
