"use client";

/**
 * useRoleAwareScopeCopy — single source of truth for merchant-facing
 * scope copy, with role awareness baked in. Consumer components call
 * this hook and render the returned ViewModel without branching on
 * `isOwnerOrAdmin` / `isManager` / `isMember` themselves.
 *
 * See lib/menu/role-scope.ts for the pure degradation helpers.
 */

import * as React from "react";
import {
  affectsLabel,
  type CascadeLevel,
  type ScopeContext,
} from "./cascade-labels";
import {
  canEditAtScope,
  effectiveScopeForRole,
  type RoleLite,
} from "./role-scope";
import { useManagerPermissions } from "@/app/dashboard/hooks/useManagerPermissions";
import {
  useIsAllLocations,
  useLocationStore,
  useSelectedLocation,
} from "@/stores/location-store";

type EntityType = "items" | "categories" | "menus" | "modifiers" | "overrides";

export interface RoleAwareScopeViewModel {
  role: {
    isOwner: boolean;
    isManager: boolean;
    isMember: boolean;
    assignedCount: number;
    isLoading: boolean;
  };
  effectiveScope: ScopeContext;
  canEdit: boolean;
  affects: { mode: "label" | "readonly"; label: string };
  strip: {
    primaryLabel: string;
    secondaryLabel: string;
    showAllLocationsOption: boolean;
  };
  banner: {
    canOpenGlobal: boolean;
    lockedFieldsExplainer: string;
  };
  ladder: {
    grayedLevels: CascadeLevel[];
    replaceWithMessage: string | null;
  };
  empty: {
    override: boolean;
    title: string;
    description: string;
  };
  quickCreate: {
    canCreate: boolean;
    headerAffectsLabel: string;
  };
}

const ENTITY_COPY: Record<
  EntityType,
  { plural: string; singular: string; createVerb: string }
> = {
  items: { plural: "items", singular: "item", createVerb: "Create an item" },
  categories: {
    plural: "categories",
    singular: "category",
    createVerb: "Create a category",
  },
  menus: { plural: "menus", singular: "menu", createVerb: "Create a menu" },
  modifiers: {
    plural: "modifier groups",
    singular: "modifier group",
    createVerb: "Create a modifier group",
  },
  overrides: {
    plural: "overrides",
    singular: "override",
    createVerb: "Create an override",
  },
};

