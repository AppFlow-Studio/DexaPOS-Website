"use client";

import { useState } from "react";
import { useOrderAnalytics } from "../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { ReportSummaryCards } from "./components/ReportSummaryCards";
import { SalesChart } from "./components/SalesChart";
import { OrderTypeChart } from "./components/OrderTypeChart";
import { subDays } from "date-fns";

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");

  const { data: analytics, isLoading } = useOrderAnalytics(
    dateRange.from,
    dateRange.to
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateRange({ from, to });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground">
            Analyze your sales performance and order trends
          </p>
        </div>
        <div>
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        </div>
      </div>

      <ReportSummaryCards
        analytics={analytics || ({} as any)}
        isLoading={isLoading}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 lg:col-span-5">
          <SalesChart data={analytics?.salesByDate || []} />
        </div>
        <div className="col-span-2 lg:col-span-2">
          <OrderTypeChart
            data={
              analytics?.orderTypeBreakdown || {
                dine_in: 0,
                takeout: 0,
                delivery: 0,
                online: 0,
                catering: 0,
              }
            }
          />
        </div>
      </div>
    </div>
  );
}
