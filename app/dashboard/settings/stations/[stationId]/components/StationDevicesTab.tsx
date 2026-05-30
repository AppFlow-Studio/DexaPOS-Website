"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Station } from "@/app/dashboard/actions/stations";
import {
  useStationDevices,
  useDeleteStationDevice,
  useTestDeviceConnection,
  useTestPrint,
  useOpenCashDrawer,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
  getConnectionTypeLabel,
  StationDevice,
} from "../../hooks/useStationDevices";
import {
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Printer,
  Circle,
  Wifi,
  Bluetooth,
  Usb,
  Cpu,
  Loader2,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface StationDevicesTabProps {
  station: Station;
}

function ConnectionIcon({ type }: { type: string }) {
  switch (type) {
    case "usb":
      return <Usb className="h-4 w-4" />;
    case "bluetooth":
      return <Bluetooth className="h-4 w-4" />;
    case "network":
      return <Wifi className="h-4 w-4" />;
    case "integrated":
      return <Cpu className="h-4 w-4" />;
    default:
      return <Wifi className="h-4 w-4" />;
  }
}

function DeviceActionMenu({
  device,
  onTest,
  onTestPrint,
  onOpenDrawer,
  onDelete,
  isTestingConnection,
  isTestingPrint,
  isOpeningDrawer,
}: {
  device: StationDevice;
  onTest: () => void;
  onTestPrint: () => void;
  onOpenDrawer: () => void;
  onDelete: () => void;
  isTestingConnection: boolean;
  isTestingPrint: boolean;
  isOpeningDrawer: boolean;
}) {
  const isPrinter = device.device_type.includes("printer");
  const isCashDrawer = device.device_type === "cash_drawer";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove device"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onTest} disabled={isTestingConnection}>
            {isTestingConnection ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </DropdownMenuItem>
          {isPrinter && (
            <DropdownMenuItem onClick={onTestPrint} disabled={isTestingPrint}>
              {isTestingPrint ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Test Print
            </DropdownMenuItem>
          )}
          {isCashDrawer && (
            <DropdownMenuItem onClick={onOpenDrawer} disabled={isOpeningDrawer}>
              {isOpeningDrawer ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="mr-2 h-4 w-4" />
              )}
              Open Drawer
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Remove Device
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function StationDevicesTab({ station }: StationDevicesTabProps) {
  const [deviceToDelete, setDeviceToDelete] = useState<StationDevice | null>(null);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [printingDeviceId, setPrintingDeviceId] = useState<string | null>(null);
  const [openingDrawerId, setOpeningDrawerId] = useState<string | null>(null);

  const { data: devices, isLoading } = useStationDevices(station.id);
  const deleteMutation = useDeleteStationDevice();
  const testConnectionMutation = useTestDeviceConnection();
  const testPrintMutation = useTestPrint();
  const openDrawerMutation = useOpenCashDrawer();

  const handleTestConnection = async (device: StationDevice) => {
    setTestingDeviceId(device.id);
    try {
      await testConnectionMutation.mutateAsync(device.id);
    } finally {
      setTestingDeviceId(null);
    }
  };

  const handleTestPrint = async (device: StationDevice) => {
    setPrintingDeviceId(device.id);
    try {
      await testPrintMutation.mutateAsync(device.id);
    } finally {
      setPrintingDeviceId(null);
    }
  };

  const handleOpenDrawer = async (device: StationDevice) => {
    setOpeningDrawerId(device.id);
    try {
      await openDrawerMutation.mutateAsync(device.id);
    } finally {
      setOpeningDrawerId(null);
    }
  };

  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return;
    try {
      await deleteMutation.mutateAsync(deviceToDelete.id);
      setDeviceToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDevices = devices && devices.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-lg">Peripheral Devices</CardTitle>
            <CardDescription>
              Printers, cash drawers, and other devices connected to this station
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!hasDevices ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Printer className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No devices connected</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-2">
                Peripherals pair from the POS tablet and appear here once
                connected.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">
                          {getDeviceTypeIcon(device.device_type)}
                        </div>
                        <div>
                          <p className="font-medium">{device.device_name}</p>
                          {device.device_model && (
                            <p className="text-sm text-muted-foreground">
                              {device.device_model}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getDeviceTypeLabel(device.device_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ConnectionIcon type={device.connection_type} />
                        <span className="text-sm">
                          {getConnectionTypeLabel(device.connection_type)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          device.is_connected
                            ? "border-green-500/50 bg-green-500/10 text-green-600"
                            : "border-gray-400/50 bg-gray-100 text-gray-600"
                        )}
                      >
                        <Circle
                          className={cn(
                            "mr-1 h-2 w-2",
                            device.is_connected
                              ? "fill-green-500 text-green-500"
                              : "fill-gray-400 text-gray-400"
                          )}
                        />
                        {device.is_connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {device.last_seen_at
                        ? formatDistanceToNow(new Date(device.last_seen_at), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <DeviceActionMenu
                        device={device}
                        onTest={() => handleTestConnection(device)}
                        onTestPrint={() => handleTestPrint(device)}
                        onOpenDrawer={() => handleOpenDrawer(device)}
                        onDelete={() => setDeviceToDelete(device)}
                        isTestingConnection={testingDeviceId === device.id}
                        isTestingPrint={printingDeviceId === device.id}
                        isOpeningDrawer={openingDrawerId === device.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deviceToDelete}
        onOpenChange={(open) => !open && setDeviceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Remove Device</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {deviceToDelete?.device_name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deviceToDelete && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <span className="text-2xl">
                {getDeviceTypeIcon(deviceToDelete.device_type)}
              </span>
              <div>
                <p className="font-medium">{deviceToDelete.device_name}</p>
                <p className="text-sm text-muted-foreground">
                  {getDeviceTypeLabel(deviceToDelete.device_type)}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDevice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Device"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
