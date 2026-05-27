"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateMissingQrCodesForLocation,
  generateQrCodeForTable,
  getQrTableManagerSnapshot,
  revokeTableQrCode,
  type QrTableManagerRow,
  type QrTableManagerSnapshot,
} from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Ban, Loader2, QrCode, RefreshCw, RotateCcw, ScanLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface QrTableManagerProps {
  locationId: string;
  locationName: string;
  acceptsDineIn: boolean;
  qrKillSwitch: boolean;
}

function getStatusBadge(status: QrTableManagerRow["qrStatus"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    default:
      return <Badge variant="outline">Not generated</Badge>;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function QrTableManager({
  locationId,
  locationName,
  acceptsDineIn,
  qrKillSwitch,
}: QrTableManagerProps) {
  const [snapshot, setSnapshot] = useState<QrTableManagerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getQrTableManagerSnapshot(locationId);
      setSnapshot(result);
      if (!result.success && result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load QR manager"
      );
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, QrTableManagerRow[]>();
    for (const row of snapshot?.tables ?? []) {
      const key = row.zoneName || "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return Array.from(groups.entries());
  }, [snapshot?.tables]);

  async function withBusy<T>(key: string, work: () => Promise<T>) {
    setBusyKey(key);
    try {
      return await work();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleGenerateMissing() {
    await withBusy("bulk-generate", async () => {
      const result = await generateMissingQrCodesForLocation(locationId);
      if (!result.success) {
        toast.error(result.error || "Failed to generate QR codes");
        return;
      }
      toast.success(
        result.generated > 0
          ? `Generated ${result.generated} QR code${result.generated === 1 ? "" : "s"}`
          : "No missing QR codes to generate"
      );
      await loadSnapshot();
    });
  }

  async function handleGenerate(row: QrTableManagerRow, regenerate = false) {
    const busyLabel = regenerate ? `regen-${row.floorPlanObjectId}` : `gen-${row.floorPlanObjectId}`;
    await withBusy(busyLabel, async () => {
      const result = await generateQrCodeForTable(row.floorPlanObjectId, {
        regenerate,
      });
      if (!result.success) {
        toast.error(result.error || `Failed to update ${row.tableLabel}`);
        return;
      }
      if (result.action === "reprint_existing") {
        toast.success(`Existing QR is ready to reprint for ${row.tableLabel}`);
      } else if (regenerate) {
        toast.success(`QR regenerated for ${row.tableLabel}`);
      } else {
        toast.success(`QR generated for ${row.tableLabel}`);
      }
      await loadSnapshot();
    });
  }

  async function handleRevoke(row: QrTableManagerRow) {
    await withBusy(`revoke-${row.floorPlanObjectId}`, async () => {
      const result = await revokeTableQrCode(row.floorPlanObjectId);
      if (!result.success) {
        toast.error(result.error || `Failed to revoke ${row.tableLabel}`);
        return;
      }
      toast.success(`QR revoked for ${row.tableLabel}`);
      await loadSnapshot();
    });
  }

  return (
    <Card className="border-[#0C4FD1]/15">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#0C4FD1]" />
              QR Code Manager
            </CardTitle>
            <CardDescription>
              Manage table QR generation state for {locationName}. This dashboard slice handles generation, regeneration, revoke, and scan visibility. Printable templates and exact guest preview stay separate until the QR storefront route is fully wired.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadSnapshot()}
              disabled={isLoading || busyKey !== null}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerateMissing()}
              disabled={isLoading || busyKey !== null}
            >
              {busyKey === "bulk-generate" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="mr-2 h-4 w-4" />
              )}
              Generate Missing
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tables
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {snapshot?.tables.length ?? 0}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Generated
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {snapshot?.generatedCount ?? 0}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Active
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {snapshot?.activeCount ?? 0}
            </p>
          </div>
        </div>

        {!acceptsDineIn ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            QR scan handling is currently disabled for this store. You can still prepare codes here, but guests will not be allowed to order from scans until <span className="font-medium">Enable QR Table Ordering</span> is turned on above.
          </div>
        ) : null}

        {qrKillSwitch ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            QR kill switch is active. Existing codes remain visible here, but new guest scans should fail closed until the switch is turned off.
          </div>
        ) : null}

        {snapshot && !snapshot.success && snapshot.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {snapshot.error}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading table QR manager...
          </div>
        ) : null}

        {!isLoading && (snapshot?.tables.length ?? 0) === 0 ? (
          <div className="rounded-lg border bg-background px-4 py-8 text-sm text-muted-foreground">
            No active tables or booths were found for this location. Add floor-plan tables first, then come back here to generate QR codes.
          </div>
        ) : null}

        {!isLoading &&
          groupedRows.map(([zoneName, rows]) => (
            <div key={zoneName} className="space-y-3 rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{zoneName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {rows.length} table{rows.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant="outline">{rows.filter((row) => row.qrStatus === "active").length} active</Badge>
              </div>

              <div className="space-y-3">
                {rows.map((row) => {
                  const isBusy =
                    busyKey === `gen-${row.floorPlanObjectId}` ||
                    busyKey === `regen-${row.floorPlanObjectId}` ||
                    busyKey === `revoke-${row.floorPlanObjectId}`;

                  return (
                    <div
                      key={row.floorPlanObjectId}
                      className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{row.tableLabel}</p>
                          {getStatusBadge(row.qrStatus)}
                          {row.capacity ? (
                            <Badge variant="outline">Seats {row.capacity}</Badge>
                          ) : null}
                          {row.tokenVersion ? (
                            <Badge variant="secondary">v{row.tokenVersion}</Badge>
                          ) : null}
                        </div>

                        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <p>Scans (7d): <span className="font-medium text-foreground">{row.scanCount7d}</span></p>
                          <p>Scans (all): <span className="font-medium text-foreground">{row.scanCountLifetime}</span></p>
                          <p>Generated: <span className="font-medium text-foreground">{formatDateTime(row.generatedAt)}</span></p>
                          <p>Last scanned: <span className="font-medium text-foreground">{formatDateTime(row.lastScannedAt)}</span></p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {row.qrStatus === "not_generated" ? (
                          <Button
                            size="sm"
                            onClick={() => void handleGenerate(row, false)}
                            disabled={busyKey !== null}
                          >
                            {isBusy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <QrCode className="mr-2 h-4 w-4" />
                            )}
                            Generate
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleGenerate(row, false)}
                              disabled={busyKey !== null}
                            >
                              {isBusy && busyKey?.startsWith("gen-") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Reprint
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleGenerate(row, true)}
                              disabled={busyKey !== null}
                            >
                              {isBusy && busyKey?.startsWith("regen-") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-2 h-4 w-4" />
                              )}
                              Regenerate
                            </Button>
                            {row.qrStatus === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleRevoke(row)}
                                disabled={busyKey !== null}
                              >
                                {isBusy && busyKey?.startsWith("revoke-") ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Ban className="mr-2 h-4 w-4" />
                                )}
                                Revoke
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm text-muted-foreground",
            "bg-[#0C4FD1]/5 border-[#0C4FD1]/15"
          )}
        >
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-[#0C4FD1]" />
            <p>
              This manager is intentionally limited to generation state, rotation, and revoke. Exact guest preview and printable templates stay separate until the QR storefront route and export surfaces are wired end-to-end.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
