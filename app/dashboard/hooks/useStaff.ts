"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import {
  GetUnifiedStaffView,
  GetStaffMember,
  CreatePOSStaff,
  CreateClerkUserDirectly,
  InviteClerkStaff,
  UpdateStaffLocationAssignment,
  ResetStaffPIN,
  ResetStaffPassword,
  DeactivateStaffMember,
  ReactivateStaffMember,
  UpgradePOSStaffToClerk,
  DemoteClerkToPOSOnly,
  GetCurrentUserPinStatus,
  UpdateStaffProfile,
  UpdateStaffProfileData,
  AddStaffToLocation,
  RemoveStaffFromLocation,
  BulkDeactivateStaff,
  BulkResetPINs,
  BulkResetPasswords,
  BulkAssignRole,
} from "../actions/unified-staff";
import {
  InviteStaffFormData,
  UnifiedStaffMember,
  UpdateStaffAssignmentData,
  BulkPinResetResult,
} from "@/types/staff";
import { toast } from "sonner";
import { CredentialToast } from "@/components/ui/credential-toast";

// Helper function to show credential toast
function showCredentialToast(pin?: string, password?: string) {
  return toast.custom(
    (t) => {
      return React.createElement(
        "div",
        { className: "rounded-lg border bg-background shadow-lg" },
        React.createElement(CredentialToast, {
          pin,
          password,
          duration: 15,
          onDismiss: () => toast.dismiss(t),
        })
      );
    },
    {
      duration: 15000, // 15 seconds
      position: "top-center" as const,
    }
  );
}

// ============================================================================
// Helper Hooks
// ============================================================================

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

// ============================================================================
// Location Scoping Helpers
// ============================================================================

/**
 * Determines if the current view is "All Locations"
 */
export function useIsAllLocations() {
  const { selectedLocationId } = useLocationStore();
  return selectedLocationId === "all";
}

/**
 * Gets the selected location from the store
 */
export function useSelectedLocation() {
  const { selectedLocationId, locations } = useLocationStore();
  if (selectedLocationId === "all") return null;
  return locations.find((loc) => loc.id === selectedLocationId) || null;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get unified staff view with automatic location scoping
 * - Global Admins see all staff across all locations
 * - Location Managers see only staff at their locations
 */
export function useUnifiedStaff() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const { data: userInfo } = useUserInfo();

  // Determine if user is global admin or location manager
  const userRole = userInfo?.members?.[0]?.role;
  const isGlobalAdmin = userRole === "admin" || userRole === "org:admin";

  // For global view, pass null to see all staff
  // For location view, pass the location ID
  const effectiveLocationId =
    selectedLocationId === "all" ? null : selectedLocationId;

  // Location managers can only see staff at selected location
  const finalLocationId = isGlobalAdmin
    ? effectiveLocationId
    : selectedLocationId;

  return useQuery<UnifiedStaffMember[]>({
    queryKey: ["unified-staff", clerkOrgId, finalLocationId],
    queryFn: () =>
      GetUnifiedStaffView(
        clerkOrgId,
        finalLocationId === "all" ? null : finalLocationId
      ),
    enabled: !!clerkOrgId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Get single staff member details
 */
export function useStaffMember(memberId: string | undefined) {
  return useQuery<UnifiedStaffMember | null>({
    queryKey: ["staff-member", memberId],
    queryFn: () =>
      memberId ? GetStaffMember(memberId) : Promise.resolve(null),
    enabled: !!memberId,
    staleTime: 0, // Always fetch fresh data
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create POS staff member
 */
export function useCreatePOSStaff() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (data: InviteStaffFormData) => CreatePOSStaff(clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to create staff", { description: result.error });
        return;
      }

      // Show enhanced credential toast if PIN was generated
      if (result.data?.generated_pin) {
        showCredentialToast(result.data.generated_pin);
      } else {
        toast.success("Staff member created", {
          description: "POS staff member has been added successfully",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Failed to create staff", {
        description: "An unexpected error occurred",
      });
      console.error("Create POS staff error:", error);
    },
  });
}

/**
 * Create Clerk user directly (no invitation)
 */
export function useCreateClerkUserDirectly() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (data: InviteStaffFormData) =>
      CreateClerkUserDirectly(clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to create user", { description: result.error });
        return;
      }

      // Show enhanced credential toast if password or PIN was generated
      if (result.data?.temp_password || result.data?.generated_pin) {
        showCredentialToast(
          result.data?.generated_pin,
          result.data?.temp_password
        );
      } else {
        toast.success("User created successfully", {
          description: "User account has been created",
        });
      }

      // Soft warning when Clerk rejected the phone (already linked to another
      // account). The user was still created; phone is stored on staff_profiles.
      if (result.data?.phone_skipped) {
        toast.warning("Phone not linked to login", {
          description:
            "This phone is already on another account. Saved on staff profile only.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Failed to create user", {
        description: "An unexpected error occurred",
      });
      console.error("Create Clerk user error:", error);
    },
  });
}

/**
 * Invite Clerk user
 */
export function useInviteClerkStaff() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();
  const { data: userInfo } = useUserInfo();

  return useMutation({
    mutationFn: (data: InviteStaffFormData) =>
      InviteClerkStaff(userInfo.id, clerkOrgId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to send invite", { description: result.error });
        return;
      }

      // Show PIN in credential toast if one was generated for POS access
      if (result.data?.generated_pin) {
        showCredentialToast(result.data.generated_pin);
        toast.success("Invitation sent", {
          description: "Invitation email has been sent. Save the PIN shown above.",
        });
      } else {
        toast.success("Invitation sent", {
          description: "Invitation email has been sent",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Failed to send invite", {
        description: "An unexpected error occurred",
      });
      console.error("Invite Clerk staff error:", error);
    },
  });
}

