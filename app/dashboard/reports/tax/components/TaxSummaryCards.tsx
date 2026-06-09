import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  ShieldOff,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaxSummary } from "@/app/dashboard/reports/tax/types";

interface TaxSummaryCardsProps {
  summary: TaxSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

const CARDS = [
  {
    key: "grossTaxCollected" as const,
    title: "Gross Tax Collected",
    icon: DollarSign,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    format: (s: TaxSummary) => fmt(s.grossTaxCollected),
    sub: (s: TaxSummary) => `${s.totalOrders} completed orders`,
  },
  {
    key: "taxRefunded" as const,
    title: "Tax Refunded",
    icon: TrendingDown,
    iconColor: "text-rose-500",
    iconBg: "bg-rose-50",
    format: (s: TaxSummary) => fmt(s.taxRefunded),
    sub: (s: TaxSummary) => `${s.totalRefunds} refund transactions`,
  },
  {
    key: "netTaxLiability" as const,
    title: "Net Tax Liability",
    icon: TrendingUp,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    format: (s: TaxSummary) => fmt(s.netTaxLiability),
    sub: () => "Gross minus refunded",
  },
  {
    key: "taxableSales" as const,
    title: "Taxable Sales",
    icon: Receipt,
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-50",
    format: (s: TaxSummary) => fmt(s.taxableSales),
    sub: () => "Non-exempt subtotals",
  },
  {
    key: "taxExemptSales" as const,
    title: "Tax-Exempt Sales",
    icon: ShieldOff,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50",
    format: (s: TaxSummary) => fmt(s.taxExemptSales),
    sub: () => "Items marked exempt",
  },
  {
    key: "effectiveTaxRate" as const,
    title: "Effective Tax Rate",
    icon: Percent,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
    format: (s: TaxSummary) => `${s.effectiveTaxRate.toFixed(2)}%`,
    sub: () => "Net tax ÷ taxable sales",
  },
];

export function TaxSummaryCards({ summary, isLoading, isError }: TaxSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="h-8 w-8 bg-muted animate-pulse rounded-xl" />
              </div>
              <div className="h-3 w-20 bg-muted animate-pulse rounded mb-2" />
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="h-3 w-28 bg-muted animate-pulse rounded mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const s: TaxSummary = summary ?? {
    grossTaxCollected: 0,
    taxRefunded: 0,
    netTaxLiability: 0,
    taxableSales: 0,
    taxExemptSales: 0,
    effectiveTaxRate: 0,
    totalOrders: 0,
    totalRefunds: 0,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {CARDS.map((card) => (
        <Card
          key={card.key}
          className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden"
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-xl", card.iconBg)}>
                <card.icon className={cn("h-4 w-4", card.iconColor)} />
              </div>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {card.title}
            </p>
            <p className="text-xl font-bold mt-1">{isError ? "—" : card.format(s)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {isError ? "Failed to load" : card.sub(s)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
