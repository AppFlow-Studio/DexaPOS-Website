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
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedLocation && !Array.isArray(selectedLocation)
              ? selectedLocation.name
              : "All Locations"}{" "}
            · Tax collected, refunded & net liability
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={handleDateRangeChange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* ── KPI Cards ── */}
      <TaxSummaryCards summary={summaryResult?.data} isLoading={summaryLoading} isError={summaryError} />

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
        <TabsList className="bg-muted p-1 h-auto rounded-xl w-full sm:w-fit">
          <TabsTrigger
            value="breakdown"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-medium px-4 py-2"
          >
            Order Breakdown
          </TabsTrigger>
          <TabsTrigger
            value="category"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-medium px-4 py-2"
          >
            By Category
          </TabsTrigger>
          <TabsTrigger
            value="location"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-medium px-4 py-2"
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
    </div>
  );
}
