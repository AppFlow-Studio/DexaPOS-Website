"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  Users,
  TrendingUp,
  Gift,
  DollarSign,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useProgramAnalytics } from "../hooks/useLoyaltyPrograms";
import type { ProgramAnalytics } from "@/app/dashboard/actions/loyalty-programs";

interface ProgramAnalyticsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  programId: string | undefined;
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

export function ProgramAnalyticsSheet({
  open,
  onOpenChange,
  clerkOrgId,
  programId,
}: ProgramAnalyticsSheetProps) {
  const { data: analytics, isLoading, error } = useProgramAnalytics(clerkOrgId, programId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>
            {analytics?.program_name || "Program Analytics"}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || !analytics ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load analytics. Please try again.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-3 grid-cols-2">
              <KPICard
                label="Total Members"
                value={analytics.total_members}
                subtitle={`${analytics.active_this_month} active`}
                icon={<Users className="h-5 w-5" />}
              />
              <KPICard
                label="Active Rate"
                value={`${analytics.active_rate.toFixed(1)}%`}
                subtitle="this month"
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <KPICard
                label="Rewards Given"
                value={analytics.rewards_given}
                subtitle={`$${analytics.total_savings.toFixed(2)}`}
                icon={<Gift className="h-5 w-5" />}
              />
              <KPICard
                label="Total Savings"
                value={`$${analytics.total_savings.toFixed(2)}`}
                subtitle="customer value"
                icon={<DollarSign className="h-5 w-5" />}
              />
            </div>

            {/* Alerts */}
            {(analytics.alerts.rewards_expiring_week > 0 || analytics.alerts.inactive_customers > 0) && (
              <div className="space-y-2">
                {analytics.alerts.rewards_expiring_week > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      ⚠️ {analytics.alerts.rewards_expiring_week} reward
                      {analytics.alerts.rewards_expiring_week !== 1 ? "s" : ""} expire this
                      week
                    </AlertDescription>
                  </Alert>
                )}
                {analytics.alerts.inactive_customers > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      ⚠️ {analytics.alerts.inactive_customers} member
                      {analytics.alerts.inactive_customers !== 1 ? "s" : ""} inactive 30+ days
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Top Customers Table */}
            {analytics.top_customers && analytics.top_customers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Top Customers</h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-right text-xs">
                          Value
                        </TableHead>
                        <TableHead className="text-right text-xs">
                          Rewards
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.top_customers.map((customer) => (
                        <TableRow key={customer.customer_id}>
                          <TableCell className="text-xs font-medium">
                            <div>{customer.customer_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {customer.phone}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            ${customer.lifetime_value.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {customer.rewards_earned}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
