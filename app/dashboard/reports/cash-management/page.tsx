"use client";

import { useState } from "react";
import { useCashFlowReport } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays, format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";
import Link from "next/link";

export default function CashFlowReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");

  const { data: cashTransactions, isLoading } = useCashFlowReport(
    dateRange.from,
    dateRange.to
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateRange({ from, to });
    }
  };

  const totalCashCollected =
    cashTransactions?.reduce((sum, item) => sum + item.total_amount, 0) || 0;
  // Note: Change Given is not yet tracked in DB, so we focus on collected for now until full integration.
  // const totalChangeGiven = 0;
  // const netCash = totalCashCollected - totalChangeGiven;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cash Management</h2>
          <p className="text-muted-foreground">
            Track cash drawer activity and cash payments
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
              Total Cash Collected
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">
              ${totalCashCollected.toFixed(2)}
            </div>
            <p className="text-xs text-green-600/80 dark:text-green-400/80">
              {cashTransactions?.length || 0} cash transactions
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash Transactions Log</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Staff Member</TableHead>
                <TableHead className="text-right">Sale Amount</TableHead>
                <TableHead className="text-right">Tip</TableHead>
                <TableHead className="text-right">Total Collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : cashTransactions && cashTransactions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center h-24 text-muted-foreground"
                  >
                    No cash transactions found for this period
                  </TableCell>
                </TableRow>
              ) : (
                cashTransactions?.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {format(new Date(item.created_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/orders/${item.order_id}`}
                        className="text-primary underline hover:text-primary/80 transition-colors"
                      >
                        #{item.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{item.staff_name || "Unknown"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ${(item.total_amount - item.tip_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.tip_amount > 0
                        ? `+$${item.tip_amount.toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                      ${item.total_amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
