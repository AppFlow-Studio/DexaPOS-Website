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
      {/* The dialog owns the rounded corner, so it clips and never scrolls —
          a scrollbar on a rounded element renders outside its own corner. The
          body below is the only scroller. */}
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {analytics?.program_name || "Program Analytics"}
          </DialogTitle>
          <DialogDescription>
            Membership, reward activity, and customer value for this program.
          </DialogDescription>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
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

            {/* Alerts — neutral wells, not amber (§4.6b): these report a
                count, and the sentence already carries the urgency. */}
            {(analytics.alerts.rewards_expiring_week > 0 || analytics.alerts.inactive_customers > 0) && (
              <div className="space-y-2">
                {analytics.alerts.rewards_expiring_week > 0 && (
                  <div className="flex min-w-0 items-start gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 text-sm">
                      <span className="tabular-nums">{analytics.alerts.rewards_expiring_week}</span> reward
                      {analytics.alerts.rewards_expiring_week !== 1 ? "s" : ""} expire this
                      week
                    </p>
                  </div>
                )}
                {analytics.alerts.inactive_customers > 0 && (
                  <div className="flex min-w-0 items-start gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 text-sm">
                      <span className="tabular-nums">{analytics.alerts.inactive_customers}</span> member
                      {analytics.alerts.inactive_customers !== 1 ? "s" : ""} inactive 30+ days
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Top Customers Table */}
            {analytics.top_customers && analytics.top_customers.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Top Customers</h4>
                {/* `variant="data"` is the surface — a tinted rounded well with
                    borderless rows. Wrapping it in a bordered box would be a
                    box inside a box (§5.2). */}
                <Table variant="data" className="text-xs">
                  <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                      <TableHead className="text-xs font-normal text-muted-foreground">Customer</TableHead>
                      <TableHead className="text-right text-xs font-normal text-muted-foreground">
                        Value
                      </TableHead>
                      <TableHead className="text-right text-xs font-normal text-muted-foreground">
                        Rewards
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.top_customers.map((customer) => (
                      <TableRow key={customer.customer_id}>
                        <TableCell className="text-xs font-medium">
                          <div>{customer.customer_name}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {formatPhoneForDisplay(customer.phone)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">
                          ${customer.lifetime_value.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {customer.rewards_earned}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
