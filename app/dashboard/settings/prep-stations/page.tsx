"use client";

import { useState, useEffect } from "react";
import {
  usePrepStations,
  useUpdatePrepStation,
  useDeletePrepStation,
  useCategoryPrepDefaults,
  type PrepStationWithCount,
} from "@/app/dashboard/hooks/usePrepStations";
import { AddEditPrepStationDialog } from "./components/AddEditPrepStationDialog";
import { PrepStationCard } from "./components/PrepStationCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, AlertTriangle, MapPin, Loader2, Flame } from "lucide-react";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

export default function PrepStationsPage() {
  const selectedLocationId = useLocationStore(
    (state) => state.selectedLocationId,
  );
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  const {
    data: prepStations = [],
    isLoading,
    isError,
    error,
  } = usePrepStations(selectedLocationId);

  const { data: categoryDefaults = [] } =
    useCategoryPrepDefaults(selectedLocationId);

  const categoriesByStationId = categoryDefaults.reduce<Record<string, string[]>>(
    (acc, def) => {
      if (!def.category_name) return acc;
      (acc[def.prep_station_id] ||= []).push(def.category_name);
      return acc;
    },
    {},
  );

  const updateMutation = useUpdatePrepStation();
  const deleteMutation = useDeletePrepStation();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStation, setEditingStation] =
    useState<PrepStationWithCount | null>(null);
  const [stationToDelete, setStationToDelete] =
    useState<PrepStationWithCount | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEdit = (station: PrepStationWithCount) => {
    setEditingStation(station);
    setIsAddDialogOpen(true);
  };

  const handleToggleActive = (station: PrepStationWithCount) => {
    updateMutation.mutate({
      stationId: station.id,
      input: { is_active: !station.is_active },
    });
  };

  const handleDeleteClick = (station: PrepStationWithCount) => {
    setStationToDelete(station);
  };

  const handleConfirmDelete = async () => {
    if (!stationToDelete) return;
    try {
      await deleteMutation.mutateAsync(stationToDelete.id);
      setStationToDelete(null);
    } catch {
      // Error handled in mutation
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prep Stations</h2>
          <p className="text-muted-foreground">
            Manage kitchen prep stations for KDS routing
          </p>
        </div>
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // Show location selection prompt when "All Locations" is selected
  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prep Stations</h2>
          <p className="text-muted-foreground">
            Manage kitchen prep stations for KDS routing
          </p>
        </div>

        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
            <p className="text-muted-foreground max-w-md">
              Prep stations are location-specific. Please select a location from
              the dropdown above to manage prep stations for that location.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Prep Stations
            </h2>
            <p className="text-muted-foreground">
              Configure prep stations for{" "}
              <span className="font-medium">{selectedLocation?.name}</span>
            </p>
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prep Stations</h2>
          <p className="text-muted-foreground">
            Configure prep stations for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-12 w-12 mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to load prep stations
            </h3>
            <p className="text-muted-foreground max-w-md">
              {error instanceof Error
                ? error.message
                : "An error occurred while loading prep stations."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prep Stations</h2>
          <p className="text-muted-foreground">
            Configure prep stations for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Prep Station
        </Button>
      </div>

      {/* Info */}
      <div className="text-sm text-muted-foreground bg-muted/50 border rounded-lg p-3">
        Prep stations define where items are prepared in the kitchen. Assign
        items or set category defaults to route orders to the correct KDS
        display. Items without a station route to Expo (catch-all).
      </div>

      {/* Content */}
      {prepStations.length === 0 ? (
        <Empty
          icon={Flame}
          title="No prep stations configured"
          description="Add your first prep station to start routing items to specific KDS displays."
          action={
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Prep Station
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {prepStations.map((station) => (
            <PrepStationCard
              key={station.id}
              station={station}
              assignedCategories={categoriesByStationId[station.id] || []}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <AddEditPrepStationDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setEditingStation(null);
        }}
        locationId={selectedLocationId}
        clerkOrgId={clerkOrgId || ""}
        stationToEdit={editingStation}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!stationToDelete}
        onOpenChange={(open) => {
          if (!deleteMutation.isPending && !open) setStationToDelete(null);
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
                  Delete &quot;{stationToDelete?.name}&quot;?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              This will permanently delete this prep station.
              {stationToDelete && stationToDelete.item_count > 0 && (
                <>
                  {" "}
                  <span className="font-medium text-foreground">
                    {stationToDelete.item_count} item
                    {stationToDelete.item_count !== 1 ? "s" : ""}
                  </span>{" "}
                  currently assigned to this station will become unassigned and
                  fall back to category default or Expo routing.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {stationToDelete && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <div
                className="h-8 w-8 rounded-full flex-shrink-0"
                style={{ backgroundColor: stationToDelete.color }}
              />
              <div>
                <p className="font-medium">{stationToDelete.name}</p>
                {stationToDelete.item_count > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {stationToDelete.item_count} assigned item
                    {stationToDelete.item_count !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
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
