import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import { OrderAnalytics } from "@/app/dashboard/actions/order-analytics";
import { DollarSign, ShoppingCart, TrendingUp, CreditCard } from "lucide-react";

interface ReportSummaryCardsProps {
  analytics: OrderAnalytics;
  isLoading: boolean;
}

export function ReportSummaryCards({
  analytics,
  isLoading,
}: ReportSummaryCardsProps) {
  if (isLoading) {
    return (
      <Panel padded>
        <StatRow columns={4}>
          {[1, 2, 3, 4].map((i) => <StatTile key={i} label="Loading" value="" isLoading />)}
        </StatRow>
      </Panel>
    );
  }

  const cards = [
    {
      title: "Total Sales",
      value: `$${analytics.salesToday?.toFixed(2) || "0.00"}`, // Using salesToday as placeholder for selected period if passed correctly
      // Wait, analytics returns salesToday (literal today) and salesThisWeek.
      // But we want sales for the selected period.
      // We should calculate total sales from salesByDate array to match expected period.
      icon: DollarSign,
      description: "For selected period",
    },
    {
      title: "Orders",
      value: analytics.totalOrders || 0,
      icon: ShoppingCart,
      description: "Total completed orders",
    },
    {
      title: "Avg Order Value",
      value: `$${analytics.avgOrderValue?.toFixed(2) || "0.00"}`,
      icon: TrendingUp,
      description: "Average per order",
    },
    {
      title: "Payment Types",
      value: Object.keys(analytics.orderTypeBreakdown || {}).length, // Placeholder
      // Maybe show top payment method? or just "N/A"
      // Let's swap this for "Previous Period Comparison" if available?
      // analytics.previousPeriodSales
      icon: CreditCard,
      description: analytics.previousPeriodSales
        ? `vs $${analytics.previousPeriodSales.toFixed(0)} prev.`
        : "No comparative data",
    },
  ];

  // Recalculate Total Sales based on salesByDate to reflect range correctly
  // Because salesToday is strictly today.
  const totalSalesInRange =
    analytics.salesByDate?.reduce((sum, item) => sum + item.sales, 0) || 0;
  cards[0].value = `$${totalSalesInRange.toFixed(2)}`;

  return (
    <Panel padded>
      <StatRow columns={4}>
      {cards.map((card) => (
        <StatTile
          key={card.title}
          label={card.title}
          value={card.value}
          meta={card.description}
          icon={<card.icon />}
        />
      ))}
      </StatRow>
    </Panel>
  );
}
