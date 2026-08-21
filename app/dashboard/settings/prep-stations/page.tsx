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
  useGatedLocationId,
  useGatedLocation,
} from "@/stores/location-store";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";

export default function PrepStationsPage() {
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. Multi-location on 'all' -> null.
  const gatedLocationId = useGatedLocationId();
  const selectedLocationId = gatedLocationId ?? "all";
  const isAllLocations = !gatedLocationId;
  const selectedLocation = useGatedLocation();
  const clerkOrgId = useClerkOrgId();

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
      <PageShell>
        <PageHeader
          title="Prep stations"
          subtitle="Manage kitchen routing and KDS preparation areas."
          indicator={
            <LocationIndicator
              isAllLocations={isAllLocations}
              locationName={selectedLocation?.name}
            />
          }
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
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
          title="Prep stations"
          subtitle="Manage kitchen routing and KDS preparation areas."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />

        <Panel padded>
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Select a Location</h3>
            <p className="max-w-md text-muted-foreground">
              Prep stations are location-specific. Please select a location from
              the dropdown above to manage prep stations for that location.
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Prep stations"
          subtitle="Manage kitchen routing and KDS preparation areas."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
          actions={<Skeleton className="h-9 w-40 rounded-full" />}
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <PageHeader
          title="Prep stations"
          subtitle="Manage kitchen routing and KDS preparation areas."
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
            <h3 className="mb-2 text-lg font-semibold">
              Failed to load prep stations
            </h3>
            <p className="max-w-md text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "An error occurred while loading prep stations."}
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Mobile notice */}
      <div className="flex min-w-0 items-start gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none sm:hidden">
        <Flame className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Use a larger screen to configure prep stations</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Kitchen station routing and display assignment require a tablet or desktop.</p>
        </div>
      </div>

      <PageHeader
        title="Prep stations"
        subtitle="Route menu items and categories to the correct KDS preparation area."
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
            Add Prep Station
          </Button>
        }
      />

      <Panel>
        <PanelSection
          icon={Flame}
          label="Prep stations"
          caption="Prep stations define where items are prepared in the kitchen. Assign items or set category defaults to route orders to the correct KDS display. Items without a station route to Expo (catch-all)."
        >
          {prepStations.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <Flame className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No prep stations configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first prep station to start routing items to specific KDS displays.
              </p>
              <Button
                className="mt-4 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Prep Station
              </Button>
            </div>
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
        </PanelSection>
      </Panel>

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
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <div
                className="h-8 w-8 shrink-0 rounded-full"
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
    </PageShell>
  );
}