/**
 * Update staff location assignment
 */
export function useUpdateStaffAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
      updates,
      roleName,
    }: {
      memberId: string;
      locationId: string;
      updates: UpdateStaffAssignmentData;
      roleName?: string;
    }) => UpdateStaffLocationAssignment(memberId, locationId, updates),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Update failed", { description: result.error });
        return;
      }

      // Force aggressive refetch to ensure UI is perfectly synced
      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Update failed", {
        description: "An unexpected error occurred",
      });
      console.error("Update staff assignment error:", error);
    },
  });
}

/**
 * Reset staff PIN
 */
export function useResetStaffPIN() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
      newPin,
    }: {
      memberId: string;
      locationId: string;
      newPin?: string;
    }) => ResetStaffPIN(memberId, locationId, newPin),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("PIN reset failed", { description: result.error });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("PIN reset successfully", {
        description: "The updated PIN is now available in staff details.",
      });

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("PIN reset failed", {
        description: "An unexpected error occurred",
      });
      console.error("Reset PIN error:", error);
    },
  });
}

/**
 * Deactivate staff member
 */
export function useDeactivateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
    }: {
      memberId: string;
      locationId?: string;
    }) => DeactivateStaffMember(memberId, locationId),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Deactivation failed", { description: result.error });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Staff member deactivated");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Deactivation failed", {
        description: "An unexpected error occurred",
      });
      console.error("Deactivate staff error:", error);
    },
  });
}

/**
 * Reactivate staff member
 */
export function useReactivateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
    }: {
      memberId: string;
      locationId?: string;
    }) => ReactivateStaffMember(memberId, locationId),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Reactivation failed", { description: result.error });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Staff member reactivated");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Reactivation failed", {
        description: "An unexpected error occurred",
      });
      console.error("Reactivate staff error:", error);
    },
  });
}

/**
 * Check if the currently-logged-in Clerk user has a POS PIN set.
 * Used to drive the dashboard PIN-setup banner.
 */
export function usePinStatus() {
  const clerkOrgId = useClerkOrgId();
  const { data: userInfo } = useUserInfo();
  const userId = userInfo?.id;

  return useQuery({
    queryKey: ["pin-status", clerkOrgId, userId],
    queryFn: () => GetCurrentUserPinStatus(clerkOrgId, userId ?? ""),
    enabled: !!clerkOrgId && !!userId,
    staleTime: 60_000, // 1 minute — PIN status doesn't change often
  });
}

/**
 * Upgrade POS-only staff to Clerk dashboard user
 */
export function useUpgradePOSToClerk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
      email,
    }: {
      memberId: string;
      locationId: string;
      email: string;
    }) => UpgradePOSStaffToClerk(memberId, locationId, email),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Upgrade failed", { description: result.error });
        return;
      }

      // Show credential toast with temporary password
      if (result.data?.temp_password) {
        showCredentialToast(undefined, result.data.temp_password);
        toast.success("Successfully upgraded to Dashboard User", {
          description: `Account created with email: ${result.data.email}`,
        });
      } else {
        toast.success("Successfully upgraded to Dashboard User");
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Upgrade failed", {
        description: "An unexpected error occurred",
      });
      console.error("Upgrade POS to Clerk error:", error);
    },
  });
}

/**
 * Demote a Clerk dashboard user back to POS-only.
 * Revokes org membership and reverts account_type.
 */
export function useDemoteClerkToPOS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => DemoteClerkToPOSOnly(memberId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Demotion failed", { description: result.error });
        return;
      }

      toast.success("Staff demoted to POS-only", {
        description: "Dashboard access has been revoked.",
      });
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Demotion failed", {
        description: "An unexpected error occurred",
      });
      console.error("Demote Clerk to POS error:", error);
    },
  });
}

