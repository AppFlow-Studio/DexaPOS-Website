"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ListImpersonationSessions,
  type ImpersonationSessionRow,
} from "@/app/manage/actions/impersonation-audit";

const PAGE_SIZE = 50;

const endReasonStyles: Record<string, string> = {
  user_exit: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  idle_timeout: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  revoked_access: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  session_expired: "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300",
  superseded: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
};

export default function ImpersonationAuditPage() {
  const [rows, setRows] = useState<ImpersonationSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await ListImpersonationSessions({}, PAGE_SIZE, 0);
    if (res.error) setError(res.error);
    else {
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/manage/audit-logs"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to all audit logs
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-amber-500" />
            HQ Impersonation Sessions
          </h1>
          <p className="text-muted-foreground">
            Every time an HQ admin acted as a merchant. Per-action audit rows
            link back here via <code>impersonation_session_id</code>.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="self-start sm:self-auto flex-shrink-0"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
          <CardDescription>
            Showing the latest {PAGE_SIZE} sessions. {total} total recorded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Error: {error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No impersonation sessions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>HQ Admin</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Ended</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const ended = row.ended_at ? new Date(row.ended_at) : null;
                  const started = new Date(row.started_at);
                  const duration = ended
                    ? formatDistanceToNow(started, { addSuffix: false, includeSeconds: true })
                    : "active";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm tabular-nums">
                        {format(started, "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.hq_user_name || row.hq_user_email ? (
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.hq_user_name ?? row.hq_user_email}
                            </span>
                            {row.hq_user_name && row.hq_user_email ? (
                              <span className="text-xs text-muted-foreground">
                                {row.hq_user_email}
                              </span>
                            ) : null}
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
                          className="hover:underline font-medium"
                        >
                          {row.target_merchant_name ?? row.target_merchant_id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {row.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.action_count}
                      </TableCell>
                      <TableCell className="text-sm">{duration}</TableCell>
                      <TableCell>
                        {row.end_reason ? (
                          <Badge className={endReasonStyles[row.end_reason] ?? ""}>
                            {row.end_reason.replace("_", " ")}
                          </Badge>
                        ) : (
                          <Badge variant="outline">active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
