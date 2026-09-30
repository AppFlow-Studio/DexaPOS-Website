import { describe, expect, it } from "vitest";
import { resolveInvoiceLocationId } from "../resolve-location";

const context = {
  selectedLocationId: "branch-a",
  activeLocationIds: ["branch-a", "branch-b"],
  isEditing: false,
  chosenLocationId: null,
};

describe("resolveInvoiceLocationId", () => {
  it("uses the working branch for a new invoice", () => {
    expect(resolveInvoiceLocationId(context)).toBe("branch-a");
  });

  it("asks for a branch in a multi-location overview", () => {
    expect(resolveInvoiceLocationId({ ...context, selectedLocationId: "all" })).toBeNull();
  });

  it("resolves the only branch for single-location accounts", () => {
    expect(
      resolveInvoiceLocationId({
        ...context,
        selectedLocationId: "all",
        activeLocationIds: ["branch-a"],
      }),
    ).toBe("branch-a");
  });

  it("preserves an existing invoice's branch despite the header context", () => {
    expect(
      resolveInvoiceLocationId({
        ...context,
        isEditing: true,
        existingLocationId: "branch-b",
      }),
    ).toBe("branch-b");
  });

  it("requires a choice for a legacy branchless invoice", () => {
    expect(
      resolveInvoiceLocationId({ ...context, isEditing: true, existingLocationId: null }),
    ).toBeNull();
  });

  it("honors an explicit branch choice", () => {
    expect(
      resolveInvoiceLocationId({
        ...context,
        selectedLocationId: "all",
        chosenLocationId: "branch-b",
      }),
    ).toBe("branch-b");
  });
});
