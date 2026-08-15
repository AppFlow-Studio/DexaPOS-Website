"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDate, SHIFT_LABELS } from "../lib/constants";
import { cn } from "@/lib/utils";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface NeedsApprovalTableProps {
  sessions: TipDistributionSession[];
  isLoading: boolean;
  onVoid: (session: TipDistributionSession) => void;
}

export function NeedsApprovalTable({
  sessions,
  isLoading,
  onVoid,
}: NeedsApprovalTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center">
        <CheckCircle2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium text-foreground">All distributions have been reviewed</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nice work — no pending approvals right now.
        </p>
      </div>
    );
  }

  // D-12 — a variance is a state, and states are not colour-coded. The signed
  // figure carries the direction; weight marks the rows that are off.
  const varianceClass = (variance: number) =>
    Math.abs(variance) > 0.01 ? "font-medium text-foreground" : "text-muted-foreground";

  const calculatedAt = (session: TipDistributionSession) =>
    session.calculated_at
      ? new Date(session.calculated_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  return (
    <>
      {/* Wide screens get the table; phones and tablets get cards below, so a
          7-column row never becomes a horizontal scroller. Matches
          StaffDataTable. */}
      <Table
        variant="data"
        containerClassName="hidden xl:block"
        className="min-w-[900px]"
      >
        <TableHeader className="[&_tr]:border-0">
          <TableRow>
            <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
            <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
            <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Collected</TableHead>
            <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Distributed</TableHead>
            <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Variance</TableHead>
            <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Calculated At</TableHead>
            <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const variance = session.total_tips_collected - session.total_distributed;
            return (
              <TableRow key={session.id}>
                <TableCell className="text-sm font-medium">
                  {formatDate(session.session_date)}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {SHIFT_LABELS[session.shift_period] || session.shift_period || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(session.total_tips_collected)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(session.total_distributed)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-sm font-medium tabular-nums",
                    varianceClass(variance)
                  )}
                >
                  {formatMoney(variance)}
                </TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {calculatedAt(session)}
                </TableCell>
                <TableCell className="text-right text-sm">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                      onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onVoid(session)}
                      className="h-9 w-9 rounded-full p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span className="sr-only">Void</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Phones and tablets: cards instead of a scrolling table. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {sessions.map((session) => {
          const variance = session.total_tips_collected - session.total_distributed;
          return (
            <article
              key={session.id}
              className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {formatDate(session.session_date)}
                  </p>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                    {calculatedAt(session)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {SHIFT_LABELS[session.shift_period] || session.shift_period || "—"}
                </span>
              </div>

              <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5">
                <div className="min-w-0">
                  <p className="text-[0.8125rem] text-muted-foreground">Collected</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatMoney(session.total_tips_collected)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] text-muted-foreground">Distributed</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums">
                    {formatMoney(session.total_distributed)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] text-muted-foreground">Variance</p>
                  <p
                    className={cn(
                      "mt-0.5 text-sm font-medium tabular-nums",
                      varianceClass(variance)
                    )}
                  >
                    {formatMoney(variance)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onVoid(session)}
                  className="h-8 rounded-full px-3 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  Void
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-[0.8125rem] font-medium shadow-sm"
                  onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Review
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
