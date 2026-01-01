"use client";

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
  Device,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
} from "../hooks/useDevices";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { motion } from "framer-motion";

interface DeviceCardProps {
  device: Device;
  onEdit: (device: Device) => void;
  onRemove: (deviceId: string) => void;
  // Selection props
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
}

// Accessible Status Badge with aria-label
function StatusBadge({ device }: { device: Device }) {
  const isOnline = device.status === "online";

  let offlineDuration = "";
  let ariaLabel = "Online";

  if (!isOnline && device.offlineSince) {
    offlineDuration = `For ${formatDistanceToNow(
      new Date(device.offlineSince),
      { addSuffix: false }
    )}`;
    ariaLabel = `Offline for ${formatDistanceToNow(
      new Date(device.offlineSince)
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

// Accessible Alerts display
function AlertsDisplay({ alerts }: { alerts: number }) {
  const ariaLabel =
    alerts === 0
      ? "No alerts"
      : `${alerts} active alert${alerts !== 1 ? "s" : ""}`;

  if (alerts > 0) {
    return (
      <div
        className="flex items-center gap-1.5 text-yellow-600"
        role="status"
        aria-label={ariaLabel}
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium" aria-hidden="true">
          {alerts} alerts
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-muted-foreground"
      role="status"
      aria-label={ariaLabel}
    >
      <span className="text-sm" aria-hidden="true">
        0 alerts
      </span>
      <span className="text-green-500" aria-hidden="true">
        ✓
      </span>
    </div>
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

export function DeviceCard({
  device,
  onEdit,
  onRemove,
  isSelected,
  onSelect,
}: DeviceCardProps) {
  const router = useRouter();
  const isOffline = device.status === "offline";

  // Navigate to device detail when card is clicked (excluding checkbox and menu)
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(
      'button, [role="checkbox"], [role="menuitem"], a'
    );
    if (!isInteractive) {
      router.push(`/dashboard/settings/devices/${device.id}`);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      const target = e.target as HTMLElement;
      // Only navigate if focus is on the card itself, not child elements
      if (target.getAttribute("role") === "button") {
        e.preventDefault();
        router.push(`/dashboard/settings/devices/${device.id}`);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Card
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${device.name}, ${device.status}, ${getDeviceTypeLabel(
          device.type
        )}`}
        className={cn(
          "group cursor-pointer transition-all duration-200 ease-out",
          "hover:shadow-md hover:scale-[1.01]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isOffline && "opacity-60",
          isSelected && "ring-2 ring-primary"
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            {/* Checkbox - stops propagation */}
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelect(!!checked)}
                aria-label={`Select ${device.name}`}
                className="mt-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
            </div>
            <DeviceIcon type={device.type} className="h-12 w-12" />
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">
                {device.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {getDeviceTypeLabel(device.type)}
              </span>
            </div>
          </div>
          {/* Dropdown Menu - stops propagation */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="sr-only">Open menu for {device.name}</span>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/dashboard/settings/devices/${device.id}`)
                  }
                >
                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                  View details
                </DropdownMenuItem>
                {device.type === "external_terminal" && (
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
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <StatusBadge device={device} />
            <AlertsDisplay alerts={device.alerts} />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Serial number</span>
              <span className="font-mono">{device.serialNumber || "—"}</span>
            </div>
            {device.model && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Model</span>
                <span>{device.model}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Last seen</span>
              <span>
                {device.lastSeen
                  ? format(new Date(device.lastSeen), "MMM d, yyyy h:mm a")
                  : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
