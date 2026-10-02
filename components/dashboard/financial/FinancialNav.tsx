"use client";

import { WorkspaceNav } from "@/components/dashboard/shell/WorkspaceNav";
import { financialSections, getFinancialSection } from "@/lib/navigation/financial";

export function FinancialNav({ pathname }: { pathname: string }) {
  return (
    <WorkspaceNav
      label="Financial sections"
      sections={financialSections}
      activeHref={getFinancialSection(pathname)?.href}
    />
  );
}
