"use client";

import { useMemo, useState } from "react";
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
import {
  ArrowRightLeft,
  Plus,
  MapPin,
  PackageCheck,
  Truck,
  XCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import {
  useTransfers,
  useTransferDetail,
  useMerchantLocations,
  useInitiateTransfer,
  useReceiveTransfer,
  useCancelTransfer,
  useParLevelShortfalls,
  useGenerateParLevelPOs,
} from "../hooks/useTransfers";
import { CreateTransferDialog, TransferPickItem } from "./CreateTransferDialog";
import { ReceiveTransferDialog } from "./ReceiveTransferDialog";
import { TransferStatus } from "../../actions/transfers";

const STATUS_STYLES: Record<TransferStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  in_transit:
    "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-950/30",
  received:
    "border-emerald-500/50 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  cancelled:
    "border-rose-500/50 text-rose-600 bg-rose-50 dark:bg-rose-950/30",
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  in_transit: "In Transit",
  received: "Received",
  cancelled: "Cancelled",
};

interface TransfersTabProps {
  items: TransferPickItem[];
  isAllLocations: boolean;
}

export function TransfersTab({ items, isAllLocations }: TransfersTabProps) {
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();

  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveTransferId, setReceiveTransferId] = useState<string | null>(
    null,
  );

  const { data: transfers = [], isLoading } = useTransfers();
  const { data: locations = [] } = useMerchantLocations();
  const { data: shortfalls = [] } = useParLevelShortfalls();
  const { data: receiveDetail, isLoading: isDetailLoading } =
    useTransferDetail(receiveTransferId);

  const initiateTransfer = useInitiateTransfer();
  const receiveTransfer = useReceiveTransfer();
  const cancelTransfer = useCancelTransfer();
  const generatePOs = useGenerateParLevelPOs();

  const inTransitCount = useMemo(
    () => transfers.filter((t) => t.status === "in_transit").length,
    [transfers],
  );

  if (isAllLocations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-3 rounded-full bg-muted mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Select a specific location</p>
        <p className="text-sm text-muted-foreground mt-1">
          Transfers move stock between locations. Choose a location from the
          switcher to send or receive transfers.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="rounded-xl border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              In Transit
            </p>
            <p className="text-2xl font-bold text-blue-600">{inTransitCount}</p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Total Transfers
            </p>
            <p className="text-2xl font-bold">{transfers.length}</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Transfer
        </Button>
      </div>

      {/* Par-level reorder suggestion */}
      {shortfalls.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-50/60 px-5 py-4 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {shortfalls.length} item{shortfalls.length !== 1 ? "s" : ""}{" "}
                below par level
              </p>
              <p className="text-xs text-muted-foreground">
                Generate draft purchase orders (grouped by vendor) to restock up
                to par.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2 border-amber-500/40"
            disabled={generatePOs.isPending}
            onClick={() => generatePOs.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            Generate Draft POs
          </Button>
        </div>
      )}

      {/* Transfers table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-full bg-muted mb-3">
            <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No transfers yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use &quot;New Transfer&quot; to move stock to another location.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => {
                const isDestination =
                  t.to_location_id === selectedLocationId;
                const isSource = t.from_location_id === selectedLocationId;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-medium">
                      {t.transfer_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>{t.from_location?.name ?? "—"}</span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <span>{t.to_location?.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(STATUS_STYLES[t.status])}
                      >
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.items_count ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "in_transit" && isDestination && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => {
                            setReceiveTransferId(t.id);
                            setReceiveOpen(true);
                          }}
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          Receive
                        </Button>
                      )}
                      {t.status === "in_transit" && isSource && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-rose-600"
                          disabled={cancelTransfer.isPending}
                          onClick={() => cancelTransfer.mutate(t.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      )}
                      {t.status === "in_transit" &&
                        !isDestination &&
                        !isSource && (
                          <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Truck className="h-3.5 w-3.5" />
                            En route
                          </span>
                        )}
                      {t.status !== "in_transit" && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateTransferDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        items={items}
        fromLocationId={selectedLocationId}
        fromLocationName={selectedLocation?.name ?? "this location"}
        locations={locations}
        isPending={initiateTransfer.isPending}
        onConfirm={async (input) => {
          await initiateTransfer.mutateAsync(input);
        }}
      />

      <ReceiveTransferDialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiveTransferId(null);
        }}
        detail={receiveDetail}
        isLoading={isDetailLoading}
        isPending={receiveTransfer.isPending}
        onConfirm={async (receivedItems) => {
          if (receiveTransferId) {
            await receiveTransfer.mutateAsync({
              transferId: receiveTransferId,
              receivedItems,
            });
          }
        }}
      />
    </div>
  );
}
