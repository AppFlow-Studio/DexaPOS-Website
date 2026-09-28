"use client";

import { useState } from "react";
import { subDays } from "date-fns";
import { PageShell, PageHeader } from "@/components/dashboard/shell";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { DateRangePicker, type DatePreset } from "@/components/dashboard/orders/DateRangePicker";
import { useOrders } from "../hooks/useOrder";
import { useSelectedLocation } from "@/stores/location-store";
import type { OrderResponse } from "@/types/order-management";
import { TransactionsList } from "./components/TransactionsList";

export default function TransactionsPage() {
  const [dateRange, setDateRange] = useState(() => ({
    from: subDays(new Date(), 7),
    to: new Date(),
  }));
  const [preset, setPreset] = useState<DatePreset>("last_7_days");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const selectedLocation = useSelectedLocation();
  const { data: orders, isLoading } = useOrders({ dateRange });

  return (
    <PageShell>
      <PageHeader
        title="Transactions"
        subtitle="Browse orders, payment status, and receipts"
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={(from, to) => {
              if (from && to) setDateRange({ from, to });
            }}
            preset={preset}
            onPresetChange={setPreset}
            className="w-full sm:w-auto"
          />
        }
        stackActionsBelowIndicatorOnMobile
      />

      <TransactionsList
        transactions={orders ?? []}
        isLoading={isLoading}
        onTransactionClick={setSelectedOrder}
        timeZone={selectedLocation?.timezone}
      />

      {selectedOrder && (
        <ReceiptModal
          order={selectedOrder}
          location={selectedLocation}
          open
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        />
      )}
    </PageShell>
  );
}
