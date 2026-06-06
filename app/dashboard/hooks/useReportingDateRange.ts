"use client";

import { useMemo } from "react";
import {
  useIsAllLocations,
  useLocationStore,
  useSelectedLocation,
} from "@/stores/location-store";
import {
  buildReportingQueryRange,
  type AppliedDateRange,
  DEFAULT_REPORTING_TIMEZONE,
} from "@/lib/reporting/date-range";

export function useReportingQueryRange(appliedRange: AppliedDateRange) {
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const locations = useLocationStore((state) => state.locations);

  const timezones = useMemo(() => {
    if (isAllLocations) {
      const locationTimezones = locations
        .map((location) => location.timezone)
        .filter(Boolean);
      return locationTimezones.length > 0
        ? locationTimezones
        : [DEFAULT_REPORTING_TIMEZONE];
    }

    return [selectedLocation?.timezone ?? DEFAULT_REPORTING_TIMEZONE];
  }, [isAllLocations, locations, selectedLocation?.timezone]);

  return useMemo(
    () => buildReportingQueryRange(appliedRange, timezones),
    [appliedRange.from.getTime(), appliedRange.to.getTime(), timezones]
  );
}
