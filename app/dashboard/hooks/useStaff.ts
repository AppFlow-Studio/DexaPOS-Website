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
  DeactivateStaffMember,
  ReactivateStaffMember,
  UpgradePOSStaffToClerk,
} from "../actions/unified-staff";
import {
  InviteStaffFormData,
  UnifiedStaffMember,
  UpdateStaffAssignmentData,
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

      toast.success("Invitation sent", {
        description: "Invitation email has been sent",
      });

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
        description: result.data?.pin
          ? `New PIN: ${result.data.pin}`
          : "PIN updated",
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
