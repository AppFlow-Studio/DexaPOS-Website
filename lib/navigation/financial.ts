export const financialSections = [
  { label: "Overview", href: "/dashboard/financial" },
  { label: "Transactions", href: "/dashboard/transactions" },
  { label: "Payments", href: "/dashboard/payments" },
  { label: "Invoices", href: "/dashboard/invoices" },
] as const;

export function getFinancialSection(pathname: string) {
  // Disputes keeps its own sidebar entry rather than sharing the financial tabs.
  if (pathname === "/dashboard/payments/disputes" || pathname.startsWith("/dashboard/payments/disputes/")) {
    return null;
  }

  return financialSections.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  ) ?? null;
}

export function isFinancialWorkspacePath(pathname: string) {
  return getFinancialSection(pathname) !== null;
}
