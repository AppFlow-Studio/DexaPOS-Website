import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
