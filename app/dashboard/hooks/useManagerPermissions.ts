"use client";

import { useQuery } from "@tanstack/react-query";
import { GetCurrentUserRoleInfo } from "@/app/dashboard/actions/role-check";

type RoleInfo = {
  roleCode: string;
  isOwnerOrAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  assignedLocationIds: string[];
};

/**
 * Hook for checking the current user's merchant role permissions in the dashboard.
 *
 * Permission rules:
 *  - owner / admin  → full CRUD on all entities
 *  - manager        → full CRUD on location-specific entities (their locations only)
 *                     edit price/availability on global items (via location overrides)
 *                     cannot create/delete global entities
 *  - member         → view only
 */
export function useManagerPermissions() {
  const { data: roleInfo, isLoading } = useQuery<RoleInfo | null>({
    queryKey: ["current-user-role"],
    queryFn: () => GetCurrentUserRoleInfo(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const isOwnerOrAdmin = roleInfo?.isOwnerOrAdmin ?? false;
  const isManager = roleInfo?.isManager ?? false;
  const isMember = roleInfo?.isMember ?? false;
  const assignedLocationIds = roleInfo?.assignedLocationIds ?? [];

  /**
   * Can the user create a new entity?
   * @param locationId - If provided, checks if manager has access to this location.
   *                     If null/undefined, this is a global create (only owner/admin).
   */
  function canCreate(locationId?: string | null): boolean {
    if (isOwnerOrAdmin) return true;
    if (isMember) return false;
    if (isManager) {
      if (!locationId) return false; // no global creates
      return assignedLocationIds.includes(locationId);
    }
    return false;
  }

  /**
   * Can the user edit price/availability of a global item in their location?
   * (This goes through location_item_overrides, not the global record.)
   * @param locationId - The location context the manager is editing from.
   */
  function canEditGlobalItemPriceAvailability(
    locationId?: string | null,
  ): boolean {
    if (isOwnerOrAdmin) return true;
    if (!isManager) return false;
    if (!locationId || locationId === "all") return false;
    return assignedLocationIds.includes(locationId);
  }

  /**
   * Can the user fully edit a location-specific entity?
   * @param entityLocationId - The location_id stored on the entity itself.
   */
  function canEditLocationEntity(entityLocationId?: string | null): boolean {
    if (isOwnerOrAdmin) return true;
    if (!isManager) return false;
    if (!entityLocationId) return false; // global entity
    return assignedLocationIds.includes(entityLocationId);
  }

  /**
   * Can the user delete an entity?
   * @param entityLocationId - The location_id stored on the entity itself.
   *                           Null/undefined means it's a global entity.
   */
  function canDelete(entityLocationId?: string | null): boolean {
    if (isOwnerOrAdmin) return true;
    if (!isManager) return false;
    if (!entityLocationId) return false; // cannot delete global entities
    return assignedLocationIds.includes(entityLocationId);
  }

  return {
    isLoading,
    roleInfo,
    isOwnerOrAdmin,
    isManager,
    isMember,
    assignedLocationIds,
    canCreate,
    canEditGlobalItemPriceAvailability,
    canEditLocationEntity,
    canDelete,
  };
}
