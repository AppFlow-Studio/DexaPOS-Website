export type ModifierScopeFilter = "all" | "global" | "location";

type ModifierReorderContext = {
  hasSearch: boolean;
  isAllLocations: boolean;
  isSingleLocation: boolean;
  scopeFilter: ModifierScopeFilter;
};

export function canReorderModifierLibrary({
  hasSearch,
  isAllLocations,
  isSingleLocation,
  scopeFilter,
}: ModifierReorderContext): boolean {
  if (hasSearch) return false;
  if (isSingleLocation) return true;
  return !isAllLocations || scopeFilter === "global";
}
