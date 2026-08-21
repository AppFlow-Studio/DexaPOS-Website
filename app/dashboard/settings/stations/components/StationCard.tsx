"use client";

import { useRouter } from "next/navigation";
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
import { motion } from "motion/react";

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

  // One neutral pill for every state (§4.6b / D-12) — matches StationsTable.
  if (!isActive) {
    return (
      <div className="flex flex-col gap-0.5" role="status" aria-label="Deactivated">
        <Badge className="w-fit shrink-0 gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
          <PowerOff className="h-3 w-3" aria-hidden="true" />
          <span aria-hidden="true">Deactivated</span>
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
      <Badge className="w-fit shrink-0 gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
        <Circle
          className={cn(
            "h-2 w-2 transition-colors duration-200",
            // Filled when online, hollow when offline — shape, not hue.
            isOnline ? "fill-current" : "fill-transparent"
          )}
          aria-hidden="true"
        />
        <span aria-hidden="true">{isOnline ? "Online" : "Offline"}</span>
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
  return (
    <Badge className="w-fit shrink-0 gap-1 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
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
        "flex shrink-0 items-center justify-center rounded-full bg-muted/60 text-2xl",
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
      {/* Card grid below `xl` (§5.3): `rounded-2xl border-0 bg-muted/45`, with
          the selected state as a ring rather than a border. No shadow — panels
          in this language have none. */}
      <div
        onClick={handleCardClick}
        className={cn(
          "group min-w-0 cursor-pointer rounded-2xl border-0 bg-muted/45 p-4 transition-colors duration-200",
          (isOffline || isInactive) && "opacity-60",
          isSelected ? "bg-muted ring-1 ring-border" : "hover:bg-muted"
        )}
      >
        <div className="flex min-w-0 flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelect(!!checked)}
                aria-label={`Select ${station.station_name}`}
                className="mt-1"
              />
            </div>
            <StationIcon type={station.station_type} className="h-12 w-12" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-foreground">
                {station.station_name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {getStationTypeLabel(station.station_type)}
                {station.station_code && ` (${station.station_code})`}
              </span>
            </div>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
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
                {/* Ordinary actions carry no hue; only Delete is destructive
                    (§4.6b exception 1). */}
                {station.is_active ? (
                  <DropdownMenuItem onClick={() => onDeactivate(station.id)}>
                    <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onReactivate(station.id)}>
                    <Power className="mr-2 h-4 w-4" aria-hidden="true" />
                    Reactivate
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onRemove(station.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Separation by spacing, not `border-t` rules (§5.5). */}
        <div className="mt-4 min-w-0 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <StatusBadge station={station} />
            <SyncRoleBadge role={station.sync_role} />
          </div>

          <div className="mt-5 min-w-0 space-y-2">
            {station.station_number && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Station #</span>
                <span className="font-medium tabular-nums">{station.station_number}</span>
              </div>
            )}
            {station.device_name && (
              <div className="flex min-w-0 justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">Device</span>
                <span className="min-w-0 truncate">{station.device_name}</span>
              </div>
            )}
            {station.hardware_model && (
              <div className="flex min-w-0 justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">Model</span>
                <span className="min-w-0 truncate">{station.hardware_model}</span>
              </div>
            )}
            <div className="flex min-w-0 justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">Last Seen</span>
              <span className="min-w-0 truncate tabular-nums">
                {formatLastSeen(
                  station.latest_heartbeat?.heartbeat_at,
                  station.last_heartbeat_at
                )}
              </span>
            </div>
          </div>

          {/* Capabilities Summary */}
          <div className="mt-5 flex flex-wrap gap-1">
            {station.can_create_orders && (
              <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">Orders</Badge>
            )}
            {station.can_process_payments && (
              <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">Payments</Badge>
            )}
            {station.can_void_orders && (
              <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">Voids</Badge>
            )}
            {station.can_update_kitchen_status && (
              <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">Kitchen</Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