export function useRoleAwareScopeCopy(
  rawScope: ScopeContext,
  opts?: { entity?: EntityType },
): RoleAwareScopeViewModel {
  const {
    isLoading,
    isOwnerOrAdmin,
    isManager,
    isMember,
    assignedLocationIds,
  } = useManagerPermissions();
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const locations = useLocationStore((s) => s.locations);
  const selectedLocationId = useLocationStore((s) => s.selectedLocationId);
  const entity = opts?.entity ?? "items";
  const meta = ENTITY_COPY[entity];

  const assignedCount = assignedLocationIds.length;

  // Resolve the single anchor location name for managers with 1 assigned loc.
  const managerSingleLocName = React.useMemo(() => {
    if (!isManager || assignedCount !== 1) return null;
    const loc = locations.find((l) => l.id === assignedLocationIds[0]);
    return loc?.name ?? null;
  }, [isManager, assignedCount, locations, assignedLocationIds]);

  const role: RoleLite = React.useMemo(
    () => ({
      isOwnerOrAdmin,
      isManager,
      isMember,
      assignedLocationIds,
    }),
    [isOwnerOrAdmin, isManager, isMember, assignedLocationIds],
  );

  const anchorLocName = selectedLocation?.name ?? managerSingleLocName ?? null;
  const effectiveScope = effectiveScopeForRole(rawScope, role, anchorLocName);

  // canEdit: combines role capability at the scope level with whether the
  // manager is actually assigned to the currently-selected location.
  const canEdit = React.useMemo(() => {
    if (isOwnerOrAdmin) return true;
    if (isMember) return false;
    if (!isManager) return false;
    if (!canEditAtScope(effectiveScope, role)) return false;
    if (isAllLocations) return false;
    if (!selectedLocationId || selectedLocationId === "all") return false;
    return assignedLocationIds.includes(selectedLocationId);
  }, [
    isOwnerOrAdmin,
    isMember,
    isManager,
    effectiveScope,
    role,
    isAllLocations,
    selectedLocationId,
    assignedLocationIds,
  ]);

  // affects
  const affects: RoleAwareScopeViewModel["affects"] = isMember
    ? { mode: "readonly", label: "Read-only" }
    : { mode: "label", label: affectsLabel(effectiveScope) };

  // strip
  const strip: RoleAwareScopeViewModel["strip"] = (() => {
    if (isMember) {
      return {
        primaryLabel: isAllLocations
          ? "All Locations"
          : selectedLocation?.name || "Select location",
        secondaryLabel: "View-only access.",
        showAllLocationsOption: false,
      };
    }
    if (isOwnerOrAdmin) {
      return {
        primaryLabel: isAllLocations
          ? "All Locations"
          : selectedLocation?.name || "Select location",
        secondaryLabel: isAllLocations
          ? "Edits here affect the Global default at every location."
          : `Edits here affect ${selectedLocation?.name || "this location"} only (inherits from Global).`,
        showAllLocationsOption: true,
      };
    }
    if (isManager) {
      if (isAllLocations) {
        if (assignedCount <= 1) {
          const name = managerSingleLocName || "your location";
          return {
            primaryLabel: name,
            secondaryLabel: `Editing ${name} only — your assigned location.`,
            showAllLocationsOption: false,
          };
        }
        return {
          primaryLabel: `${assignedCount} locations`,
          secondaryLabel:
            "Switch to a specific location to edit — each save is scoped to one location.",
          showAllLocationsOption: false,
        };
      }
      const name = selectedLocation?.name || "this location";
      return {
        primaryLabel: name,
        secondaryLabel: `Editing ${name} only — your assigned location.`,
        showAllLocationsOption: false,
      };
    }
    // Loading / unknown — fall back to owner-style copy without the
    // "All Locations" dropdown option so we don't accidentally expose it.
    return {
      primaryLabel: isAllLocations
        ? "All Locations"
        : selectedLocation?.name || "Select location",
      secondaryLabel: isAllLocations
        ? "Edits here affect the Global default at every location."
        : `Edits here affect ${selectedLocation?.name || "this location"} only (inherits from Global).`,
      showAllLocationsOption: false,
    };
  })();

  // banner
  const banner: RoleAwareScopeViewModel["banner"] = (() => {
    if (isMember) {
      return {
        canOpenGlobal: false,
        lockedFieldsExplainer:
          "This item's details are managed by your merchant owner.",
      };
    }
    if (isManager) {
      const name =
        selectedLocation?.name || managerSingleLocName || "your location";
      return {
        canOpenGlobal: false,
        lockedFieldsExplainer: `Name, photo, and description are managed by your merchant owner. You can still edit price and availability for ${name}.`,
      };
    }
    return {
      canOpenGlobal: true,
      lockedFieldsExplainer:
        "To change name/photo/description, edit the Global version.",
    };
  })();

  // ladder
  const ladder: RoleAwareScopeViewModel["ladder"] = (() => {
    if (isMember) {
      return {
        grayedLevels: [1, 2, 3, 4, 5] as CascadeLevel[],
        replaceWithMessage:
          "Prices are set by your merchant owner or manager.",
      };
    }
    if (isManager) {
      return {
        grayedLevels: [1, 3] as CascadeLevel[],
        replaceWithMessage: null,
      };
    }
    return {
      grayedLevels: [],
      replaceWithMessage: null,
    };
  })();

  // empty
  const empty: RoleAwareScopeViewModel["empty"] = (() => {
    if (isMember) {
      return {
        override: true,
        title: `No ${meta.plural} available here`,
        description: `Ask your merchant owner or manager to add ${meta.plural}.`,
      };
    }
    if (isManager) {
      if (isAllLocations) {
        if (assignedCount <= 1 && managerSingleLocName) {
          return {
            override: true,
            title: `No ${meta.plural} at ${managerSingleLocName} yet`,
            description: `${meta.createVerb} for ${managerSingleLocName}.`,
          };
        }
        return {
          override: true,
          title: `No ${meta.plural} yet`,
          description: `${meta.createVerb} for a specific location.`,
        };
      }
      const name = selectedLocation?.name || "this location";
      return {
        override: true,
        title: `No ${meta.plural} at ${name} yet`,
        description: `${meta.createVerb} for ${name}.`,
      };
    }
    return {
      override: false,
      title: "",
      description: "",
    };
  })();

  // quickCreate
  const quickCreate: RoleAwareScopeViewModel["quickCreate"] = (() => {
    if (isMember) {
      return { canCreate: false, headerAffectsLabel: "" };
    }
    if (isManager) {
      if (isAllLocations) {
        if (assignedCount <= 1 && managerSingleLocName) {
          return {
            canCreate: true,
            headerAffectsLabel: `${managerSingleLocName} only`,
          };
        }
        return {
          canCreate: false,
          headerAffectsLabel: "Select a location first",
        };
      }
      const name = selectedLocation?.name || "this location";
      return {
        canCreate:
          !!selectedLocationId &&
          assignedLocationIds.includes(selectedLocationId),
        headerAffectsLabel: `${name} only`,
      };
    }
    // Owner / admin
    if (isAllLocations) {
      return { canCreate: true, headerAffectsLabel: "Everywhere" };
    }
    const name = selectedLocation?.name || "this location";
    return {
      canCreate: true,
      headerAffectsLabel: `${name} only`,
    };
  })();

  return {
    role: {
      isOwner: isOwnerOrAdmin,
      isManager,
      isMember,
      assignedCount,
      isLoading,
    },
    effectiveScope,
    canEdit,
    affects,
    strip,
    banner,
    ladder,
    empty,
    quickCreate,
  };
}
