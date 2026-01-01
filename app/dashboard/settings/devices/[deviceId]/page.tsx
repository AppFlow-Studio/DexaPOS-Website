"use client";

import {
  useDevices,
  Device,
  DeviceIssue,
  ActivityLog,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
  getConnectionTypeLabel,
  PREP_STATIONS,
} from "../hooks/useDevices";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  Circle,
  RefreshCw,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Clock,
  Pencil,
  Check,
  X,
  Bluetooth,
  Usb,
  Cable,
  Signal,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  FileText,
  CreditCard,
  Plug,
  AlertCircle,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  format,
  formatDistanceToNow,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

// Tab configuration
const getTabsForDevice = (device: Device) => {
  const tabs = [
    { id: "issues", label: "Current Issues" },
    { id: "connection", label: "Connection Details" },
  ];

  // Prep Stations only for kitchen printers
  if (device.type === "printer" && device.printerType === "kitchen") {
    tabs.push({ id: "prepstations", label: "Prep Stations" });
  }

  tabs.push({ id: "info", label: "Device Information" });

  // Versions only for terminals and tablets
  if (device.type === "external_terminal" || device.type === "tablet") {
    tabs.push({ id: "versions", label: "Versions" });
  }

  tabs.push({ id: "activity", label: "Activity Logs" });

  return tabs;
};

// Signal strength indicator component
function SignalStrength({ strength }: { strength?: number }) {
  const bars = [1, 2, 3, 4];
  const level = strength || 0;

  return (
    <div className="flex items-end gap-0.5 h-4">
      {bars.map((bar) => (
        <div
          key={bar}
          className={cn(
            "w-1 rounded-sm transition-colors",
            bar <= level ? "bg-green-500" : "bg-muted",
            bar === 1 && "h-1",
            bar === 2 && "h-2",
            bar === 3 && "h-3",
            bar === 4 && "h-4"
          )}
        />
      ))}
    </div>
  );
}

// Uptime display component
function UptimeDisplay({ connectedSince }: { connectedSince?: string }) {
  if (!connectedSince) return <span className="text-muted-foreground">—</span>;

  const now = new Date();
  const connected = new Date(connectedSince);
  const days = differenceInDays(now, connected);
  const hours = differenceInHours(now, connected) % 24;
  const minutes = differenceInMinutes(now, connected) % 60;

  let display = "";
  if (days > 0) display += `${days} day${days > 1 ? "s" : ""}, `;
  if (hours > 0 || days > 0)
    display += `${hours} hour${hours !== 1 ? "s" : ""}`;
  if (days === 0 && hours === 0)
    display = `${minutes} minute${minutes !== 1 ? "s" : ""}`;

  return <span>{display}</span>;
}

// Issue severity icon
function IssueSeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case "info":
      return <Info className="h-5 w-5 text-blue-500" />;
    default:
      return <Info className="h-5 w-5 text-muted-foreground" />;
  }
}

