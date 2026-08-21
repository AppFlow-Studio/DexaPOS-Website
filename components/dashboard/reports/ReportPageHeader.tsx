"use client";

import { LocationIndicator, PageHeader } from "@/components/dashboard/shell";

export function ReportPageHeader({
  title,
  description,
  locationName,
  actions,
}: {
  title: string;
  description: string;
  locationName?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      subtitle={description}
      backHref="/dashboard/reports"
      backLabel="Back to Reports"
      indicator={
        <LocationIndicator
          isAllLocations={!locationName}
          locationName={locationName}
        />
      }
      actions={actions}
      stackActionsBelowIndicatorOnMobile
    />
  );
}