// ============================================================================
// Profile & Location Management Hooks
// ============================================================================

/**
 * Update staff profile (name, email, phone) with Clerk sync
 */
export function useUpdateStaffProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      updates,
    }: {
      memberId: string;
      updates: UpdateStaffProfileData;
    }) => UpdateStaffProfile(memberId, updates),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Update failed", { description: result.error });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Update failed", {
        description: "An unexpected error occurred",
      });
      console.error("Update staff profile error:", error);
    },
  });
}

/**
 * Add staff member to a location
 */
export function useAddStaffToLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
      roleCode,
      isPrimary,
    }: {
      memberId: string;
      locationId: string;
      roleCode: string;
      isPrimary?: boolean;
    }) => AddStaffToLocation(memberId, locationId, roleCode, isPrimary),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Failed to add to location", { description: result.error });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Staff added to location");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Failed to add to location", {
        description: "An unexpected error occurred",
      });
      console.error("Add staff to location error:", error);
    },
  });
}

/**
 * Remove staff member from a location (soft-delete via is_active = false)
 */
export function useRemoveStaffFromLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      locationId,
    }: {
      memberId: string;
      locationId: string;
    }) => RemoveStaffFromLocation(memberId, locationId),
    onSuccess: async (result, variables) => {
      if (result.error) {
        toast.error("Failed to remove from location", {
          description: result.error,
        });
        return;
      }

      await queryClient.refetchQueries({
        queryKey: ["staff-member", variables.memberId],
        type: "active",
        exact: true,
      });

      toast.success("Staff removed from location");
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
    },
    onError: (error) => {
      toast.error("Failed to remove from location", {
        description: "An unexpected error occurred",
      });
      console.error("Remove staff from location error:", error);
    },
  });
}

// ============================================================================
// Bulk Operation Hooks
// ============================================================================

/**
 * Bulk deactivate staff members
 */
export function useBulkDeactivateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberIds: string[]) => BulkDeactivateStaff(memberIds),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Bulk deactivation failed", { description: result.error });
        return;
      }

      const { deactivated, errors } = result.data!;
      if (errors.length > 0) {
        toast.warning(
          `Deactivated ${deactivated} staff, ${errors.length} failed`,
        );
      } else {
        toast.success(`Deactivated ${deactivated} staff member(s)`);
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Bulk deactivation failed", {
        description: "An unexpected error occurred",
      });
      console.error("Bulk deactivate error:", error);
    },
  });
}

/**
 * Bulk reset PINs — returns the list of new PINs for export
 */
export function useBulkResetPINs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberIds, customPin }: { memberIds: string[]; customPin?: string }) =>
      BulkResetPINs(memberIds, customPin),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Bulk PIN reset failed", { description: result.error });
        return;
      }

      const { results, errors } = result.data!;
      if (errors.length > 0) {
        toast.warning(
          `Reset ${results.length} PINs, ${errors.length} failed`,
        );
      } else {
        toast.success(`Reset ${results.length} PIN(s) successfully`);
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Bulk PIN reset failed", {
        description: "An unexpected error occurred",
      });
      console.error("Bulk PIN reset error:", error);
    },
  });
}

/**
 * Bulk assign role to staff members
 */
export function useBulkAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberIds,
      roleCode,
    }: {
      memberIds: string[];
      roleCode: string;
    }) => BulkAssignRole(memberIds, roleCode),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Bulk role assignment failed", {
          description: result.error,
        });
        return;
      }

      const { updated, errors } = result.data!;
      if (errors.length > 0) {
        toast.warning(
          `Updated ${updated} staff, ${errors.length} failed`,
        );
      } else {
        toast.success(`Role assigned to ${updated} staff member(s)`);
      }

      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: (error) => {
      toast.error("Bulk role assignment failed", {
        description: "An unexpected error occurred",
      });
      console.error("Bulk assign role error:", error);
    },
  });
}

/**
 * Reset dashboard password for a single Clerk staff member
 */
export function useResetStaffPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      customPassword,
    }: {
      memberId: string;
      customPassword?: string;
    }) => ResetStaffPassword(memberId, customPassword),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to reset password", { description: result.error });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: () => {
      toast.error("Failed to reset password");
    },
  });
}

/**
 * Bulk reset dashboard passwords for selected Clerk staff members
 */
export function useBulkResetPasswords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberIds: string[]) => BulkResetPasswords(memberIds),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Bulk password reset failed", { description: result.error });
        return;
      }
      const { results, errors } = result.data!;
      if (errors.length > 0) {
        toast.warning(`Reset ${results.length} password(s), ${errors.length} failed`);
      } else {
        toast.success(`Reset ${results.length} password(s) successfully`);
      }
      queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member"] });
    },
    onError: () => {
      toast.error("Bulk password reset failed");
    },
  });
}
