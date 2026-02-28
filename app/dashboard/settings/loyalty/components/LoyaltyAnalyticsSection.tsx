"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Users,
  TrendingUp,
  Gift,
  DollarSign,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useLoyaltyAnalytics } from "../hooks/useLoyaltyPrograms";
import type { LoyaltyAnalytics } from "@/app/dashboard/actions/loyalty-programs";

interface LoyaltyAnalyticsSectionProps {
  clerkOrgId: string | undefined;
}

function KPICard({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-none shadow-sm bg-white dark:bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="text-muted-foreground">{Icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function LoyaltyAnalyticsSection({
  clerkOrgId,
}: LoyaltyAnalyticsSectionProps) {
  const { data: analytics, isLoading, error } = useLoyaltyAnalytics(clerkOrgId);

  if (!clerkOrgId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load analytics. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  const { kpis, alerts, enrollment_growth, earn_vs_redeem, top_customers } =
    analytics;

  // Chart configs
  const enrollmentChartConfig = {
    count: { label: "New Members", color: "hsl(var(--primary))" },
  };

  const earnRedeemChartConfig = {
    earned: { label: "Earned", color: "hsl(var(--primary))" },
    redeemed: { label: "Redeemed", color: "hsl(var(--secondary))" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          Program Analytics
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Performance metrics and customer insights
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Total Members"
          value={kpis.total_members}
          subtitle={`${kpis.active_this_month} active this month`}
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Active Rate"
          value={`${kpis.active_rate.toFixed(1)}%`}
          subtitle="earning this month"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KPICard
          label="Rewards Given"
          value={kpis.rewards_given}
          subtitle={`$${kpis.total_savings.toFixed(2)} value`}
          icon={<Gift className="h-5 w-5" />}
        />
        <KPICard
          label="Total Savings"
          value={`$${kpis.total_savings.toFixed(2)}`}
          subtitle="customer value"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* Alerts */}
      {(alerts.rewards_expiring_week > 0 || alerts.inactive_customers > 0) && (
        <div className="space-y-2">
          {alerts.rewards_expiring_week > 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                ⚠️ {alerts.rewards_expiring_week} reward
                {alerts.rewards_expiring_week !== 1 ? "s" : ""} expire this
                week — consider sending customer reminders
              </AlertDescription>
            </Alert>
          )}
          {alerts.inactive_customers > 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                ⚠️ {alerts.inactive_customers} member
                {alerts.inactive_customers !== 1 ? "s" : ""} haven't earned in
                30+ days — consider a comeback promotion
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Enrollment Growth Chart */}
        {enrollment_growth && enrollment_growth.length > 0 && (
          <Card className="border-none shadow-sm bg-white dark:bg-card">
            <CardHeader>
              <CardTitle className="text-base">Enrollment Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={enrollmentChartConfig} className="h-[250px] w-full">
                <AreaChart data={enrollment_growth} margin={{ left: 12, right: 12 }}>
                  <defs>
                    <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.1} />
                  <XAxis
                    dataKey="week"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    className="text-[10px]"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-[10px]"
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Area
                    dataKey="count"
                    type="monotone"
                    fill="url(#fillCount)"
                    fillOpacity={0.4}
                    stroke="var(--color-count)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Earn vs Redeem Chart */}
        {earn_vs_redeem && earn_vs_redeem.length > 0 && (
          <Card className="border-none shadow-sm bg-white dark:bg-card">
            <CardHeader>
              <CardTitle className="text-base">Earn vs Redeem Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={earnRedeemChartConfig} className="h-[250px] w-full">
                <BarChart data={earn_vs_redeem} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.1} />
                  <XAxis
                    dataKey="week"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    className="text-[10px]"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-[10px]"
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="earned"
                    fill="var(--color-earned)"
                    fillOpacity={0.8}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="redeemed"
                    fill="var(--color-redeemed)"
                    fillOpacity={0.8}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Customers Table */}
      {top_customers && top_customers.length > 0 && (
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardHeader>
            <CardTitle className="text-base">Top Loyalty Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Program</TableHead>
                    <TableHead className="text-right text-xs">
                      Lifetime Value
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      Rewards
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      Total Savings
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_customers.map((customer) => (
                    <TableRow key={customer.customer_id}>
                      <TableCell className="text-sm font-medium">
                        <div>{customer.customer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.phone}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="text-xs">
                          {customer.program_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        ${customer.lifetime_value.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {customer.rewards_earned}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        ${customer.total_savings.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
