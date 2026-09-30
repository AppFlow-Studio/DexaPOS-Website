"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getPresetDates,
  type DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";

/**
 * One date range shared by every report page, so moving from Sales Overview
 * to Financials to Tax keeps the same period instead of each page opening on
 * its own default.
 *
 * - Default: the picker's "Last 30 days" (30 calendar days ending today).
 * - A relative preset ("Last 7 days", "This month" …) is stored as the preset,
 *   not as dates, so it rolls forward day by day instead of freezing on the
 *   dates it was first picked on. Only "Custom range" stores explicit dates.
 * - Kept for the browser tab session (sessionStorage): a new session starts
 *   again from "Last 30 days".
 */
export const DEFAULT_REPORT_PRESET: DatePreset = "last_30_days";

interface ReportDateRangeState {
  preset: DatePreset;
  /** ISO strings; only read when preset === "custom". */
  customFrom: string | null;
  customTo: string | null;
  setDateRange: (from: Date, to: Date) => void;
  setPreset: (preset: DatePreset) => void;
}

export const useReportDateRangeStore = create<ReportDateRangeState>()(
  persist(
    (set) => ({
      preset: DEFAULT_REPORT_PRESET,
      customFrom: null,
      customTo: null,
      // The picker calls onDateRangeChange then onPresetChange on Apply, so a
      // relative preset chosen in the picker ends up stored as that preset.
      setDateRange: (from, to) =>
        set({ preset: "custom", customFrom: from.toISOString(), customTo: to.toISOString() }),
      setPreset: (preset) => set({ preset }),
    }),
    {
      name: "report-date-range",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

/**
 * The shared report range. Drop-in for the per-page
 * `useState({ from, to })` + `useState<DatePreset>()` pair.
 */
export function useReportDateRange() {
  const preset = useReportDateRangeStore((s) => s.preset);
  const customFrom = useReportDateRangeStore((s) => s.customFrom);
  const customTo = useReportDateRangeStore((s) => s.customTo);
  const setDateRange = useReportDateRangeStore((s) => s.setDateRange);
  const setPreset = useReportDateRangeStore((s) => s.setPreset);

  // Recompute relative presets when the calendar day changes.
  const today = new Date().toDateString();

  const dateRange = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    return getPresetDates(preset === "custom" ? DEFAULT_REPORT_PRESET : preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo, today]);

  return { dateRange, preset, setDateRange, setPreset };
}
