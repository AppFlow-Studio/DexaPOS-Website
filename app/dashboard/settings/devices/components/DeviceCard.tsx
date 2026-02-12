"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  StationWithHeartbeat,
  getStationTypeLabel,
  getStationTypeIcon,
  getNetworkTypeLabel,
  formatLastSeen,
} from "../hooks/useDevices";
import {
  MoreHorizontal,
  Edit,
  Circle,
  RotateCcw,
  Unlink,
  Wifi,
  Printer,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DeviceCardProps {
  device: StationWithHeartbeat;
  onEdit: (device: StationWithHeartbeat) => void;
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

export function DeviceCard({ device, onEdit }: DeviceCardProps) {
  const isOnline =
    device.latest_heartbeat?.is_online ?? device.is_online;
  const deviceModel =
    device.device_manufacturer && device.device_model
      ? `${device.device_manufacturer} ${device.device_model}`
      : device.hardware_model || "Unknown device";
  const appVersion =
    device.latest_heartbeat?.app_version || device.app_version;
  const networkType =
    device.latest_heartbeat?.network_type || device.network_type;
  const printerStatus = device.latest_heartbeat?.printer_status;
  const cfdConnected = device.latest_heartbeat?.cfd_connected;
  const lastSeen = formatLastSeen(
    device.latest_heartbeat?.heartbeat_at,
    device.last_heartbeat_at
  );

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        !isOnline && "opacity-70"
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg shrink-0">
            {getStationTypeIcon(device.station_type)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge device={device} />
            </div>
            <p className="font-semibold truncate mt-1">
              {device.station_name}
              {device.station_number != null && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (Station #{device.station_number})
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {deviceModel}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 shrink-0">
              <span className="sr-only">Open menu</span>
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
              onClick={() => toast.info("Restart App — Coming soon")}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restart App
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => toast.info("Unpair — Coming soon")}
            >
              <Unlink className="mr-2 h-4 w-4" />
              Unpair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {/* Type / App / OS */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>{getStationTypeLabel(device.station_type)}</span>
          {appVersion && <span>v{appVersion}</span>}
          {device.os_version && <span>Android {device.os_version}</span>}
        </div>

        {/* Peripherals */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Printer className="h-3.5 w-3.5" />
            {printerStatus || (device.has_builtin_printer ? "Built-in" : "N/A")}
          </span>
          <span className="flex items-center gap-1">
            <Monitor className="h-3.5 w-3.5" />
            CFD:{" "}
            {cfdConnected != null
              ? cfdConnected
                ? "Connected"
                : "Disconnected"
              : device.has_builtin_cfd
                ? "Built-in"
                : "N/A"}
          </span>
        </div>

        {/* Network & Last Seen */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground border-t pt-2">
          <span className="flex items-center gap-1">
            <Wifi className="h-3.5 w-3.5" />
            {getNetworkTypeLabel(networkType)}
            {device.network_ssid && `: ${device.network_ssid}`}
          </span>
          <span>Last seen: {lastSeen}</span>
        </div>
      </CardContent>
    </Card>
  );
}
