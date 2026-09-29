"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, formatDistanceStrict } from "date-fns";
import { RefreshCw } from "lucide-react";
import { PageHeader, PageShell } from "@/components/dashboard/shell";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Badge } from "@/components/ui/badge";
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
import { adminKeys } from "@/lib/queries/admin-keys";
import { cn } from "@/lib/utils";
import {
  ListImpersonationSessions,
  type ImpersonationSessionRow,
} from "@/app/manage/actions/impersonation-audit";

/** §5.7: every table pages at 10, server-paged lists included. */
const PAGE_SIZE = 10;

/**
 * How a session ended, in words. Status is never colour-coded (§4.6b): the
 * word carries the meaning. `null` means the session has not ended yet — the
 * table's check constraint ties `ended_at IS NULL` to `end_reason IS NULL`.
 */
const END_REASON_LABELS: Record<string, string> = {
  user_exit: "Exited",
  idle_timeout: "Idle timeout",
  revoked_access: "Access revoked",
  session_expired: "Expired",
  superseded: "Superseded",
};

function statusLabel(row: ImpersonationSessionRow): string {
  if (!row.end_reason) return "Active";
  return END_REASON_LABELS[row.end_reason] ?? row.end_reason.replace(/_/g, " ");
}

/** Time from start to end. An ongoing session has no duration yet (§4.9: unknown is `—`). */
function duration(row: ImpersonationSessionRow): string {
  if (!row.ended_at) return "—";
  return formatDistanceStrict(new Date(row.ended_at), new Date(row.started_at));
}

function startedAt(row: ImpersonationSessionRow): string {
  return format(new Date(row.started_at), "MMM d, yyyy, h:mm a");
}

/** Seconds matter for audit evidence; they live in the `title` tooltip. */
function startedAtExact(row: ImpersonationSessionRow): string {
  return format(new Date(row.started_at), "yyyy-MM-dd HH:mm:ss");
}

function adminLabel(row: ImpersonationSessionRow): string {
  return row.hq_user_name ?? row.hq_user_email ?? row.hq_user_id;
}

/**
 * The neutral pill (§4.6b). An ongoing session is the one row worth noticing,
 * so it is marked by weight, not hue (§3.5).
 */
function StatusBadge({ row }: { row: ImpersonationSessionRow }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit shrink-0 px-2.5 text-xs",
        row.end_reason ? "font-medium" : "font-semibold text-foreground",
      )}
    >
      {statusLabel(row)}
    </Badge>
  );
}

export default function ImpersonationAuditPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [...adminKeys.auditLogs(), "impersonation-sessions", page],
    queryFn: async () => {
      const res = await ListImpersonationSessions({}, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      if (res.error) throw new Error(res.error);
      return { rows: res.data ?? [], total: res.total ?? 0 };
    },
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageShell as="div">
      <PageHeader
        title="Impersonation Sessions"
        subtitle="Every time an HQ admin acted as a merchant. Each action taken during a session is also recorded in the audit log."
        backHref="/manage/audit-logs"
        backLabel="Back to audit logs"
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh sessions"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        }
      />

      {isLoading ? (
        <>
          <div className="hidden space-y-2 xl:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-2xl bg-muted/45 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </>
      ) : isError ? (
        // §4.9: a failure is a sentence on a neutral well, never red text.
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-20 text-center"
        >
          <div>
            <p className="text-sm font-medium">We hit a snag loading impersonation sessions</p>
            {error instanceof Error && (
              <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
          <p className="text-sm font-medium">No impersonation sessions yet</p>
          <p className="text-xs text-muted-foreground">
            A session appears here each time an HQ admin uses View as merchant.
          </p>
        </div>
      ) : (
        <div>
          {/* §5.3: the table from its fit breakpoint (900px fits `xl`), cards below. */}
          <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>HQ admin</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm tabular-nums" title={startedAtExact(row)}>
                    {startedAt(row)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.hq_user_name || row.hq_user_email ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{adminLabel(row)}</span>
                        {row.hq_user_name && row.hq_user_email && (
                          <span className="text-xs text-muted-foreground">
                            {row.hq_user_email}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.hq_user_id}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/manage/merchants/${row.target_merchant_id}`}
                      className="font-medium hover:underline"
                    >
                      {row.target_merchant_name ?? row.target_merchant_id}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="max-w-xs truncate text-sm text-muted-foreground"
                    title={row.reason ?? undefined}
                  >
                    {row.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.action_count}</TableCell>
                  <TableCell className="text-sm tabular-nums">{duration(row)}</TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {rows.map((row) => (
              <div key={row.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/manage/merchants/${row.target_merchant_id}`}
                      className="block truncate font-semibold hover:underline"
                    >
                      {row.target_merchant_name ?? row.target_merchant_id}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {startedAt(row)}
                    </p>
                  </div>
                  {/* On a muted card the status is plain text, not a pill (§5.3). */}
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      row.end_reason
                        ? "text-muted-foreground"
                        : "font-semibold text-foreground",
                    )}
                  >
                    {statusLabel(row)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="col-span-2 min-w-0">
                    <p className="text-xs text-muted-foreground">HQ admin</p>
                    <p className="truncate font-medium">{adminLabel(row)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Actions</p>
                    <p className="truncate font-medium tabular-nums">{row.action_count}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="truncate font-medium tabular-nums">{duration(row)}</p>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="truncate font-medium" title={row.reason ?? undefined}>
                      {row.reason ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <PaginationBar
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              totalPages,
              hasNextPage: page < totalPages,
              hasPreviousPage: page > 1,
            }}
            onPageChange={setPage}
            isLoading={isFetching}
            itemLabel="sessions"
          />
          {/* PaginationBar renders nothing when one page holds everything (§5.2). */}
          {total <= PAGE_SIZE && (
            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {total} {total === 1 ? "session" : "sessions"}
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
