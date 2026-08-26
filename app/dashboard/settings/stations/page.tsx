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
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
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
  const clerkOrgId = useClerkOrgId();

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
      <PageShell>
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
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  // Show location selection prompt when "All Locations" is selected
  if (isAllLocations) {
    return (
      <PageShell>
        <PageHeader
          title="Stations"
          subtitle="Configure and manage your POS stations."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />

        <Panel padded>
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Select a Location</h3>
            <p className="max-w-md text-muted-foreground">
              Stations are location-specific. Please select a location from the
              dropdown above to manage stations for that location.
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Stations"
          subtitle="Configure registers, kiosks, and kitchen displays."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
          actions={<Skeleton className="h-9 w-32 rounded-full" />}
        />
        <div className="flex min-w-0 flex-wrap gap-4">
          <Skeleton className="h-10 w-[300px] max-w-full rounded-full" />
          <Skeleton className="h-9 w-[180px] max-w-full rounded-full" />
          <Skeleton className="h-9 w-[140px] max-w-full rounded-full" />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  // Error state
  if (isError) {
    return (
      <PageShell>
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
        <Panel padded>
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Failed to load stations</h3>
            <p className="max-w-md text-muted-foreground">
              {error instanceof Error ? error.message : "An error occurred while loading stations."}
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Mobile notice — full editing requires a larger screen */}
      <div className="flex min-w-0 items-start gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none sm:hidden">
        <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Use a larger screen to configure stations</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Station setup, PIN config, and printer pairing require a tablet or desktop.</p>
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
          <Button
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Station
          </Button>
        }
      />

      {/* Filters & Bulk Actions */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search — the muted borderless fill comes from the base Input
              (§4.2); only the icon padding is added here. */}
          <div className="relative min-w-0 flex-1 sm:max-w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search stations..."
              className="h-10 w-full rounded-full pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search stations"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full rounded-full border-0 bg-muted/60 px-3 shadow-none sm:w-[180px]">
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
            <SelectTrigger className="h-9 w-full rounded-full border-0 bg-muted/60 px-3 shadow-none sm:w-[140px]">
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
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border-0 bg-muted/60 px-3 py-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              {selectedStationIds.length} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleBulkRemoveClick}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {filteredStations.length === 0 ? (
        stations.length === 0 ? (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <Monitor className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No stations configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first station to start managing your POS setup.
            </p>
            <Button
              className="mt-4 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Station
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No stations found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Desktop table / mobile cards split at `xl` (§5.3) — a nine-column
              station table cannot survive a tablet width. */}
          <div className="hidden min-w-0 xl:block">
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
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
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
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <p className="text-xs tabular-nums text-muted-foreground sm:text-sm">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredStations.length)}{" "}
                of {filteredStations.length} stations
              </p>
              {/* Labelled outline pills (D-08), not ghost icon squares. */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm tabular-nums">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
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
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
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
          <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
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
    </PageShell>
  );
}
