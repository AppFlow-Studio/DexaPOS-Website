import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  ShieldOff,
  Percent,
} from "lucide-react";
import type { TaxSummary } from "@/app/dashboard/reports/tax/types";

interface TaxSummaryCardsProps {
  summary: TaxSummary | undefined;
  isLoading: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function TaxSummaryCards({ summary, isLoading }: TaxSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Gross Tax Collected",
      value: formatCurrency(summary?.grossTaxCollected ?? 0),
      description: `${summary?.totalOrders ?? 0} completed orders`,
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      title: "Tax Refunded",
      value: formatCurrency(summary?.taxRefunded ?? 0),
      description: `${summary?.totalRefunds ?? 0} refund transactions`,
      icon: TrendingDown,
      color: "text-red-500",
    },
    {
      title: "Net Tax Liability",
      value: formatCurrency(summary?.netTaxLiability ?? 0),
      description: "Gross minus refunded",
      icon: TrendingUp,
      color: "text-blue-600",
    },
    {
      title: "Taxable Sales",
      value: formatCurrency(summary?.taxableSales ?? 0),
      description: "Non-exempt subtotals",
      icon: Receipt,
      color: "text-purple-600",
    },
    {
      title: "Tax-Exempt Sales",
      value: formatCurrency(summary?.taxExemptSales ?? 0),
      description: "Items marked tax-exempt",
      icon: ShieldOff,
      color: "text-orange-500",
    },
    {
      title: "Effective Tax Rate",
      value: `${(summary?.effectiveTaxRate ?? 0).toFixed(2)}%`,
      description: "Net tax / taxable sales",
      icon: Percent,
      color: "text-teal-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
