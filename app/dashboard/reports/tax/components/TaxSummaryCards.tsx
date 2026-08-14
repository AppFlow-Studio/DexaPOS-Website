import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
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
    format: (s: TaxSummary) => fmt(s.grossTaxCollected),
    sub: (s: TaxSummary) => `${s.totalOrders} completed orders`,
  },
  {
    key: "taxRefunded" as const,
    title: "Tax Refunded",
    icon: TrendingDown,
    format: (s: TaxSummary) => fmt(s.taxRefunded),
    sub: (s: TaxSummary) => `${s.totalRefunds} refund transactions`,
  },
  {
    key: "netTaxLiability" as const,
    title: "Net Tax Liability",
    icon: TrendingUp,
    format: (s: TaxSummary) => fmt(s.netTaxLiability),
    sub: () => "Gross minus refunded",
  },
  {
    key: "taxableSales" as const,
    title: "Taxable Sales",
    icon: Receipt,
    format: (s: TaxSummary) => fmt(s.taxableSales),
    sub: () => "Non-exempt subtotals",
  },
  {
    key: "taxExemptSales" as const,
    title: "Tax-Exempt Sales",
    icon: ShieldOff,
    format: (s: TaxSummary) => fmt(s.taxExemptSales),
    sub: () => "Items marked exempt",
  },
  {
    key: "effectiveTaxRate" as const,
    title: "Effective Tax Rate",
    icon: Percent,
    format: (s: TaxSummary) => `${s.effectiveTaxRate.toFixed(2)}%`,
    sub: () => "Net tax ÷ taxable sales",
  },
];

export function TaxSummaryCards({ summary, isLoading, isError }: TaxSummaryCardsProps) {
  if (isLoading) {
    return (
      <Panel padded>
        <StatRow columns={3}>
        {Array.from({ length: 6 }).map((_, i) => (
          <StatTile key={i} label="Loading" value="" isLoading />
        ))}
        </StatRow>
      </Panel>
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
    <Panel padded>
      <StatRow columns={3}>
      {CARDS.map((card) => (
        <StatTile
          key={card.key}
          label={card.title}
          value={isError ? "—" : card.format(s)}
          meta={isError ? "Failed to load" : card.sub(s)}
          icon={<card.icon />}
        />
      ))}
      </StatRow>
    </Panel>
  );
}
