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
import { TaxBreakdownTable } from "./components/TaxBreakdownTable";
import { TaxCategoryChart } from "./components/TaxCategoryChart";
import { TaxLocationTable } from "./components/TaxLocationTable";

const PAGE_SIZE = 50;

export default function TaxReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [activeTab, setActiveTab] = useState("summary");
  const [page, setPage] = useState(0);
  const [filterOrderType, setFilterOrderType] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");

  function handleDateRangeChange(from: Date | null, to: Date | null) {
    if (from && to) {
      setDateRange({ from, to });
      setPage(0);
    }
  }

  function handleFilterOrderType(v: string) {
    setFilterOrderType(v);
    setPage(0);
  }

  function handleFilterPaymentMethod(v: string) {
    setFilterPaymentMethod(v);
    setPage(0);
  }

  const { data: summaryResult, isLoading: summaryLoading } = useTaxSummary(
    dateRange.from,
    dateRange.to
  );

  const { data: breakdownResult, isLoading: breakdownLoading } = useTaxBreakdown(
    dateRange.from,
    dateRange.to,
    page,
    PAGE_SIZE,
    {
      orderType: filterOrderType !== "all" ? filterOrderType : undefined,
      paymentMethod: filterPaymentMethod !== "all" ? filterPaymentMethod : undefined,
    }
  );

  const { data: categoryResult, isLoading: categoryLoading } = useTaxByCategory(
    dateRange.from,
    dateRange.to
  );

  const { data: locationResult, isLoading: locationLoading } = useTaxByLocation(
    dateRange.from,
    dateRange.to
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tax Report</h2>
          <p className="text-muted-foreground">
            Sales tax collected, refunded, and net liability for filing
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

      <TaxSummaryCards
        summary={summaryResult?.data}
        isLoading={summaryLoading}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">Order Breakdown</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="location">By Location</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <TaxBreakdownTable
            data={breakdownResult?.data}
            count={breakdownResult?.count ?? 0}
            isLoading={breakdownLoading}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            filterOrderType={filterOrderType}
            filterPaymentMethod={filterPaymentMethod}
            onFilterOrderType={handleFilterOrderType}
            onFilterPaymentMethod={handleFilterPaymentMethod}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        </TabsContent>

        <TabsContent value="category" className="mt-4 space-y-4">
          <TaxCategoryChart
            data={categoryResult?.data}
            isLoading={categoryLoading}
          />
          {!categoryLoading && categoryResult?.data?.length ? (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-right px-4 py-3 font-medium">Taxable Sales</th>
                    <th className="text-right px-4 py-3 font-medium">Tax Collected</th>
                    <th className="text-right px-4 py-3 font-medium">Exempt Items</th>
                    <th className="text-right px-4 py-3 font-medium">Effective Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryResult.data.map((row, i) => (
                    <tr
                      key={row.categoryName}
                      className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                    >
                      <td className="px-4 py-2 font-medium">{row.categoryName}</td>
                      <td className="px-4 py-2 text-right">${row.taxableSales.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-green-700 font-medium">
                        ${row.taxCollected.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {row.taxExemptCount > 0 ? row.taxExemptCount : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {row.effectiveRate.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
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
