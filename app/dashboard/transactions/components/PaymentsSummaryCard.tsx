"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, CreditCard, Banknote, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

interface PaymentsSummaryCardProps {
  paymentMethods: PaymentMethodBreakdown[];
  isLoading?: boolean;
  onViewPayments?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getPaymentIcon(method: string) {
  const lowercaseMethod = method.toLowerCase();
  if (lowercaseMethod.includes("cash")) {
    return <Banknote className="h-4 w-4" />;
  }
  if (
    lowercaseMethod.includes("credit") ||
    lowercaseMethod.includes("card") ||
    lowercaseMethod.includes("debit")
  ) {
    return <CreditCard className="h-4 w-4" />;
  }
  return <Wallet className="h-4 w-4" />;
}

function formatMethodName(method: string): string {
  return method.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function PaymentsSummaryCard({
  paymentMethods,
  isLoading,
  onViewPayments,
}: PaymentsSummaryCardProps) {
  // Calculate total for percentage
  const totalAmount = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);

  // Sort by amount descending
  const sortedMethods = [...paymentMethods].sort((a, b) => b.amount - a.amount);

  return (
    <Panel>
      <PanelSection
        label="Payments Summary"
        caption="Columns"
        action={
          onViewPayments && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#0C4FD1] dark:text-[#6CA0FF] h-7 px-2 hover:bg-[#0C4FD1]/10"
              onClick={onViewPayments}
            >
              Payments
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Column labels — no rule beneath (§5.5); the gap does the work. */}
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payment type
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Amount
              </span>
            </div>

            {/* Payment methods list */}
            <div className="space-y-1 mt-2">
              {sortedMethods.map((pm, index) => {
                const percentage =
                  totalAmount > 0 ? (pm.amount / totalAmount) * 100 : 0;

                return (
                  <div
                    key={pm.method}
                    className="group flex items-center justify-between py-2.5 hover:bg-muted/50 -mx-4 px-4 rounded-2xl transition-colors"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      {/* One neutral chip for every tender (D-12): per-brand
                          hues turned this list into a colour key nobody reads,
                          and the icon already distinguishes cash from card. */}
                      <div className="rounded-full bg-muted/60 p-2 text-muted-foreground">
                        {getPaymentIcon(pm.method)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {formatMethodName(pm.method)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {pm.count} transaction{pm.count !== 1 ? "s" : ""} •{" "}
                          {percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {formatCurrency(pm.amount)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Total row */}
            {paymentMethods.length > 0 && (
              <div className="-mx-4 mt-2 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                <span className="text-sm font-bold">Total</span>
                <span className="font-mono text-base font-bold tabular-nums">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            )}

            {paymentMethods.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No payment data available
                </p>
              </div>
            )}
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
