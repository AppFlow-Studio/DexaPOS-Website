"use client";

import { useMemo } from "react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ShoppingBag,
  ArrowUpRight,
  ArrowDownLeft,
  Coffee,
  Utensils,
  Truck,
  Globe,
  UtensilsCrossed,
} from "lucide-react";
import { OrderResponse } from "@/types/order-management";

interface TransactionsListProps {
  transactions: OrderResponse[];
  isLoading?: boolean;
  onTransactionClick?: (transaction: OrderResponse) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateHeader(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

function getOrderTypeIcon(orderType: string) {
  switch (orderType) {
    case "dine_in":
      return <Utensils className="h-3.5 w-3.5" />;
    case "takeout":
      return <Coffee className="h-3.5 w-3.5" />;
    case "delivery":
      return <Truck className="h-3.5 w-3.5" />;
    case "online":
      return <Globe className="h-3.5 w-3.5" />;
    case "catering":
      return <UtensilsCrossed className="h-3.5 w-3.5" />;
    default:
      return <ShoppingBag className="h-3.5 w-3.5" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "refunded":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case "void":
      return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    case "preparing":
    case "pending":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

function TransactionItem({
  transaction,
  onClick,
}: {
  transaction: OrderResponse;
  onClick?: () => void;
}) {
  const isRefund = transaction.status === "refunded";
  const isVoid = transaction.status === "void";

  return (
    <div
      className={cn(
        "flex items-center justify-between py-4 px-4 -mx-4 rounded-xl transition-all cursor-pointer",
        "hover:bg-muted/50 active:scale-[0.99]",
        (isRefund || isVoid) && "opacity-75"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Transaction Icon */}
        <div
          className={cn(
            "p-2.5 rounded-full",
            isRefund
              ? "bg-red-500/10"
              : isVoid
              ? "bg-gray-500/10"
              : "bg-primary/10"
          )}
        >
          {isRefund ? (
            <ArrowDownLeft className="h-4 w-4 text-red-500" />
          ) : isVoid ? (
            <ShoppingBag className="h-4 w-4 text-gray-500" />
          ) : (
            <ArrowUpRight className="h-4 w-4 text-primary" />
          )}
        </div>

        {/* Transaction Details */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {transaction.order_number || `#${transaction.id.slice(0, 8)}`}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5",
                getStatusColor(transaction.status)
              )}
            >
              {transaction.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {getOrderTypeIcon(transaction.order_type)}
              {transaction.order_type.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {format(parseISO(transaction.created_at), "h:mm a")}
            </span>
            {transaction.table_number && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  Table {transaction.table_number}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Amount */}
      <span
        className={cn(
          "font-mono text-sm font-bold tabular-nums",
          isRefund && "text-red-500"
        )}
      >
        {isRefund ? "-" : ""}
        {formatCurrency(transaction.total_amount)}
      </span>
    </div>
  );
}

export function TransactionsList({
  transactions,
  isLoading,
  onTransactionClick,
}: TransactionsListProps) {
  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return {};

    const groups: Record<string, OrderResponse[]> = {};

    transactions.forEach((tx) => {
      const dateKey = format(parseISO(tx.created_at), "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(tx);
    });

    // Sort each group by time (newest first)
    Object.keys(groups).forEach((key) => {
      groups[key].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return groups;
  }, [transactions]);

  // Get sorted date keys (newest first)
  const sortedDates = useMemo(() => {
    return Object.keys(groupedTransactions).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
  }, [groupedTransactions]);

  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded mt-2" />
              </div>
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
        <CardContent className="py-12">
          <div className="text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="mt-4 text-sm text-muted-foreground">
              No transactions found for this period
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        {sortedDates.map((dateKey, groupIndex) => (
          <div
            key={dateKey}
            className={cn(
              groupIndex > 0 && "mt-6 pt-6 border-t border-muted/30"
            )}
          >
            {/* Date Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm py-2 -mx-4 px-4 z-10">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {formatDateHeader(dateKey)}
              </h3>
            </div>

            {/* Transactions for this date */}
            <div className="divide-y divide-muted/20">
              {groupedTransactions[dateKey].map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onClick={() => onTransactionClick?.(tx)}
                />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
