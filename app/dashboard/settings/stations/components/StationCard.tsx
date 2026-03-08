"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  getSyncRoleLabel,
  formatLastSeen,
} from "../hooks/useStations";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Circle,
  Power,
  PowerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

interface StationCardProps {
  station: StationWithHeartbeat;
  onEdit: (station: StationWithHeartbeat) => void;
  onRemove: (stationId: string) => void;
  onDeactivate: (stationId: string) => void;
  onReactivate: (stationId: string) => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
}

function StatusBadge({ station }: { station: StationWithHeartbeat }) {
  const isOnline = station.latest_heartbeat?.is_online ?? station.is_online;
  const isActive = station.is_active;

  if (!isActive) {
    return (
      <div className="flex flex-col gap-0.5" role="status" aria-label="Deactivated">
        <Badge
          variant="outline"
          className="gap-1.5 w-fit border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400"
        >
          <PowerOff className="h-3 w-3" aria-hidden="true" />
          <span aria-hidden="true">DEACTIVATED</span>
        </Badge>
      </div>
    );
  }

  let offlineDuration = "";
  let ariaLabel = "Online";

  if (!isOnline && station.last_heartbeat_at) {
    offlineDuration = `For ${formatDistanceToNow(
      new Date(station.last_heartbeat_at),
      { addSuffix: false }
    )}`;
    ariaLabel = `Offline for ${formatDistanceToNow(
      new Date(station.last_heartbeat_at)
    )}`;
  } else if (!isOnline) {
    ariaLabel = "Offline";
  }

  return (
    <div className="flex flex-col gap-0.5" role="status" aria-label={ariaLabel}>
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 w-fit transition-all duration-200",
          isOnline
            ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
            : "border-gray-400/50 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        )}
      >
        <Circle
          className={cn(
            "h-2 w-2 transition-colors duration-200",
            isOnline
              ? "fill-green-500 text-green-500"
              : "fill-gray-400 text-gray-400"
          )}
          aria-hidden="true"
        />
        <span aria-hidden="true">{isOnline ? "ONLINE" : "OFFLINE"}</span>
      </Badge>
      {!isOnline && offlineDuration && (
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {offlineDuration}
        </span>
      )}
    </div>
  );
}

function SyncRoleBadge({ role }: { role: StationWithHeartbeat["sync_role"] }) {
  const isLeader = role === "leader";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 w-fit text-xs",
        isLeader
          ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-gray-300/50 bg-gray-100/50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400"
      )}
    >
      {getSyncRoleLabel(role)}
    </Badge>
  );
}

function StationIcon({
  type,
  className,
}: {
  type: StationWithHeartbeat["station_type"];
  className?: string;
}) {
  const label = getStationTypeLabel(type);
  const icon = getStationTypeIcon(type);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-muted text-2xl",
        className
      )}
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{icon}</span>
    </div>
  );
}

export function StationCard({
  station,
  onEdit,
  onRemove,
  onDeactivate,
  onReactivate,
  isSelected,
  onSelect,
}: StationCardProps) {
  const router = useRouter();
  const isOnline = station.latest_heartbeat?.is_online ?? station.is_online;
  const isOffline = !isOnline;
  const isInactive = !station.is_active;

  const handleCardClick = () => {
    router.push(`/dashboard/settings/stations/${station.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Card
        onClick={handleCardClick}
        className={cn(
          "group transition-all duration-200 ease-out cursor-pointer",
          "hover:shadow-md hover:scale-[1.01]",
          (isOffline || isInactive) && "opacity-60",
          isSelected && "ring-2 ring-primary"
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelect(!!checked)}
                aria-label={`Select ${station.station_name}`}
                className="mt-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
            </div>
            <StationIcon type={station.station_type} className="h-12 w-12" />
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">
                {station.station_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {getStationTypeLabel(station.station_type)}
                {station.station_code && ` (${station.station_code})`}
              </span>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="sr-only">Open menu for {station.station_name}</span>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onEdit(station)}>
                  <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {station.is_active ? (
                  <DropdownMenuItem
                    onClick={() => onDeactivate(station.id)}
                    className="text-amber-600 focus:text-amber-600"
                  >
                    <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onReactivate(station.id)}
                    className="text-green-600 focus:text-green-600"
                  >
                    <Power className="mr-2 h-4 w-4" aria-hidden="true" />
                    Reactivate
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onRemove(station.id)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <StatusBadge station={station} />
            <SyncRoleBadge role={station.sync_role} />
          </div>

          <div className="space-y-2 pt-2 border-t">
            {station.station_number && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Station #</span>
                <span className="font-medium">{station.station_number}</span>
              </div>
            )}
            {station.device_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Device</span>
                <span className="truncate max-w-[140px]">{station.device_name}</span>
              </div>
            )}
            {station.hardware_model && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Model</span>
                <span>{station.hardware_model}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Last Seen</span>
              <span>
                {formatLastSeen(
                  station.latest_heartbeat?.heartbeat_at,
                  station.last_heartbeat_at
                )}
              </span>
            </div>
          </div>

          {/* Capabilities Summary */}
          <div className="pt-2 border-t">
            <div className="flex flex-wrap gap-1">
              {station.can_create_orders && (
                <Badge variant="secondary" className="text-xs">Orders</Badge>
              )}
              {station.can_process_payments && (
                <Badge variant="secondary" className="text-xs">Payments</Badge>
              )}
              {station.can_void_orders && (
                <Badge variant="secondary" className="text-xs">Voids</Badge>
              )}
              {station.can_update_kitchen_status && (
                <Badge variant="secondary" className="text-xs">Kitchen</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
