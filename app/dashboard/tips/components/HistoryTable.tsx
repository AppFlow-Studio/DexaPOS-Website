"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTipDistributionHistory } from "../hooks/useTipDistribution";
import {
  STATUS_CONFIG,
  SHIFT_LABELS,
  formatMoney,
  formatDate,
} from "../lib/constants";
import { cn } from "@/lib/utils";

interface HistoryTableProps {
  clerkOrgId: string | undefined;
  locationId: string | undefined;
}

const FILTERABLE_STATUSES = [
  { value: "approved", label: "Approved" },
  { value: "exported", label: "Exported" },
  { value: "voided", label: "Voided" },
] as const;

export function HistoryTable({ clerkOrgId, locationId }: HistoryTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string[]>(["approved", "exported", "voided"]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: sessions = [], isLoading } = useTipDistributionHistory(
    clerkOrgId,
    locationId,
    50,
    statusFilter.length > 0 ? statusFilter : undefined,
    dateFrom || undefined,
    dateTo || undefined
  );

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-36 h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-36 h-9"
          />
        </div>
        <div className="flex items-center gap-3">
          {FILTERABLE_STATUSES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={statusFilter.includes(s.value)}
                onCheckedChange={() => toggleStatus(s.value)}
              />
              <span className="text-sm">{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="border rounded-lg p-10 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No distribution records for the selected filters
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Distributed</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.draft;
                  const variance = session.total_tips_collected - session.total_distributed;
                  return (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(session.session_date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {SHIFT_LABELS[session.shift_period] || session.shift_period}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs font-medium", cfg.className)}
                        >
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(session.total_tips_collected)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(session.total_distributed)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          Math.abs(variance) > 0.01
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatMoney(variance)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
