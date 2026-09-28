"use client";

import { PageHeader } from "@/components/dashboard/shell";

export function ReportPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      subtitle={description}
      backHref="/dashboard/reports"
      backLabel="Back to Reports"
      actions={actions}
      stackActionsBelowIndicatorOnMobile
    />
  );
}
