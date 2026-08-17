"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getStationById, Station } from "@/app/dashboard/actions/stations";
import {
  getStationTypeLabel,
  getStationTypeIcon,
  useUpdateStation,
  useDeleteStation,
} from "../hooks/useStations";

import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { AddStationDialog } from "../components/AddStationDialog";

// Tab components
import { StationOverviewTab } from "./components/StationOverviewTab";
import { StationDevicesTab } from "./components/StationDevicesTab";
import { PaymentTerminalTab } from "./components/PaymentTerminalTab";
import { StationConnectionTab } from "./components/StationConnectionTab";
import { StationActivityTab } from "./components/StationActivityTab";
import { RemoteActionsPanel } from "./components/RemoteActionsPanel";
import { StationPrintersTab } from "./components/StationPrintersTab";

// Tab configuration
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "devices", label: "Devices" },
  { id: "printers", label: "Printers" },
  { id: "terminal", label: "Payment Terminal" },
  { id: "connection", label: "Connection" },
  { id: "remote", label: "Remote Actions" },
  { id: "activity", label: "Activity" },
];

// KDS stations don't take payments, so hide the Payment Terminal tab
const TABS_HIDDEN_BY_STATION_TYPE: Record<string, string[]> = {
  kds: ["terminal"],
};

function getVisibleTabs(stationType: string | null | undefined) {
  const hidden = TABS_HIDDEN_BY_STATION_TYPE[stationType ?? ""] ?? [];
  return TABS.filter((tab) => !hidden.includes(tab.id));
}

export default function StationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const stationId = params.stationId as string;
  // Impersonation-aware org id (NOT useAuth().orgId, which stays HQ during impersonation).
  const orgId = useClerkOrgId();

  const [activeTab, setActiveTab] = useState("overview");
  const tabRailRef = useRef<HTMLDivElement>(null);

  // §13.2 — keep the active tab on screen. `block: "nearest"` stops the browser
  // scrolling the page vertically to the rail as well.
  useEffect(() => {
    tabRailRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

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
      <div className="space-y-6">
        <Skeleton className="h-9 w-40 rounded-full" />
        <Skeleton className="h-11 w-full max-w-[640px] rounded-full" />
        <Skeleton className="h-[420px] w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="space-y-6">
        {/* Ghost pill back control, never bordered (§4.4). */}
        <Button
          variant="ghost"
          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
          asChild
        >
          <Link href="/dashboard/settings/stations">
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Back to Stations
          </Link>
        </Button>
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Station not found</h2>
          <p className="mt-2 text-muted-foreground">
            The station you&apos;re looking for doesn&apos;t exist or has been
            removed.
          </p>
          <Button
            className="mt-4 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            asChild
          >
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
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted/60 text-3xl">
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
                      className="h-8 w-8 rounded-full p-0"
                      onClick={handleSaveName}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full p-0"
                      onClick={handleCancelEditName}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="group flex min-w-0 items-center gap-2">
                    {/* Page h1 per §3.2 (D-01). */}
                    <h1 className="min-w-0 text-[1.75rem] font-semibold tracking-[-0.02em]">
                      {station.station_name}
                    </h1>
                    {/* Visible at rest: an edit affordance you must hover to
                        find is one users may never discover (§4.7). */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 rounded-full p-0"
                      onClick={handleStartEditName}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {/* Type Badge & Status */}
              {/* One neutral pill per badge (§4.6b) — the word carries the
                  state; the dot is filled or hollow, never coloured. */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">
                  {getStationTypeLabel(station.station_type)}
                </Badge>
                {station.station_code && (
                  <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 font-mono text-xs font-medium text-foreground">
                    {station.station_code}
                  </Badge>
                )}
                <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">
                  <Circle
                    className={cn(
                      "mr-1 h-2 w-2",
                      isOnline ? "fill-current" : "fill-transparent",
                    )}
                  />
                  {isOnline ? "Online" : "Offline"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-full border-0 bg-muted/60 px-3 shadow-none">
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
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full shadow-sm"
              onClick={() => setIsEditDialogOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Station is offline
            </p>
            <p className="text-sm text-muted-foreground">
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

      {/* Tabs — pill rail, not the retired underline style (§4.5). Never
          `overflow-x-hidden`: it would put later tabs out of reach (§13.2). */}
      <div
        ref={tabRailRef}
        className="thin-scrollbar w-full min-w-0 overflow-x-auto pb-1"
      >
        <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          {getVisibleTabs(station.station_type).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-state={activeTab === tab.id ? "active" : "inactive"}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "overview" && (
          <StationOverviewTab station={station} timeFilter={timeFilter} />
        )}
        {activeTab === "devices" && <StationDevicesTab station={station} />}
        {activeTab === "printers" && <StationPrintersTab station={station} />}
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
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
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
