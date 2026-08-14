"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
        <p className="font-medium text-foreground">All distributions have been reviewed</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nice work — no pending approvals right now.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
            <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
            <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Collected</TableHead>
            <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Distributed</TableHead>
            <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Variance</TableHead>
            <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Calculated At</TableHead>
            <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const variance = session.total_tips_collected - session.total_distributed;
            return (
              <TableRow
                key={session.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
              >
                <TableCell className="py-3 text-sm font-medium">
                  {formatDate(session.session_date)}
                </TableCell>
                <TableCell className="py-3 text-sm">
                  <Badge variant="secondary" className="text-xs">
                    {SHIFT_LABELS[session.shift_period] || session.shift_period}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-right text-sm tabular-nums">
                  {formatMoney(session.total_tips_collected)}
                </TableCell>
                <TableCell className="py-3 text-right text-sm tabular-nums">
                  {formatMoney(session.total_distributed)}
                </TableCell>
                <TableCell
                  className={`py-3 text-right text-sm font-medium tabular-nums ${
                    Math.abs(variance) > 0.01
                      ? variance > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatMoney(variance)}
                </TableCell>
                <TableCell className="py-3 text-muted-foreground text-sm">
                  {session.calculated_at
                    ? new Date(session.calculated_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "—"}
                </TableCell>
                <TableCell className="py-3 text-right text-sm">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                      onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onVoid(session)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
