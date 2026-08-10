"use client";

import {
  useStationsWithHeartbeats,
  useDeleteStation,
  useDeleteMultipleStations,
  useDeactivateStation,
  useReactivateStation,
  Station,
  StationWithHeartbeat,
  StationType,
  getStationTypeLabel,
} from "./hooks/useStations";
import { useDeviceRealtime } from "./hooks/useDeviceRealtime";
import { StationsTable } from "./components/StationsTable";
import { StationCard } from "./components/StationCard";
import { AddStationDialog } from "./components/AddStationDialog";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Monitor,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import {
  useGatedLocationId,
  useGatedLocation,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  LocationIndicator,
  PageHeader,
} from "@/components/dashboard/shell";

type SortColumn = "name" | "station_number" | "status" | "lastSeen";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 10;

export default function StationsPage() {
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. Multi-location on 'all' -> null.
  const gatedLocationId = useGatedLocationId();
  const selectedLocationId = gatedLocationId ?? "all";
  const isAllLocations = !gatedLocationId;
  const selectedLocation = useGatedLocation();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  // Fetch stations with heartbeat data
  const {
    data: stations = [],
    isLoading,
    isError,
    error,
  } = useStationsWithHeartbeats(selectedLocationId);

  // Subscribe to real-time heartbeat updates
  useDeviceRealtime(selectedLocationId);

  // Mutations
  const deleteStationMutation = useDeleteStation();
  const deleteMultipleMutation = useDeleteMultipleStations();
  const deactivateMutation = useDeactivateStation();
  const reactivateMutation = useReactivateStation();

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationWithHeartbeat | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [mounted, setMounted] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);

  // Delete confirmation dialog state
  const [stationToDelete, setStationToDelete] = useState<StationWithHeartbeat | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Bulk delete dialog state
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  // Handle hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, selectedLocationId]);

  // Clear selection when location changes
  useEffect(() => {
    setSelectedStationIds([]);
  }, [selectedLocationId]);

  // Filtered and sorted stations
  const filteredStations = useMemo(() => {
    let result = [...stations];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (station) =>
          station.station_name.toLowerCase().includes(term) ||
          station.station_code?.toLowerCase().includes(term) ||
          station.device_name?.toLowerCase().includes(term)
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((station) => station.station_type === typeFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "online") {
        result = result.filter((station) => {
          const online = station.latest_heartbeat?.is_online ?? station.is_online;
          return online && station.is_active;
        });
      } else if (statusFilter === "offline") {
        result = result.filter((station) => {
          const online = station.latest_heartbeat?.is_online ?? station.is_online;
          return !online && station.is_active;
        });
      } else if (statusFilter === "inactive") {
        result = result.filter((station) => !station.is_active);
      }
    }

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        let comparison = 0;

        switch (sortColumn) {
          case "name":
            comparison = a.station_name.localeCompare(b.station_name);
            break;
          case "station_number":
            comparison = (a.station_number || 0) - (b.station_number || 0);
            break;
          case "status":
            const onlineA = a.latest_heartbeat?.is_online ?? a.is_online;
            const onlineB = b.latest_heartbeat?.is_online ?? b.is_online;
            const statusA = !a.is_active ? 2 : onlineA ? 0 : 1;
            const statusB = !b.is_active ? 2 : onlineB ? 0 : 1;
            comparison = statusA - statusB;
            break;
          case "lastSeen":
            const tsA = a.latest_heartbeat?.heartbeat_at || a.last_heartbeat_at;
            const tsB = b.latest_heartbeat?.heartbeat_at || b.last_heartbeat_at;
            const dateA = tsA ? new Date(tsA).getTime() : 0;
            const dateB = tsB ? new Date(tsB).getTime() : 0;
            comparison = dateA - dateB;
            break;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [stations, searchTerm, typeFilter, statusFilter, sortColumn, sortDirection]);

  // Pagination logic
  const totalPages = Math.ceil(filteredStations.length / ITEMS_PER_PAGE);
  const showPagination = filteredStations.length > ITEMS_PER_PAGE;
  const paginatedStations = useMemo(() => {
    if (!showPagination) return filteredStations;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStations, currentPage, showPagination]);

  // All station IDs (for select all functionality)
  const allStationIds = stations.map((s) => s.id);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection("asc");
    }
  };

  const handleEdit = (station: StationWithHeartbeat) => {
    setEditingStation(station);
    setIsAddDialogOpen(true);
  };

  const handleRemoveClick = (stationId: string) => {
    const station = stations.find((s) => s.id === stationId);
    if (station) {
      setStationToDelete(station);
      setIsDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!stationToDelete) return;

    try {
      await deleteStationMutation.mutateAsync(stationToDelete.id);
      setStationToDelete(null);
      setIsDeleteDialogOpen(false);
      setSelectedStationIds((prev) =>
        prev.filter((id) => id !== stationToDelete.id)
      );
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleCancelDelete = () => {
    if (deleteStationMutation.isPending) return;
    setStationToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const handleDeactivate = (stationId: string) => {
    deactivateMutation.mutate({ stationId });
  };

  const handleReactivate = (stationId: string) => {
    reactivateMutation.mutate(stationId);
  };

  // Selection handlers
  const handleSelectStation = (stationId: string, selected: boolean) => {
    setSelectedStationIds((prev) =>
      selected ? [...prev, stationId] : prev.filter((id) => id !== stationId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedStationIds(allStationIds);
    } else {
      setSelectedStationIds([]);
    }
  };

  // Bulk delete
  const handleBulkRemoveClick = () => {
    if (selectedStationIds.length === 0) return;
    setIsBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedStationIds.length === 0) return;

    try {
      await deleteMultipleMutation.mutateAsync(selectedStationIds);
      setSelectedStationIds([]);
      setIsBulkDeleteDialogOpen(false);
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleCancelBulkDelete = () => {
    if (deleteMultipleMutation.isPending) return;
    setIsBulkDeleteDialogOpen(false);
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stations"
          subtitle="Configure and manage your POS stations."
          indicator={
            <LocationIndicator
              isAllLocations={isAllLocations}
              locationName={selectedLocation?.name}
            />
          }
        />
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Show location selection prompt when "All Locations" is selected
  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stations"
          subtitle="Configure and manage your POS stations."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />

        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
            <p className="text-muted-foreground max-w-md">
              Stations are location-specific. Please select a location from the
              dropdown above to manage stations for that location.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stations"
          subtitle="Configure registers, kiosks, and kitchen displays."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
          actions={<Skeleton className="h-10 w-32" />}
        />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[140px]" />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stations"
          subtitle="Configure registers, kiosks, and kitchen displays."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
        />
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-12 w-12 mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Failed to load stations</h3>
            <p className="text-muted-foreground max-w-md">
              {error instanceof Error ? error.message : "An error occurred while loading stations."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mobile notice — full editing requires a larger screen */}
      <div className="sm:hidden flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4">
        <Monitor className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Use a larger screen to configure stations</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Station setup, PIN config, and printer pairing require a tablet or desktop.</p>
        </div>
      </div>

      <PageHeader
        title="Stations"
        subtitle="Configure registers, kiosks, and kitchen displays."
        indicator={
          <LocationIndicator
            isAllLocations={false}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Station
          </Button>
        }
      />

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search stations..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search stations"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Station type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="register">Register</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
              <SelectItem value="kds">Kitchen Display</SelectItem>
              <SelectItem value="self_service">Self-Service</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="inactive">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selectedStationIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedStationIds.length} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkRemoveClick}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {filteredStations.length === 0 ? (
        stations.length === 0 ? (
          <Empty
            icon={Monitor}
            title="No stations configured"
            description="Add your first station to start managing your POS setup."
            action={
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Station
              </Button>
            }
          />
        ) : (
          <Empty
            icon={Search}
            title="No stations found"
            description="Try adjusting your search or filter criteria."
          />
        )
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <StationsTable
              stations={paginatedStations}
              onEdit={handleEdit}
              onRemove={handleRemoveClick}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              selectedStationIds={selectedStationIds}
              onSelectStation={handleSelectStation}
              onSelectAll={handleSelectAll}
              allStationIds={allStationIds}
            />
          </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden grid gap-4 sm:grid-cols-2">
            {paginatedStations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onEdit={handleEdit}
                onRemove={handleRemoveClick}
                onDeactivate={handleDeactivate}
                onReactivate={handleReactivate}
                isSelected={selectedStationIds.includes(station.id)}
                onSelect={(selected) => handleSelectStation(station.id, selected)}
              />
            ))}
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredStations.length)}{" "}
                of {filteredStations.length} stations
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <AddStationDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setEditingStation(null);
        }}
        stationToEdit={editingStation}
        locationId={selectedLocationId}
        clerkOrgId={clerkOrgId || ""}
      />

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleteStationMutation.isPending) setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>
                  Delete &quot;{stationToDelete?.station_name}&quot;?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              This will permanently delete this station. This action cannot be
              undone. The station will need to be reconfigured if you want to
              add it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {stationToDelete && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <span className="text-2xl">
                {getStationTypeLabel(stationToDelete.station_type) === "Register"
                  ? "💳"
                  : getStationTypeLabel(stationToDelete.station_type) ===
                    "Kitchen Display"
                  ? "🍳"
                  : "📱"}
              </span>
              <div>
                <p className="font-medium">{stationToDelete.station_name}</p>
                <p className="text-sm text-muted-foreground">
                  {getStationTypeLabel(stationToDelete.station_type)}
                  {stationToDelete.station_code &&
                    ` (${stationToDelete.station_code})`}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelDelete}
              disabled={deleteStationMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteStationMutation.isPending}
            >
              {deleteStationMutation.isPending ? (
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleteMultipleMutation.isPending) setIsBulkDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>
                  Delete {selectedStationIds.length} stations?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              This will permanently delete these stations. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedStationIds.length}
              </span>{" "}
              station{selectedStationIds.length !== 1 && "s"} will be deleted
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelBulkDelete}
              disabled={deleteMultipleMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMultipleMutation.isPending}
            >
              {deleteMultipleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Stations"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
