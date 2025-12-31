"use client";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Device, useDevices } from "../hooks/useDevices";
import {
  Monitor,
  Printer,
  Smartphone,
  Circle,
  RefreshCw,
  Trash2,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const TypeIcon = ({ type }: { type: Device["type"] }) => {
  switch (type) {
    case "pos":
      return <Monitor className="h-5 w-5" />;
    case "kiosk":
      return <Smartphone className="h-5 w-5" />;
    case "printer":
      return <Printer className="h-5 w-5" />;
    case "cash_drawer":
      return (
        <div className="h-5 w-5 border-2 border-current rounded-sm flex items-center justify-center text-[10px] font-bold">
          $
        </div>
      );
  }
};

const StatusBadge = ({ status }: { status: Device["status"] }) => {
  return (
    <Badge
      variant={status === "online" ? "outline" : "secondary"}
      className={cn(
        "gap-1.5",
        status === "online" && "border-green-500 text-green-500",
        status === "error" && "border-red-500 text-red-500",
        status === "offline" && "text-muted-foreground"
      )}
    >
      <Circle
        className={cn(
          "h-2 w-2 fill-current",
          status === "online" && "fill-green-500",
          status === "error" && "fill-red-500"
        )}
      />
      {status === "online"
        ? "Online"
        : status === "error"
        ? "Error"
        : "Offline"}
    </Badge>
  );
};

export function DeviceCard({
  device,
  onEdit,
}: {
  device: Device;
  onEdit: (device: Device) => void;
}) {
  const { simulateConnection, removeDevice } = useDevices();
  const [isTesting, setIsTesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    await simulateConnection(device.id);
    setIsTesting(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <TypeIcon type={device.type} />
          </div>
          <div className="flex flex-col">
            <CardTitle className="text-base font-semibold">
              {device.name}
            </CardTitle>
            <span className="text-xs text-muted-foreground capitalize">
              {device.type.replace("_", " ")}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEdit(device)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Configuration
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => removeDevice(device.id)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove Device
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={device.status} />
          {device.lastSeen && mounted && (
            <span className="text-xs text-muted-foreground">
              Last seen:{" "}
              {new Date(device.lastSeen).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <div className="space-y-2 text-sm">
          {device.type === "pos" || device.type === "kiosk" ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Register ID:</span>
                <span className="font-mono">
                  {device.dejavooRegisterId || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auth Key:</span>
                <span className="font-mono">
                  {device.dejavooAuthKey
                    ? "••••" + device.dejavooAuthKey.slice(-4)
                    : "Not Configured"}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Address:</span>
              <span className="font-mono">{device.ipAddress || "N/A"}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Test Connection
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
