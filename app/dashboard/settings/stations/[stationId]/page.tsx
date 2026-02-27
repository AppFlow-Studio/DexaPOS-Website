"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertTriangle,
  Pencil,
  Check,
  X,
  Loader2,
  Trash2,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getStationById, Station } from "@/app/dashboard/actions/stations";
import {
  getStationTypeLabel,
  getStationTypeIcon,
  useUpdateStation,
  useDeleteStation,
} from "../hooks/useStations";

import { useAuth } from "@clerk/nextjs";
import { AddStationDialog } from "../components/AddStationDialog";

// Tab components
import { StationOverviewTab } from "./components/StationOverviewTab";
import { StationDevicesTab } from "./components/StationDevicesTab";
import { PaymentTerminalTab } from "./components/PaymentTerminalTab";
import { StationConnectionTab } from "./components/StationConnectionTab";
import { StationActivityTab } from "./components/StationActivityTab";
import { RemoteActionsPanel } from "./components/RemoteActionsPanel";

// Tab configuration
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "devices", label: "Devices" },
  { id: "terminal", label: "Payment Terminal" },
  { id: "connection", label: "Connection" },
  { id: "remote", label: "Remote Actions" },
  { id: "activity", label: "Activity" },
];

export default function StationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const stationId = params.stationId as string;
  const { orgId } = useAuth();

  const [activeTab, setActiveTab] = useState("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [timeFilter, setTimeFilter] = useState("24h");

  // Inline edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Mutations
  const updateMutation = useUpdateStation();
  const deleteMutation = useDeleteStation();

  // Fetch station data
  const {
    data: station,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stations", "detail", stationId],
    queryFn: async () => {
      const result = await getStationById(stationId);
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch station");
      }
      return result.data as Station;
    },
    enabled: !!stationId,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("Station data refreshed");
  };

  const handleStartEditName = () => {
    if (!station) return;
    setEditedName(station.station_name);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!station || !editedName.trim()) return;
    try {
      await updateMutation.mutateAsync({
        stationId: station.id,
        input: { station_name: editedName.trim() },
      });
      setIsEditingName(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleDeleteStation = async () => {
    if (!station) return;
    try {
      await deleteMutation.mutateAsync(station.id);
      router.push("/dashboard/settings/stations");
    } catch {
      // Error handled by mutation
    }
  };

  if (!mounted || isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/settings/stations">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Stations
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Station not found</h2>
          <p className="text-muted-foreground mt-2">
            The station you&apos;re looking for doesn&apos;t exist or has been
            removed.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/settings/stations">View all stations</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isOnline = station.is_active && station.is_online;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/settings/stations"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Stations
          </Link>
        </div>

        {/* Title Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-3xl">
              {getStationTypeIcon(station.station_type)}
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
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
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
                    <h1 className="text-2xl font-bold">
                      {station.station_name}
                    </h1>
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
                  {getStationTypeLabel(station.station_type)}
                </Badge>
                {station.station_code && (
                  <Badge variant="outline" className="font-mono">
                    {station.station_code}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    isOnline
                      ? "border-green-500/50 bg-green-500/10 text-green-600"
                      : "border-gray-400/50 bg-gray-100 text-gray-600",
                  )}
                >
                  <Circle
                    className={cn(
                      "mr-1 h-2 w-2",
                      isOnline
                        ? "fill-green-500 text-green-500"
                        : "fill-gray-400 text-gray-400",
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
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsEditDialogOpen(true)}
            >
              <Settings className="h-4 w-4" />
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
              Station is offline
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              {station.last_heartbeat_at
                ? `Last seen ${formatDistanceToNow(
                    new Date(station.last_heartbeat_at),
                    { addSuffix: true },
                  )}. `
                : ""}
              Some features are unavailable while offline.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "overview" && (
          <StationOverviewTab station={station} timeFilter={timeFilter} />
        )}
        {activeTab === "devices" && <StationDevicesTab station={station} />}
        {activeTab === "terminal" && <PaymentTerminalTab station={station} />}
        {activeTab === "connection" && (
          <StationConnectionTab station={station} />
        )}
        {activeTab === "remote" && <RemoteActionsPanel station={station} />}
        {activeTab === "activity" && (
          <StationActivityTab station={station} timeFilter={timeFilter} />
        )}
      </div>

      {/* Edit Station Dialog */}
      <AddStationDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        stationToEdit={station}
        locationId={station.location_id}
        clerkOrgId={orgId || ""}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Delete Station</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {station.station_name}
              </span>
              ? This will remove all associated devices and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <span className="text-2xl">
              {getStationTypeIcon(station.station_type)}
            </span>
            <div>
              <p className="font-medium">{station.station_name}</p>
              <p className="text-sm text-muted-foreground">
                {getStationTypeLabel(station.station_type)}
                {station.station_code && ` - ${station.station_code}`}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Station"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
