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
      <div className="border rounded-lg p-10 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
        <p className="font-medium text-foreground">All distributions have been reviewed</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nice work — no pending approvals right now.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Distributed</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Calculated At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const variance = session.total_tips_collected - session.total_distributed;
              return (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">
                    {formatDate(session.session_date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {SHIFT_LABELS[session.shift_period] || session.shift_period}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(session.total_tips_collected)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(session.total_distributed)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      Math.abs(variance) > 0.01
                        ? variance > 0
                          ? "text-amber-600"
                          : "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatMoney(variance)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {session.calculated_at
                      ? new Date(session.calculated_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
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
    </div>
  );
}
