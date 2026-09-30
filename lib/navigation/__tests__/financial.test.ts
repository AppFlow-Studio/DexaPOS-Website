import { describe, expect, it } from "vitest";
import { getFinancialSection, isFinancialWorkspacePath } from "../financial";

describe("financial workspace routes", () => {
  it.each([
    ["/dashboard/financial", "Overview"],
    ["/dashboard/transactions", "Transactions"],
    ["/dashboard/payments", "Payments"],
    ["/dashboard/invoices", "Invoices"],
    ["/dashboard/invoices/new", "Invoices"],
    ["/dashboard/invoices/123", "Invoices"],
  ])("selects %s", (pathname, label) => {
    expect(getFinancialSection(pathname)?.label).toBe(label);
    expect(isFinancialWorkspacePath(pathname)).toBe(true);
  });

  it.each([
    "/dashboard/payments/disputes",
    "/dashboard/reports/financials",
    "/dashboard/financial-extra",
  ])("leaves %s outside the workspace", (pathname) => {
    expect(getFinancialSection(pathname)).toBeNull();
    expect(isFinancialWorkspacePath(pathname)).toBe(false);
  });
});
