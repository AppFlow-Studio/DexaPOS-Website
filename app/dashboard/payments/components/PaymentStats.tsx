"use client";

import {
  CreditCard,
  Wallet,
  ArrowLeftRight,
  DollarSign,
} from "lucide-react";
import { PaymentSummary } from "@/types/payment";
import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";

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
    <Panel className="px-4 py-6 sm:px-6">
      <StatRow columns={4}>
        <StatTile
          icon={<CreditCard />}
          label="Total Payments"
          value={summary?.totalCount ?? 0}
          meta={`${formatCurrency(summary?.totalAmount ?? 0)} total volume`}
          isLoading={isLoading}
        />
        <StatTile
          icon={<Wallet />}
          label="Card Payments"
          value={formatCurrency(totalCardAmount)}
          meta={
            topCardTypes
              .map(
                (c) =>
                  `${c.cardType} ${totalCardAmount > 0 ? Math.round((c.amount / totalCardAmount) * 100) : 0}%`
              )
              .join(", ") || "No card payments"
          }
          isLoading={isLoading}
        />
        <StatTile
          icon={<ArrowLeftRight />}
          label="Refunds & Voids"
          value={formatCurrency(summary?.totalRefunded ?? 0)}
          meta={`${summary?.refundCount ?? 0} transactions`}
          isLoading={isLoading}
        />
        <StatTile
          icon={<DollarSign />}
          label="Tips Collected"
          value={formatCurrency(summary?.totalTips ?? 0)}
          meta={`${formatCurrency(avgTipPerPayment)} avg per payment`}
          isLoading={isLoading}
        />
      </StatRow>
    </Panel>
  );
}
