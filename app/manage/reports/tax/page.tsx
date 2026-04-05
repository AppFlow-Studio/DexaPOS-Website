"use client";

import { useState, useEffect } from "react";
import { startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { AlertCircle, Building2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GetHQMerchantsForTax,
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

export default function HQTaxReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
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

  function handleMerchantChange(id: string) {
    setSelectedMerchantId(id);
    setPage(0);
  }

  function handleFilterOrderType(v: string) {
    setFilterOrderType(v);
    setPage(0);
  }

  function handleFilterPaymentMethod(v: string) {
    setFilterPaymentMethod(v);
    setPage(0);
  }

  const { data: merchantsResult, isLoading: merchantsLoading } = useQuery({
    queryKey: ["hq-tax-merchants"],
    queryFn: () => GetHQMerchantsForTax(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Auto-select first merchant once loaded
  useEffect(() => {
    if (!selectedMerchantId && merchantsResult?.data?.length) {
      setSelectedMerchantId(merchantsResult.data[0].id);
    }
  }, [merchantsResult, selectedMerchantId]);

  const enabled = !!selectedMerchantId;
  const dateFromIso = dateRange.from.toISOString();
  const dateToIso = dateRange.to.toISOString();

  const { data: summaryResult, isLoading: summaryLoading } = useQuery({
    queryKey: ["hq-tax-summary", selectedMerchantId, dateFromIso, dateToIso],
    queryFn: () =>
      GetHQTaxSummary(selectedMerchantId, null, dateRange.from, dateRange.to),
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: breakdownResult, isLoading: breakdownLoading } = useQuery({
    queryKey: [
      "hq-tax-breakdown",
      selectedMerchantId,
      dateFromIso,
      dateToIso,
      page,
      filterOrderType,
      filterPaymentMethod,
    ],
    queryFn: () =>
      GetHQTaxBreakdown(
        selectedMerchantId,
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
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: categoryResult, isLoading: categoryLoading } = useQuery({
    queryKey: ["hq-tax-category", selectedMerchantId, dateFromIso, dateToIso],
    queryFn: () =>
      GetHQTaxByCategory(selectedMerchantId, null, dateRange.from, dateRange.to),
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: locationResult, isLoading: locationLoading } = useQuery({
    queryKey: ["hq-tax-location", selectedMerchantId, dateFromIso, dateToIso],
    queryFn: () =>
      GetHQTaxByLocation(selectedMerchantId, dateRange.from, dateRange.to),
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedMerchant = merchantsResult?.data?.find(
    (m) => m.id === selectedMerchantId
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tax Report</h2>
          <p className="text-muted-foreground">
            View tax collection and liability for any merchant
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedMerchantId}
            onValueChange={handleMerchantChange}
            disabled={merchantsLoading}
          >
            <SelectTrigger className="w-56">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
              <SelectValue
                placeholder={merchantsLoading ? "Loading…" : "Select merchant"}
              />
            </SelectTrigger>
            <SelectContent>
              {(merchantsResult?.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        </div>
      </div>

      {merchantsResult?.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load merchants: {merchantsResult.error}
          </AlertDescription>
        </Alert>
      )}

      {selectedMerchant && (
        <p className="text-sm text-muted-foreground">
          Viewing tax data for{" "}
          <span className="font-semibold text-foreground">
            {selectedMerchant.name}
          </span>
        </p>
      )}

      <TaxSummaryCards
        summary={summaryResult?.data}
        isLoading={summaryLoading || !enabled}
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
            isLoading={breakdownLoading || !enabled}
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
            isLoading={categoryLoading || !enabled}
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
            isLoading={locationLoading || !enabled}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
