/**
 * Role × Scope — pure helpers that layer merchant-side role awareness on
 * top of the role-agnostic cascade-labels. Keep this file free of React
 * so it stays unit-testable in node without a DOM.
 *
 * Role rules (see CLAUDE.md):
 *   owner / admin  — full CRUD at every level.
 *   manager        — can save at L2/L4/L5 (location-scoped) for their
 *                    assignedLocationIds. Saves targeting L1/L3 are
 *                    routed down to L2/L4 respectively.
 *   member         — view-only. Every save is rejected server-side.
 */

import type { ScopeContext } from "./cascade-labels";

export interface RoleLite {
  isOwnerOrAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  assignedLocationIds: string[];
}

/**
 * Returns the scope a save would actually land at for the given role.
 *
 * - Owner / member / unknown: returns `ctx` unchanged (member saves are
 *   rejected anyway; returning unchanged keeps colours/icons predictable).
 * - Manager with a location anchor: L1 → L2, L3 → L4 using the anchor.
 *   Without an anchor, returns `ctx` unchanged — the caller must flag
 *   this state as non-editable and ask the manager to pick a location.
 */
export function effectiveScopeForRole(
  ctx: ScopeContext,
  role: RoleLite | null | undefined,
  selectedLocationName?: string | null,
): ScopeContext {
  if (!role) return ctx;
  if (role.isOwnerOrAdmin || role.isMember) return ctx;
  if (!role.isManager) return ctx;

  if (ctx.level === 1 && selectedLocationName) {
    return { level: 2, locationName: selectedLocationName };
  }
  if (ctx.level === 3 && selectedLocationName) {
    return {
      level: 4,
      categoryName: ctx.categoryName,
      locationName: selectedLocationName,
    };
  }
  return ctx;
}

/**
 * Can a user with this role edit at this scope level?
 *
 * Note: this only checks the role's capability at that level — it does
 * NOT verify the manager is assigned to the specific location in `ctx`.
 * The hook layer combines this with `assignedLocationIds` + the
 * location-store's `selectedLocationId`.
 */
export function canEditAtScope(
  ctx: ScopeContext,
  role: RoleLite | null | undefined,
): boolean {
  if (!role) return false;
  if (role.isMember) return false;
  if (role.isOwnerOrAdmin) return true;
  if (role.isManager) {
    // Location-scoped levels only.
    return ctx.level === 2 || ctx.level === 4 || ctx.level === 5;
  }
  return false;
}
