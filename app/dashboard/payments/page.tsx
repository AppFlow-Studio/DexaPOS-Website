"use client";

import { useMemo, useState } from "react";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { usePayments } from "../hooks/usePayments";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  MapPin,
  Globe,
  RefreshCcwDot,
  CalendarDays,
} from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { PaymentStats } from "./components/PaymentStats";
import { PaymentCharts } from "./components/PaymentCharts";
import { PaymentsTable } from "./components/PaymentsTable";
import { PaymentFilters, PaymentRecord, PaymentSummary } from "@/types/payment";
import { PaymentMethod, PaymentStatus } from "@/types/order-management";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BatchesView } from "./components/BatchesView";
import { Layers } from "lucide-react";

function computePaymentSummary(payments: PaymentRecord[]): PaymentSummary {
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
  const cardTypeMap = new Map<string, { count: number; amount: number }>();
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

    // By card type — fall back to Castles data
    const cardType = p.card_type || p.processor_response?.castles_transaction?.cardType;
    if (cardType) {
      const cEntry = cardTypeMap.get(cardType) || { count: 0, amount: 0 };
      cEntry.count++;
      cEntry.amount += pTotal;
      cardTypeMap.set(cardType, cEntry);
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
    byCardType: Array.from(cardTypeMap.entries()).map(([cardType, v]) => ({
      cardType,
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
    <main className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
            {isAllLocations ? (
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                All Locations
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            View and manage all payment transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Simple date range inputs */}
          <div className="flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={dateFrom.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value + "T00:00:00");
                if (!isNaN(d.getTime())) setDateFrom(d);
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value + "T23:59:59.999");
                if (!isNaN(d.getTime())) setDateTo(d);
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="batches">
            <Layers className="h-4 w-4" />
            Batches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-6">
          {/* Stats Cards */}
          <PaymentStats summary={summary} isLoading={paymentsLoading} />

          {/* Charts */}
          <PaymentCharts summary={summary} isLoading={paymentsLoading} />

          {/* Payments Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Payments</CardTitle>
                <Button
                  variant="outline"
                  className="hover:bg-accent hover:text-accent-foreground cursor-pointer"
                  size="sm"
                  onClick={async () => await refetchPayments()}
                >
                  <RefreshCcwDot className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches">
          <BatchesView paymentFilters={filters} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
