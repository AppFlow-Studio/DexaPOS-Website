"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useProgramAnalytics } from "../hooks/useLoyaltyProgram";
import { formatPhoneForDisplay } from "@/lib/phone";
import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";

interface ProgramAnalyticsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  programId: string | undefined;
}

export function ProgramAnalyticsSheet({
  open,
  onOpenChange,
  clerkOrgId,
  programId,
}: ProgramAnalyticsSheetProps) {
  const { data: analytics, isLoading, error } = useProgramAnalytics(clerkOrgId, programId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {analytics?.program_name || "Program Analytics"}
          </DialogTitle>
          <DialogDescription>
            Membership, reward activity, and customer value for this program.
          </DialogDescription>
        </DialogHeader>

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
            <Panel padded>
              <StatRow columns={4}>
                <StatTile
                  label="Total members"
                  value={analytics.total_members}
                  meta={`${analytics.active_this_month} active`}
                  icon={<Users />}
                />
                <StatTile
                  label="Active rate"
                  value={`${analytics.active_rate.toFixed(1)}%`}
                  meta="This month"
                  icon={<TrendingUp />}
                />
                <StatTile
                  label="Rewards given"
                  value={analytics.rewards_given}
                  meta={`$${analytics.total_savings.toFixed(2)} saved`}
                  icon={<Gift />}
                />
                <StatTile
                  label="Total savings"
                  value={`$${analytics.total_savings.toFixed(2)}`}
                  meta="Customer value"
                  icon={<DollarSign />}
                />
              </StatRow>
            </Panel>

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
                              {formatPhoneForDisplay(customer.phone)}
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
      </DialogContent>
    </Dialog>
  );
}
