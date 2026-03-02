"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  GetPendingInvites,
  ResendStaffInvite,
  RevokeStaffInvite,
  type PendingInvite,
} from "../actions/invites";

// ============================================================================
// Query hook
// ============================================================================

export function usePendingInvites() {
  const clerkOrgId = useClerkOrgId();

  return useQuery<PendingInvite[]>({
    queryKey: ["pending-invites", clerkOrgId],
    queryFn: () => GetPendingInvites(clerkOrgId),
    enabled: !!clerkOrgId,
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useResendInvite() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (inviteId: string) => ResendStaffInvite(inviteId, clerkOrgId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Resend failed", { description: result.error });
        return;
      }
      toast.success("Invitation resent", {
        description: "A new invite email has been sent",
      });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
    onError: () => {
      toast.error("Resend failed", {
        description: "An unexpected error occurred",
      });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (inviteId: string) => RevokeStaffInvite(inviteId, clerkOrgId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Revoke failed", { description: result.error });
        return;
      }
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
    onError: () => {
      toast.error("Revoke failed", {
        description: "An unexpected error occurred",
      });
    },
  });
}
