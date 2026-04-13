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
import { ChevronRight } from "lucide-react";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface TipHistorySectionProps {
  sessions: TipDistributionSession[];
  onSelectSession: (sessionDate: string, shiftPeriod: string) => void;
  isLoading?: boolean;
  activeSessionId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  calculated: {
    label: "Calculated",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  pending_approval: {
    label: "Pending Approval",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  exported: {
    label: "Exported",
    className: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  voided: {
    label: "Voided",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const SHIFT_LABELS: Record<string, string> = {
  full_day: "Full Day",
  lunch: "Lunch",
  dinner: "Dinner",
  custom: "Custom",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TipHistorySection({
  sessions,
  onSelectSession,
  isLoading,
  activeSessionId,
}: TipHistorySectionProps) {
  if (isLoading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Recent Distributions</h3>
        </div>
        <div className="p-12 text-center text-muted-foreground">
          <p className="text-sm">No distribution sessions yet.</p>
          <p className="text-xs mt-1">Select a date and shift above, then click Calculate Tips to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/20">
        <h3 className="font-semibold text-sm">Recent Distributions</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/10 hover:bg-muted/10">
              <TableHead className="w-36">Date</TableHead>
              <TableHead className="w-28">Shift</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Distributed</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.draft;
              const isActive = session.id === activeSessionId;

              return (
                <TableRow
                  key={session.id}
                  onClick={() => onSelectSession(session.session_date, session.shift_period)}
                  className={`cursor-pointer transition-colors ${
                    isActive ? "bg-teal-50 hover:bg-teal-50" : "hover:bg-muted/40"
                  }`}
                >
                  <TableCell className="font-medium text-sm">
                    {formatDate(session.session_date)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {SHIFT_LABELS[session.shift_period] ?? session.shift_period}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatMoney(session.total_tips_collected)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatMoney(session.total_distributed)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs font-medium ${statusCfg.className}`}
                    >
                      {statusCfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
