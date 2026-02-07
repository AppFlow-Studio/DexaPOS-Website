"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Wallet,
  ArrowLeftRight,
  DollarSign,
} from "lucide-react";
import { PaymentSummary } from "@/types/payment";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

interface PaymentStatsProps {
  summary?: PaymentSummary;
  isLoading: boolean;
}

export function PaymentStats({ summary, isLoading }: PaymentStatsProps) {
  // Top card types sorted by amount
  const topCardTypes = (summary?.byCardType || [])
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const totalCardAmount = topCardTypes.reduce((s, c) => s + c.amount, 0);

  const avgTipPerPayment =
    summary && summary.totalCount > 0
      ? summary.totalTips / summary.totalCount
      : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Total Payments */}
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Payments
          </CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">
              {summary?.totalCount ?? 0}
            </div>
          )}
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-24" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalAmount ?? 0)} total volume
            </p>
          )}
        </CardContent>
      </Card>

      {/* Card Payments */}
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Card Payments
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">
              {formatCurrency(totalCardAmount)}
            </div>
          )}
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-32" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {topCardTypes
                .map(
                  (c) =>
                    `${c.cardType} ${totalCardAmount > 0 ? Math.round((c.amount / totalCardAmount) * 100) : 0}%`
                )
                .join(", ") || "No card payments"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Refunds & Returns */}
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Refunds & Voids
          </CardTitle>
          <ArrowLeftRight className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.totalRefunded ?? 0)}
            </div>
          )}
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-24" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {summary?.refundCount ?? 0} transactions
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tips Collected */}
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Tips Collected
          </CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalTips ?? 0)}
            </div>
          )}
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-24" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(avgTipPerPayment)} avg per payment
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
