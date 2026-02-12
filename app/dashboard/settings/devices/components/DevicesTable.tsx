"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown,
  Circle,
  Edit,
  MoreHorizontal,
  RotateCcw,
  Unlink,
  Wifi,
} from "lucide-react";
import {
  StationWithHeartbeat,
  getStationTypeIcon,
  getStationTypeLabel,
  getNetworkTypeLabel,
  formatLastSeen,
} from "../hooks/useDevices";
import { toast } from "sonner";

interface DevicesTableProps {
  devices: StationWithHeartbeat[];
  onEdit: (device: StationWithHeartbeat) => void;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
}

function SortableHeader({
  column,
  label,
  currentSortColumn,
  sortDirection,
  onSort,
}: {
  column: string;
  label: string;
  currentSortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
}) {
  const isActive = currentSortColumn === column;

  return (
    <Button
      variant="ghost"
      onClick={() => onSort(column)}
      className={cn(
        "h-8 px-2 -ml-2 font-medium hover:bg-transparent",
        isActive && "text-primary"
      )}
    >
      {label}
      <ArrowUpDown
        className={cn(
          "ml-1 h-3.5 w-3.5 transition-transform duration-200",
          isActive && sortDirection === "desc" && "rotate-180"
        )}
      />
    </Button>
  );
}

function StatusBadge({ device }: { device: StationWithHeartbeat }) {
  const isOnline =
    device.latest_heartbeat?.is_online ?? device.is_online;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 w-fit",
        isOnline
          ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border-gray-400/50 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      )}
    >
      <Circle
        className={cn(
          "h-2 w-2",
          isOnline
            ? "fill-green-500 text-green-500"
            : "fill-gray-400 text-gray-400"
        )}
      />
      {isOnline ? "ONLINE" : "OFFLINE"}
    </Badge>
  );
}

export function DevicesTable({
  devices,
  onEdit,
  sortColumn,
  sortDirection,
  onSort,
}: DevicesTableProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[250px]">
              <SortableHeader
                column="name"
                label="Station"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[130px]">Type</TableHead>
            <TableHead className="w-[200px]">Device</TableHead>
            <TableHead className="w-[110px]">
              <SortableHeader
                column="status"
                label="Status"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[90px]">App Ver</TableHead>
            <TableHead className="w-[160px]">Network</TableHead>
            <TableHead className="w-[140px]">
              <SortableHeader
                column="lastSeen"
                label="Last Seen"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[60px]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => {
            const isOnline =
              device.latest_heartbeat?.is_online ?? device.is_online;
            const deviceModel =
              device.device_manufacturer && device.device_model
                ? `${device.device_manufacturer} ${device.device_model}`
                : device.hardware_model || "—";
            const appVersion =
              device.latest_heartbeat?.app_version || device.app_version;
            const networkType =
              device.latest_heartbeat?.network_type || device.network_type;
            const lastSeen = formatLastSeen(
              device.latest_heartbeat?.heartbeat_at,
              device.last_heartbeat_at
            );

            return (
              <TableRow
                key={device.id}
                className={cn(
                  "group transition-all duration-200",
                  "hover:bg-muted/50",
                  !isOnline && "opacity-60"
                )}
              >
                {/* Station */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-lg shrink-0">
                      {getStationTypeIcon(device.station_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {device.station_name}
                      </p>
                      {device.station_number != null && (
                        <p className="text-xs text-muted-foreground">
                          Station #{device.station_number}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Type */}
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {getStationTypeLabel(device.station_type)}
                  </span>
                </TableCell>

                {/* Device */}
                <TableCell>
                  <span className="text-sm text-muted-foreground truncate block max-w-[180px]">
                    {deviceModel}
                  </span>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <StatusBadge device={device} />
                </TableCell>

                {/* App Version */}
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {appVersion ? `v${appVersion}` : "—"}
                  </span>
                </TableCell>

                {/* Network */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Wifi className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {getNetworkTypeLabel(networkType)}
                      {device.network_ssid && `: ${device.network_ssid}`}
                    </span>
                  </div>
                </TableCell>

                {/* Last Seen */}
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {lastSeen}
                  </span>
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <span className="sr-only">
                          Open menu for {device.station_name}
                        </span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onEdit(device)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          toast.info("Restart App — Coming soon")
                        }
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restart App
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          toast.info("Unpair — Coming soon")
                        }
                      >
                        <Unlink className="mr-2 h-4 w-4" />
                        Unpair
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
