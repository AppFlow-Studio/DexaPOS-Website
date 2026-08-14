"use client";

import { useState } from "react";
import { startOfMonth } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import {
  useTaxSummary,
  useTaxBreakdown,
  useTaxByCategory,
  useTaxByLocation,
} from "@/app/dashboard/hooks/useTaxReport";
import { TaxSummaryCards } from "./components/TaxSummaryCards";
import {
  TaxBreakdownTable,
  SortKey,
  SortDir,
} from "./components/TaxBreakdownTable";
import { TaxCategoryChart } from "./components/TaxCategoryChart";
import { TaxLocationTable } from "./components/TaxLocationTable";
import { useSelectedLocation } from "@/stores/location-store";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { ReportPageHeader } from "@/components/dashboard/reports/ReportPageHeader";
import { PageShell } from "@/components/dashboard/shell";

const PAGE_SIZE = 50;

export default function TaxReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [activeTab, setActiveTab] = useState("breakdown");
  const [page, setPage] = useState(0);
  const [filterOrderType, setFilterOrderType] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");

  // Sort state lifted to page level so useTaxBreakdown can re-fetch with
  // server-side ordering. Resetting page to 0 on every sort change ensures
  // the user always sees the first page of the newly ordered result set.
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);

  function handleDateRangeChange(from: Date | null, to: Date | null) {
    if (from && to) {
      setDateRange({ from, to });
      setPage(0);
    }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  const { data: summaryResult, isLoading: summaryLoading, isError: summaryError } = useTaxSummary(
    queryDateRange.from,
    queryDateRange.to
  );
  const { data: breakdownResult, isLoading: breakdownLoading, isError: breakdownError } = useTaxBreakdown(
    queryDateRange.from,
    queryDateRange.to,
    page,
    PAGE_SIZE,
    {
      orderType: filterOrderType !== "all" ? filterOrderType : undefined,
      paymentMethod:
        filterPaymentMethod !== "all" ? filterPaymentMethod : undefined,
    },
    sortKey,
    sortDir
  );
  const { data: categoryResult, isLoading: categoryLoading, isError: categoryError } = useTaxByCategory(
    queryDateRange.from,
    queryDateRange.to
  );
  const { data: locationResult, isLoading: locationLoading, isError: locationError } = useTaxByLocation(
    queryDateRange.from,
    queryDateRange.to
  );

  return (
    <PageShell className="pb-8">
      <ReportPageHeader
        title="Tax Report"
        description="Tax collected, refunded and net liability"
        locationName={selectedLocation && !Array.isArray(selectedLocation) ? selectedLocation.name : null}
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* ── KPI Cards ── */}
      <TaxSummaryCards summary={summaryResult?.data} isLoading={summaryLoading} isError={summaryError} />

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full min-w-0 overflow-x-auto pb-1">
        <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          <TabsTrigger
            value="breakdown"
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
          >
            Order Breakdown
          </TabsTrigger>
          <TabsTrigger
            value="category"
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
          >
            By Category
          </TabsTrigger>
          <TabsTrigger
            value="location"
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
          >
            By Location
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="breakdown" className="mt-4">
          <TaxBreakdownTable
            data={breakdownResult?.data}
            count={breakdownResult?.count ?? 0}
            isLoading={breakdownLoading}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            filterOrderType={filterOrderType}
            filterPaymentMethod={filterPaymentMethod}
            onFilterOrderType={(v) => {
              setFilterOrderType(v);
              setPage(0);
            }}
            onFilterPaymentMethod={(v) => {
              setFilterPaymentMethod(v);
              setPage(0);
            }}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </TabsContent>

        <TabsContent value="category" className="mt-4 space-y-4">
          <TaxCategoryChart data={categoryResult?.data} isLoading={categoryLoading} />
        </TabsContent>

        <TabsContent value="location" className="mt-4">
          <TaxLocationTable
            data={locationResult?.data}
            isLoading={locationLoading}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
