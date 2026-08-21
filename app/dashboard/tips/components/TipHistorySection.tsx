import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TipStatusBadge } from "./TipStatusBadge";
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

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function TipHistorySection({
  sessions,
  onSelectSession,
  isLoading,
  activeSessionId,
}: TipHistorySectionProps) {
  // §5.4 — skeletons keep the shape of the surface they stand in for: the
  // tinted well, no frame, no dividers between the placeholder rows.
  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Recent Distributions</h3>
        <div className="space-y-2 rounded-2xl bg-muted/20 p-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 rounded-2xl bg-card/70 px-3 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Recent Distributions</h3>
        <div className="rounded-2xl bg-muted/20 p-12 text-center text-muted-foreground">
          <p className="text-sm">No distribution sessions yet.</p>
          <p className="mt-1 text-xs">
            Select a date and shift above, then click Calculate Tips to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Recent Distributions</h3>
      {/* §5: `variant="data"` carries the whole treatment — rounded tinted
          well, no frame, borderless rows. The table is not wrapped in a Panel;
          the well itself is the surface. */}
      <Table variant="data">
        <TableHeader className="[&_tr]:border-0">
          <TableRow>
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
            const isActive = session.id === activeSessionId;

            return (
              <TableRow
                key={session.id}
                onClick={() =>
                  onSelectSession(session.session_date, session.shift_period)
                }
                // Selection is a ring, not a tint (§5.3) — a coloured row fill
                // would be status colour-coding by another name.
                className={cn(
                  "cursor-pointer transition-colors",
                  isActive && "ring-1 ring-border"
                )}
              >
                <TableCell className="text-sm font-medium">
                  {formatDate(session.session_date)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {SHIFT_LABELS[session.shift_period] ?? session.shift_period}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(session.total_tips_collected)}
                </TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {formatMoney(session.total_distributed)}
                </TableCell>
                <TableCell>
                  <TipStatusBadge status={session.status} />
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
