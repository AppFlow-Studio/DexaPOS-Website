"use client";

import { Fragment, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { usePushChannelsHistory } from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import { ChannelStatusPills } from "./ChannelStatusPills";

// ============================================================================
// PushChannelsHistoryCard — audit log table for push_channels syncs.
// ============================================================================

interface PushChannelsHistoryCardProps {
  clerkOrgId: string;
  locationId: string;
  menuId?: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="bg-green-600">
          Success
        </Badge>
      );
    case "partial":
      return (
        <Badge variant="default" className="bg-amber-500">
          Partial
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "syncing":
    case "pending":
      return <Badge variant="secondary">Syncing…</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function PushChannelsHistoryCard({
  clerkOrgId,
  locationId,
  menuId,
}: PushChannelsHistoryCardProps) {
  const { data, isLoading } = usePushChannelsHistory(clerkOrgId, locationId, {
    menuId,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = data?.data ?? [];

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Channel Push History
        </CardTitle>
        <CardDescription>
          Recent pushes from DexaPOS to delivery platforms via OrderOut.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            icon={History}
            title="No channel pushes yet"
            description="Use “Push to Channels” above to fan a menu out to delivery platforms."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu</TableHead>
                <TableHead>Triggered</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Per-channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.syncId);
                const progress = `${row.pushedToChannels.length}/${row.expectedChannels.length}`;
                return (
                  <Fragment key={row.syncId}>
                    <TableRow>
                      <TableCell className="font-medium">
                        {row.menuName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {progress}
                      </TableCell>
                      <TableCell>
                        <ChannelStatusPills
                          expectedChannels={row.expectedChannels}
                          reportedChannels={row.pushedToChannels}
                          perChannelResults={row.perChannelResults}
                        />
                      </TableCell>
                      <TableCell>{getStatusBadge(row.syncStatus)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggle(row.syncId)}
                          disabled={row.perChannelResults.length === 0}
                        >
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="space-y-2 p-2">
                            {row.perChannelResults.map((r, idx) => (
                              <div
                                key={`${row.syncId}-${r.deliveryService}-${idx}`}
                                className="rounded border bg-background p-2"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">
                                    {r.deliveryService}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {r.statusCode != null && (
                                      <span className="text-xs text-muted-foreground font-mono">
                                        HTTP {r.statusCode}
                                      </span>
                                    )}
                                    {getStatusBadge(r.status)}
                                  </div>
                                </div>
                                {r.errorMessage && (
                                  <p className="mt-1 text-xs text-red-600">
                                    {r.errorMessage}
                                  </p>
                                )}
                                {r.rawResponse ? (
                                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                                    {JSON.stringify(r.rawResponse, null, 2)}
                                  </pre>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
