"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ArrowUpDown,
  Power,
  PowerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface StationsTableProps {
  stations: StationWithHeartbeat[];
  onEdit: (station: StationWithHeartbeat) => void;
  onRemove: (stationId: string) => void;
  onDeactivate: (stationId: string) => void;
  onReactivate: (stationId: string) => void;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  selectedStationIds: string[];
  onSelectStation: (stationId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  allStationIds: string[];
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
  const ariaSort = isActive
    ? sortDirection === "asc"
      ? "ascending"
      : "descending"
    : undefined;

  return (
    <Button
      variant="ghost"
      onClick={() => onSort(column)}
      className={cn(
        "h-8 px-2 -ml-2 font-medium hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isActive && "text-primary"
      )}
      aria-sort={ariaSort}
    >
      {label}
      <ArrowUpDown
        className={cn(
          "ml-1 h-3.5 w-3.5 transition-transform duration-200",
          isActive && sortDirection === "desc" && "rotate-180"
        )}
        aria-hidden="true"
      />
    </Button>
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
        "flex items-center justify-center rounded-lg bg-muted text-lg",
        className
      )}
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{icon}</span>
    </div>
  );
}

export function StationsTable({
  stations,
  onEdit,
  onRemove,
  onDeactivate,
  onReactivate,
  sortColumn,
  sortDirection,
  onSort,
  selectedStationIds,
  onSelectStation,
  onSelectAll,
  allStationIds,
}: StationsTableProps) {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const tableRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const handleRowClick = useCallback(
    (stationId: string) => {
      router.push(`/dashboard/settings/stations/${stationId}`);
    },
    [router]
  );

  const allSelected =
    allStationIds.length > 0 &&
    allStationIds.every((id) => selectedStationIds.includes(id));
  const someSelected = selectedStationIds.length > 0 && !allSelected;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, station: StationWithHeartbeat) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (index < stations.length - 1) {
            setFocusedIndex(index + 1);
            rowRefs.current[index + 1]?.focus();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (index > 0) {
            setFocusedIndex(index - 1);
            rowRefs.current[index - 1]?.focus();
          }
          break;
        case " ":
          e.preventDefault();
          onSelectStation(station.id, !selectedStationIds.includes(station.id));
          break;
      }
    },
    [stations.length, onSelectStation, selectedStationIds]
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table ref={tableRef} role="grid" aria-label="Stations list">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[50px]">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={(checked) => onSelectAll(!!checked)}
                aria-label="Select all stations"
              />
            </TableHead>
            <TableHead className="w-[240px]">
              <SortableHeader
                column="name"
                label="Station Name"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[150px]">Type</TableHead>
            <TableHead className="w-[100px]">
              <SortableHeader
                column="station_number"
                label="Number"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[120px]">
              <SortableHeader
                column="status"
                label="Status"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[100px]">Sync Role</TableHead>
            <TableHead className="w-[160px]">Device</TableHead>
            <TableHead className="w-[150px]">
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
          {stations.map((station, index) => {
            const isOffline = !station.is_online;
            const isInactive = !station.is_active;
            const isSelected = selectedStationIds.includes(station.id);
            const isFocused = focusedIndex === index;

            return (
              <TableRow
                key={station.id}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                tabIndex={index === 0 || isFocused ? 0 : -1}
                role="row"
                aria-selected={isSelected}
                aria-rowindex={index + 1}
                onKeyDown={(e) => handleKeyDown(e, index, station)}
                onFocus={() => setFocusedIndex(index)}
                onClick={() => handleRowClick(station.id)}
                className={cn(
                  "group cursor-pointer transition-all duration-200 ease-out",
                  "hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  (isOffline || isInactive) && "opacity-60",
                  isSelected && "bg-muted/30",
                  isFocused && "bg-muted/40"
                )}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      onSelectStation(station.id, !!checked)
                    }
                    aria-label={`Select ${station.station_name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <StationIcon type={station.station_type} className="h-10 w-10" />
                    <div className="flex flex-col">
                      <span className="font-medium">{station.station_name}</span>
                      {station.station_code && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {station.station_code}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {getStationTypeLabel(station.station_type)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {station.station_number ? `#${station.station_number}` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge station={station} />
                </TableCell>
                <TableCell>
                  <SyncRoleBadge role={station.sync_role} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground truncate max-w-[140px]">
                      {station.device_name || "—"}
                    </span>
                    {station.hardware_model && (
                      <span className="text-xs text-muted-foreground/70">
                        {station.hardware_model}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatLastSeen(
                      station.latest_heartbeat?.heartbeat_at,
                      station.last_heartbeat_at
                    )}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="sr-only">
                          Open menu for {station.station_name}
                        </span>
                        <MoreHorizontal
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
