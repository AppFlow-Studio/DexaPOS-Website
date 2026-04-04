"use client";

import { useState } from "react";
import { startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GetHQTaxSummary,
  GetHQTaxBreakdown,
  GetHQTaxByCategory,
  GetHQTaxByLocation,
} from "@/app/manage/actions/hq-platform/tax-report";
import { TaxSummaryCards } from "@/app/dashboard/reports/tax/components/TaxSummaryCards";
import { TaxBreakdownTable } from "@/app/dashboard/reports/tax/components/TaxBreakdownTable";
import { TaxCategoryChart } from "@/app/dashboard/reports/tax/components/TaxCategoryChart";
import { TaxLocationTable } from "@/app/dashboard/reports/tax/components/TaxLocationTable";

const PAGE_SIZE = 50;

export function TaxReportTab({ merchantId }: { merchantId: string }) {
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

  const dateFromIso = dateRange.from.toISOString();
  const dateToIso = dateRange.to.toISOString();

  const { data: summaryResult, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ["hq-tax-summary", merchantId, dateFromIso, dateToIso],
    queryFn: () => GetHQTaxSummary(merchantId, null, dateRange.from, dateRange.to),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: breakdownResult, isLoading: breakdownLoading } = useQuery({
    queryKey: [
      "hq-tax-breakdown",
      merchantId,
      dateFromIso,
      dateToIso,
      page,
      filterOrderType,
      filterPaymentMethod,
    ],
    queryFn: () =>
      GetHQTaxBreakdown(
        merchantId,
        null,
        dateRange.from,
        dateRange.to,
        page,
        PAGE_SIZE,
        {
          orderType: filterOrderType !== "all" ? filterOrderType : undefined,
          paymentMethod:
            filterPaymentMethod !== "all" ? filterPaymentMethod : undefined,
        }
      ),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: categoryResult, isLoading: categoryLoading } = useQuery({
    queryKey: ["hq-tax-category", merchantId, dateFromIso, dateToIso],
    queryFn: () => GetHQTaxByCategory(merchantId, null, dateRange.from, dateRange.to),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: locationResult, isLoading: locationLoading } = useQuery({
    queryKey: ["hq-tax-location", merchantId, dateFromIso, dateToIso],
    queryFn: () => GetHQTaxByLocation(merchantId, dateRange.from, dateRange.to),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Tax collection and liability for this merchant
        </p>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={handleDateRangeChange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {summaryError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load tax data</AlertDescription>
        </Alert>
      )}

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
                      <td className="px-4 py-2 text-right">
                        ${row.taxableSales.toFixed(2)}
                      </td>
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
