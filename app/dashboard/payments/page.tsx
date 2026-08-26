"use client";

import { useMemo, useState } from "react";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { usePayments } from "../hooks/usePayments";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CreditCard, RefreshCcwDot } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { PaymentStats } from "./components/PaymentStats";
import { PaymentCharts } from "./components/PaymentCharts";
import { PaymentsTable } from "./components/PaymentsTable";
import { PaymentFilters, PaymentRecord, PaymentSummary } from "@/types/payment";
import {
  getCardBrandLabel,
  normalizeCardBrand,
} from "@/lib/payments/method-display";
import { PaymentMethod, PaymentStatus } from "@/types/order-management";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BatchesView } from "./components/BatchesView";
import { Layers } from "lucide-react";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelSection,
  LocationIndicator,
} from "@/components/dashboard/shell";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";

export function computePaymentSummary(
  payments: PaymentRecord[]
): PaymentSummary {
  if (!payments.length) {
    return {
      totalCount: 0,
      totalAmount: 0,
      totalTips: 0,
      totalRefunded: 0,
      refundCount: 0,
      byMethod: [],
      byCardType: [],
      byStatus: [],
      dailyVolume: [],
      byEntryMode: [],
    };
  }

  let totalAmount = 0;
  let totalTips = 0;
  let totalRefunded = 0;
  let refundCount = 0;

  const methodMap = new Map<string, { count: number; amount: number }>();
  // Keyed by normalized brand; `label` keeps the first-seen original spelling so
  // an unrecognized brand isn't displayed lowercased.
  const cardTypeMap = new Map<
    string,
    { count: number; amount: number; label: string }
  >();
  const statusMap = new Map<string, { count: number; amount: number }>();
  const dailyMap = new Map<string, { count: number; amount: number }>();
  const entryModeMap = new Map<string, { count: number; amount: number }>();

  for (const p of payments) {
    const pTotal = Number(p.total_amount) || 0;
    const pTip = Number(p.tip_amount) || 0;
    const pRefunded = Number(p.refunded_amount) || 0;

    totalAmount += pTotal;
    totalTips += pTip;
    totalRefunded += pRefunded;

    if (
      p.status === "refunded" ||
      p.status === "partially_refunded" ||
      p.status === "void"
    ) {
      refundCount++;
    }

    // By method
    const mEntry = methodMap.get(p.payment_method) || { count: 0, amount: 0 };
    mEntry.count++;
    mEntry.amount += pTotal;
    methodMap.set(p.payment_method, mEntry);

    // By card type — fall back to Castles data. Group on the normalized brand:
    // the two sources disagree on casing ("Visa" vs "VISA"), which would otherwise
    // render the same brand as two separate series.
    const cardType = p.card_type || p.processor_response?.castles_transaction?.cardType;
    if (cardType) {
      const brandKey = normalizeCardBrand(cardType);
      const cEntry = cardTypeMap.get(brandKey) || {
        count: 0,
        amount: 0,
        label: cardType,
      };
      cEntry.count++;
      cEntry.amount += pTotal;
      cardTypeMap.set(brandKey, cEntry);
    }

    // By status
    const sEntry = statusMap.get(p.status) || { count: 0, amount: 0 };
    sEntry.count++;
    sEntry.amount += pTotal;
    statusMap.set(p.status, sEntry);

    // Daily volume
    const day = (p.initiated_at || p.created_at || "").slice(0, 10);
    if (day) {
      const dEntry = dailyMap.get(day) || { count: 0, amount: 0 };
      dEntry.count++;
      dEntry.amount += pTotal;
      dailyMap.set(day, dEntry);
    }

    // By entry mode — fall back to processor_response.entry_type, then Castles
    const entryMode =
      p.card_entry_mode || p.processor_response?.entry_type || p.processor_response?.castles_transaction?.entryMode || "unknown";
    const eEntry = entryModeMap.get(entryMode) || { count: 0, amount: 0 };
    eEntry.count++;
    eEntry.amount += pTotal;
    entryModeMap.set(entryMode, eEntry);
  }

  return {
    totalCount: payments.length,
    totalAmount,
    totalTips,
    totalRefunded,
    refundCount,
    byMethod: Array.from(methodMap.entries()).map(([method, v]) => ({
      method: method as PaymentMethod,
      ...v,
    })),
    byCardType: Array.from(cardTypeMap.values()).map(({ label, ...v }) => ({
      cardType: getCardBrandLabel(label),
      ...v,
    })),
    byStatus: Array.from(statusMap.entries()).map(([status, v]) => ({
      status: status as PaymentStatus,
      ...v,
    })),
    dailyVolume: Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byEntryMode: Array.from(entryModeMap.entries()).map(([entryMode, v]) => ({
      entryMode,
      ...v,
    })),
  };
}

export default function PaymentsPage() {
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  // Date range state — default to last 30 days
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const filters: PaymentFilters = useMemo(
    () => ({
      dateRange: { from: dateFrom, to: dateTo },
    }),
    [dateFrom, dateTo]
  );

  const {
    data: payments,
    isLoading: paymentsLoading,
    refetch: refetchPayments,
  } = usePayments(filters);

  const paymentsList = Array.isArray(payments) ? payments : [];

  const summary = useMemo(
    () => computePaymentSummary(paymentsList),
    [paymentsList]
  );

  return (
    <PageShell>
      <PageHeader
        title="Payments"
        subtitle="View and manage all payment transactions"
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
            triggerClassName="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          />
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="payments">
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger
              value="payments"
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              <CreditCard className="h-4 w-4" />
              Payments
            </TabsTrigger>
            <TabsTrigger
              value="batches"
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              <Layers className="h-4 w-4" />
              Batches
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="payments" className="mt-6 space-y-6">
          {/* Stats Cards */}
          <PaymentStats summary={summary} isLoading={paymentsLoading} />

          {/* Charts */}
          <PaymentCharts summary={summary} isLoading={paymentsLoading} />

          {/* Payments Table */}
          <Panel>
            <PanelSection
              label="All Payments"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => await refetchPayments()}
                >
                  <RefreshCcwDot className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              }
            >
              {paymentsLoading && paymentsList.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : paymentsList.length === 0 ? (
                <Empty
                  icon={CreditCard}
                  title="No payments found"
                  description="Try adjusting your date range or filters to see more results."
                />
              ) : (
                <PaymentsTable
                  data={paymentsList}
                  isLoading={paymentsLoading}
                />
              )}
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="batches" className="mt-6">
          <BatchesView paymentFilters={filters} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