// Activity log icon
function ActivityLogIcon({ type }: { type: string }) {
  switch (type) {
    case "payment":
      return <CreditCard className="h-4 w-4 text-green-500" />;
    case "print":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "connection":
      return <Plug className="h-4 w-4 text-purple-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

// Connection type icon
function ConnectionTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "bluetooth":
      return <Bluetooth className="h-5 w-5 text-blue-500" />;
    case "wifi":
      return <Wifi className="h-5 w-5 text-green-500" />;
    case "usb":
    case "wired":
      return <Cable className="h-5 w-5 text-gray-500" />;
    default:
      return <Plug className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const {
    devices,
    updateDevice,
    removeDevice,
    dismissIssue,
    simulateConnection,
    checkForUpdates,
  } = useDevices();
  const [activeTab, setActiveTab] = useState("issues");
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [timeFilter, setTimeFilter] = useState("24h");

  // Inline edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const device = devices.find((d) => d.id === params.deviceId);
  const tabs = device ? getTabsForDevice(device) : [];

  // Filter activity logs by time
  const filteredActivityLogs = useMemo(() => {
    if (!device?.activityLogs) return [];

    const now = Date.now();
    const filterMs =
      {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      }[timeFilter] || 24 * 60 * 60 * 1000;

    return device.activityLogs.filter(
      (log) => now - new Date(log.timestamp).getTime() <= filterMs
    );
  }, [device?.activityLogs, timeFilter]);

  const handleTestConnection = async () => {
    if (!device) return;
    setIsTesting(true);
    const success = await simulateConnection(device.id);
    toast[success ? "success" : "error"](
      success ? "Connection successful!" : "Connection failed"
    );
    setIsTesting(false);
  };

  const handleCheckUpdates = async () => {
    if (!device) return;
    setIsCheckingUpdates(true);
    await checkForUpdates(device.id);
    toast.success("Device is up to date!");
    setIsCheckingUpdates(false);
  };

  const handleStartEditName = () => {
    if (!device) return;
    setEditedName(device.name);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (!device || !editedName.trim()) return;
    updateDevice(device.id, { name: editedName.trim() });
    setIsEditingName(false);
    toast.success("Device name updated");
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleDismissIssue = (issueId: string) => {
    if (!device) return;
    dismissIssue(device.id, issueId);
    toast.success("Issue dismissed");
  };

  const handleDeleteDevice = () => {
    if (!device) return;
    removeDevice(device.id);
    toast.success(`${device.name} has been removed`);
    router.push("/dashboard/settings/devices");
  };

  if (!mounted) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/settings/devices">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Devices
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Device not found</h2>
          <p className="text-muted-foreground mt-2">
            The device you&apos;re looking for doesn&apos;t exist or has been
            removed.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/settings/devices">View all devices</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isOnline = device.status === "online";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/settings/devices"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Devices
          </Link>
        </div>

        {/* Title Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-3xl">
              {getDeviceTypeIcon(device.type)}
            </div>
            <div className="flex flex-col gap-1">
              {/* Inline Editable Name */}
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-8 w-[200px] text-lg font-bold"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") handleCancelEditName();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleSaveName}
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleCancelEditName}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <div className="group flex items-center gap-2">
                    <h1 className="text-2xl font-bold">{device.name}</h1>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handleStartEditName}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {/* Type Badge & Status */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {getDeviceTypeLabel(device.type)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    isOnline
                      ? "border-green-500/50 bg-green-500/10 text-green-600"
                      : "border-gray-400/50 bg-gray-100 text-gray-600"
                  )}
                >
                  <Circle
                    className={cn(
                      "mr-1 h-2 w-2",
                      isOnline
                        ? "fill-green-500 text-green-500"
                        : "fill-gray-400 text-gray-400"
                    )}
                  />
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !isOnline}
              title={!isOnline ? "Device is offline" : undefined}
            >
              {isTesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-900">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-yellow-800 dark:text-yellow-300">
              Device is offline
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              {device.offlineSince
                ? `Offline for ${formatDistanceToNow(
                    new Date(device.offlineSince)
                  )}. `
                : ""}
              Some actions are disabled until the device is back online.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link
              href="https://help.dexapos.com/troubleshoot-offline"
              target="_blank"
            >
              Troubleshoot
            </Link>
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.id === "issues" &&
              device.issues &&
              device.issues.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 p-0 justify-center"
                >
                  {device.issues.length}
                </Badge>
              )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Current Issues Tab */}
        {activeTab === "issues" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Issues</CardTitle>
              <CardDescription>
                Active alerts and warnings for this device
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!device.issues || device.issues.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      No issues detected
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      Device is operating normally.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {device.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={cn(
                        "flex items-start justify-between gap-4 p-4 rounded-lg border",
                        issue.severity === "critical" &&
                          "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900",
                        issue.severity === "warning" &&
                          "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900",
                        issue.severity === "info" &&
                          "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <IssueSeverityIcon severity={issue.severity} />
                        <div>
                          <p className="font-medium">{issue.message}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(issue.timestamp), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href="https://help.dexapos.com/troubleshoot"
                            target="_blank"
                          >
                            Troubleshoot
                          </Link>
                        </Button>
                        {issue.dismissible && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDismissIssue(issue.id)}
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Connection Details Tab */}
        {activeTab === "connection" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ConnectionTypeIcon type={device.connectionType} />
                  Connection Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Connection Type
                    </p>
                    <p className="font-medium">
                      {getConnectionTypeLabel(device.connectionType)}
                    </p>
                  </div>
                  {device.ipAddress && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        IP Address
                      </p>
                      <p className="font-mono">{device.ipAddress}</p>
                    </div>
                  )}
                  {device.macAddress && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        MAC Address
                      </p>
                      <p className="font-mono">{device.macAddress}</p>
                    </div>
                  )}
                  {(device.connectionType === "wifi" ||
                    device.connectionType === "bluetooth") && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Signal Strength
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <SignalStrength strength={device.signalStrength} />
                        <span className="text-sm">
                          {device.signalStrength === 4 && "Excellent"}
                          {device.signalStrength === 3 && "Good"}
                          {device.signalStrength === 2 && "Fair"}
                          {device.signalStrength === 1 && "Weak"}
                          {!device.signalStrength && "Unknown"}
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Last Connected
                    </p>
                    <p className="font-medium">
                      {device.lastSeen
                        ? format(
                            new Date(device.lastSeen),
                            "MMM d, yyyy h:mm a"
                          )
                        : "—"}
                    </p>
                  </div>
                  {isOnline && device.connectedSince && (
                    <div>
                      <p className="text-sm text-muted-foreground">Uptime</p>
                      <p className="font-medium">
                        Active for{" "}
                        <UptimeDisplay connectedSince={device.connectedSince} />
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connection Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center",
                      isOnline ? "bg-green-500/20" : "bg-gray-200"
                    )}
                  >
                    <Circle
                      className={cn(
                        "h-5 w-5",
                        isOnline
                          ? "fill-green-500 text-green-500"
                          : "fill-gray-400 text-gray-400"
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">
                      {isOnline ? "Connected" : "Disconnected"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isOnline
                        ? `Online for ${formatDistanceToNow(
                            new Date(
                              device.connectedSince ||
                                device.lastSeen ||
                                new Date()
                            )
                          )}`
                        : device.offlineSince
                        ? `Offline for ${formatDistanceToNow(
                            new Date(device.offlineSince)
                          )}`
                        : "Status unknown"}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleTestConnection}
                  disabled={isTesting || !isOnline}
                  title={!isOnline ? "Device is offline" : undefined}
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing connection...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Test connection
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Prep Stations Tab (Kitchen Printers Only) */}
        {activeTab === "prepstations" && device.type === "printer" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prep Stations</CardTitle>
              <CardDescription>
                Configure which prep stations this printer serves
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station Name</TableHead>
                    <TableHead>Always Print</TableHead>
                    <TableHead>Send to Expediter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      {PREP_STATIONS.find((s) => s.id === device.prepStation)
                        ?.label ||
                        device.prepStation ||
                        "Kitchen"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={device.alwaysPrint ? "default" : "secondary"}
                      >
                        {device.alwaysPrint ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          device.sendToExpediter ? "default" : "secondary"
                        }
                      >
                        {device.sendToExpediter ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link
                    href="https://help.dexapos.com/prep-stations"
                    target="_blank"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View in Help Center
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/settings">View all stations</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device Information Tab */}
        {activeTab === "info" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Device Information</CardTitle>
              <CardDescription>
                Basic device details and configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Device Name</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{device.name}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={handleStartEditName}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Device Model</p>
                  <p className="font-medium">{device.model || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Serial Number</p>
                  <p className="font-mono">{device.serialNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Manufacturer</p>
                  <p className="font-medium">{device.manufacturer || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Connection Type
                  </p>
                  <p className="font-medium">
                    {getConnectionTypeLabel(device.connectionType)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Device Type</p>
                  <p className="font-medium">
                    {getDeviceTypeLabel(device.type)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Device
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Versions Tab (Terminals/Tablets Only) */}
        {activeTab === "versions" &&
          (device.type === "external_terminal" || device.type === "tablet") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Versions</CardTitle>
                <CardDescription>
                  Firmware and software version information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Main Firmware Version
                    </p>
                    <p className="font-mono">{device.firmwareVersion || "—"}</p>
                  </div>
                  {device.type === "tablet" && device.appVersion && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        App Version
                      </p>
                      <p className="font-mono">{device.appVersion}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Last Updated
                    </p>
                    <p className="font-medium">
                      {device.lastUpdated
                        ? format(new Date(device.lastUpdated), "MMM d, yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>

                {device.updateAvailable && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                    <Download className="h-5 w-5 text-blue-500" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-700 dark:text-blue-400">
                        Update available
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-500">
                        A new firmware version is available for this device.
                      </p>
                    </div>
                    <Button size="sm">Update Now</Button>
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates || !isOnline}
                  title={!isOnline ? "Device is offline" : undefined}
                >
                  {isCheckingUpdates ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking for updates...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check for Updates
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

        {/* Activity Logs Tab */}
        {activeTab === "activity" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity Logs</CardTitle>
              <CardDescription>
                Recent activity and events for this device
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredActivityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="font-medium">No activity in this time period</p>
                  <p className="text-sm text-muted-foreground">
                    Try selecting a different time range
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredActivityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <ActivityLogIcon type={log.type} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{log.action}</p>
                        {log.details && (
                          <p className="text-sm text-muted-foreground">
                            {log.details}
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(log.timestamp), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
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
                {device.name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <span className="text-2xl">{getDeviceTypeIcon(device.type)}</span>
            <div>
              <p className="font-medium">{device.name}</p>
              <p className="text-sm text-muted-foreground">
                {getDeviceTypeLabel(device.type)}
                {device.serialNumber && ` • ${device.serialNumber}`}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDevice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
