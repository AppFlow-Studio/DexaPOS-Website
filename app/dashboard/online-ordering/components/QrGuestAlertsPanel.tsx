"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getQrGuestAlertsSnapshot,
  resolveQrGuestAlertAction,
  type QrGuestAlertsSnapshot,
} from "../actions";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

function formatRelativeAge(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const diffMs = Math.max(0, Date.now() - then);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getAgeTone(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "text-muted-foreground";
  const diffMinutes = Math.floor((Date.now() - then) / 60000);
  if (diffMinutes >= 10) return "text-amber-700";
  return "text-muted-foreground";
}

export function QrGuestAlertsPanel({
  locationId,
}: {
  locationId: string;
}) {
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<QrGuestAlertsSnapshot>({
    queryKey: ["merchant-qr-guest-alerts", locationId],
    queryFn: () => getQrGuestAlertsSnapshot(locationId),
    enabled: Boolean(locationId),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!locationId) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`location:${locationId}:orders`)
      .on("broadcast", { event: "qr_guest_alert_changed" }, () => {
        void queryClient.invalidateQueries({
          queryKey: ["merchant-qr-guest-alerts", locationId],
        });
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [locationId, queryClient]);

  const resolveMutation = useMutation({
    mutationFn: async (alertId: string) => {
      setResolvingId(alertId);
      return resolveQrGuestAlertAction(alertId);
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error || "Failed to resolve alert");
        return;
      }
      toast.success("Guest alert resolved");
      await queryClient.invalidateQueries({
        queryKey: ["merchant-qr-guest-alerts", locationId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to resolve alert");
    },
    onSettled: () => {
      setResolvingId(null);
    },
  });

  const openCount = data?.openCount ?? 0;
  const hasAlerts = openCount > 0;

  const headerBadge = useMemo(() => {
    if (!hasAlerts) return <Badge variant="outline">0 open</Badge>;
    return <Badge className="bg-amber-500 hover:bg-amber-500">{openCount} open</Badge>;
  }, [hasAlerts, openCount]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Open QR Guest Alerts
            </CardTitle>
            <CardDescription>
              Staff-side verification surface for the guest `Call your server` flow.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {headerBadge}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isLoading || isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading QR guest alerts...
          </div>
        ) : data?.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {data.error}
          </div>
        ) : !hasAlerts ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            No open guest alerts for this location right now.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Table {alert.tableLabel}</Badge>
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                      {alert.alertType === "call_server" ? "Call server" : alert.alertType}
                    </Badge>
                    <span className={`text-xs ${getAgeTone(alert.createdAt)}`}>
                      {formatRelativeAge(alert.createdAt)}
                    </span>
                  </div>
                  {alert.message ? (
                    <div className="flex items-start gap-2 text-sm text-foreground">
                      <MessageSquareText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <p>{alert.message}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No guest note was included.</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => resolveMutation.mutate(alert.id)}
                    disabled={resolveMutation.isPending && resolvingId === alert.id}
                  >
                    {resolveMutation.isPending && resolvingId === alert.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
