type PickableLocation = {
  id: string;
  is_active: boolean;
  is_primary_location?: boolean;
};

export function resolveInitialLocationSelection(
  selectedLocationId: string,
  locations: PickableLocation[],
): string {
  const activeLocations = locations.filter((location) => location.is_active);

  // A single store still uses the shared menu core internally.
  if (activeLocations.length < 2) return "all";

  if (activeLocations.some((location) => location.id === selectedLocationId)) {
    return selectedLocationId;
  }

  return (
    activeLocations.find((location) => location.is_primary_location)?.id ??
    activeLocations[0].id
  );
}
