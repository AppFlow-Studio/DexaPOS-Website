"use client";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpDown,
  Circle,
  Edit,
  Eye,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  Device,
  getDeviceTypeIcon,
  getDeviceTypeLabel,
} from "../hooks/useDevices";

interface DevicesTableProps {
  devices: Device[];
  onEdit: (device: Device) => void;
  onRemove: (deviceId: string) => void;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  // Selection props
  selectedDeviceIds: string[];
  onSelectDevice: (deviceId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  allDeviceIds: string[]; // All device IDs for "select all" functionality
}

// Accessible Status Badge with aria-label
function StatusBadge({ device }: { device: Device }) {
  const isOnline = device.status === "online";

  // Calculate durations
  let durationText = "";
  let ariaLabel = isOnline ? "Online" : "Offline";

  if (isOnline && device.connectedSince) {
    durationText = `Since ${formatDistanceToNow(
      new Date(device.connectedSince),
      {
        addSuffix: false,
      },
    )}`;
    ariaLabel = `Online since ${format(
      new Date(device.connectedSince),
      "MMM d, h:mm a",
    )}`;
  } else if (!isOnline && device.offlineSince) {
    durationText = `For ${formatDistanceToNow(new Date(device.offlineSince), {
      addSuffix: false,
    })}`;
    ariaLabel = `Offline for ${formatDistanceToNow(
      new Date(device.offlineSince),
    )}`;
  }

  return (
    <div className="flex flex-col gap-0.5" role="status" aria-label={ariaLabel}>
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 w-fit transition-all duration-200",
          isOnline
            ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
            : "border-gray-400/50 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        )}
      >
        <Circle
          className={cn(
            "h-2 w-2 transition-colors duration-200",
            isOnline
              ? "fill-green-500 text-green-500"
              : "fill-gray-400 text-gray-400",
          )}
          aria-hidden="true"
        />
        <span aria-hidden="true">{isOnline ? "ONLINE" : "OFFLINE"}</span>
      </Badge>
      {durationText && (
        <span
          className="text-[10px] uppercase font-bold text-muted-foreground/70 ml-1"
          aria-hidden="true"
        >
          {durationText}
        </span>
      )}
    </div>
  );
}

// Accessible Alerts Cell
function AlertsCell({ alerts }: { alerts: number }) {
  const ariaLabel =
    alerts === 0
      ? "No alerts"
      : `${alerts} active alert${alerts !== 1 ? "s" : ""}`;

  if (alerts === 0) {
    return (
      <div
        className="flex items-center gap-1.5 text-muted-foreground"
        role="status"
        aria-label={ariaLabel}
      >
        <span className="text-sm" aria-hidden="true">
          0
        </span>
        <span className="text-green-500" aria-hidden="true">
          ✓
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-yellow-600"
      role="status"
      aria-label={ariaLabel}
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span className="font-medium" aria-hidden="true">
        {alerts}
      </span>
    </div>
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
        isActive && "text-primary",
      )}
      aria-sort={ariaSort}
    >
      {label}
      <ArrowUpDown
        className={cn(
          "ml-1 h-3.5 w-3.5 transition-transform duration-200",
          isActive && sortDirection === "desc" && "rotate-180",
        )}
        aria-hidden="true"
      />
    </Button>
  );
}

// Device type icon with accessible label
function DeviceIcon({
  type,
  className,
}: {
  type: Device["type"];
  className?: string;
}) {
  const label = getDeviceTypeLabel(type);
  const icon = getDeviceTypeIcon(type);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-muted text-lg",
        className,
      )}
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{icon}</span>
    </div>
  );
}

export function DevicesTable({
  devices,
  onEdit,
  onRemove,
  sortColumn,
  sortDirection,
  onSort,
  selectedDeviceIds,
  onSelectDevice,
  onSelectAll,
  allDeviceIds,
}: DevicesTableProps) {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const tableRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const allSelected =
    allDeviceIds.length > 0 &&
    allDeviceIds.every((id) => selectedDeviceIds.includes(id));
  const someSelected = selectedDeviceIds.length > 0 && !allSelected;

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, device: Device) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (index < devices.length - 1) {
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
        case "Enter":
          e.preventDefault();
          router.push(`/dashboard/settings/devices/${device.id}`);
          break;
        case " ":
          // Space toggles selection
          e.preventDefault();
          onSelectDevice(device.id, !selectedDeviceIds.includes(device.id));
          break;
      }
    },
    [devices.length, router, onSelectDevice, selectedDeviceIds],
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table ref={tableRef} role="grid" aria-label="Devices list">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[50px]">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  onSelectAll(!!checked)
                }
                aria-label="Select all devices"
              />
            </TableHead>
            <TableHead className="w-[280px]">
              <SortableHeader
                column="name"
                label="Device name"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[180px]">Device type</TableHead>
            <TableHead className="w-[140px]">
              <SortableHeader
                column="status"
                label="Status"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[100px]">
              <SortableHeader
                column="alerts"
                label="Alerts"
                currentSortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="w-[160px]">Serial number</TableHead>
            <TableHead className="w-[180px]">
              <SortableHeader
                column="lastSeen"
                label="Last seen"
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
          {devices.map((device, index) => {
            const isOffline = device.status === "offline";
            const isSelected = selectedDeviceIds.includes(device.id);
            const isFocused = focusedIndex === index;

            return (
              <TableRow
                key={device.id}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                tabIndex={index === 0 || isFocused ? 0 : -1}
                role="row"
                aria-selected={isSelected}
                aria-rowindex={index + 1}
                onKeyDown={(e) => handleKeyDown(e, index, device)}
                onFocus={() => setFocusedIndex(index)}
                className={cn(
                  "group cursor-pointer transition-all duration-200 ease-out",
                  "hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  isOffline && "opacity-60",
                  isSelected && "bg-muted/30",
                  isFocused && "bg-muted/40",
                )}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                      onSelectDevice(device.id, !!checked)
                    }
                    aria-label={`Select ${device.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <DeviceIcon type={device.type} className="h-10 w-10" />
                    <div className="flex flex-col">
                      <Link
                        href={`/dashboard/settings/devices/${device.id}`}
                        className="font-medium hover:underline hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
                      >
                        {device.name}
                      </Link>
                      {device.model && (
                        <span className="text-xs text-muted-foreground">
                          {device.model}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {getDeviceTypeLabel(device.type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge device={device} />
                </TableCell>
                <TableCell>
                  <AlertsCell alerts={device.alerts} />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-muted-foreground">
                    {device.serialNumber || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {device.lastSeen
                      ? format(new Date(device.lastSeen), "MMM d, yyyy h:mm a")
                      : "—"}
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
                          Open menu for {device.name}
                        </span>
                        <MoreHorizontal
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/settings/devices/${device.id}`}>
                          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                          View details
                        </Link>
                      </DropdownMenuItem>
                      {(device.type === "external_terminal" ||
                        device.type === "tablet") && (
                        <DropdownMenuItem onClick={() => onEdit(device)}>
                          <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onRemove(device.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Remove
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
