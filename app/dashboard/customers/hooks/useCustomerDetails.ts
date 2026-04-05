import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GetCustomerProfileDetails,
  UpdateCustomerProfile,
  GetCustomerNotes,
  AddCustomerNote,
  UpdateCustomerNote,
  DeleteCustomerNote,
  AddCustomerTag,
  RemoveCustomerTag,
  GetMerchantCustomerTags,
  GetMerchantStaffProfiles,
} from "@/app/dashboard/actions/customer-details";

/**
 * Get complete customer profile details
 */
export function useCustomerProfileDetails(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-profile-details", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      return GetCustomerProfileDetails(customerId);
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get customer notes
 */
export function useCustomerNotes(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      return GetCustomerNotes(customerId);
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Get existing tags for merchant (for autocomplete)
 */
export function useMerchantCustomerTags(merchantId: string | null) {
  return useQuery({
    queryKey: ["merchant-customer-tags", merchantId],
    queryFn: async () => {
      if (!merchantId) return [];
      return GetMerchantCustomerTags(merchantId);
    },
    enabled: !!merchantId,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Get staff profiles for preferred server dropdown
 */
export function useMerchantStaffProfiles(merchantId: string | null) {
  return useQuery({
    queryKey: ["merchant-staff-profiles", merchantId],
    queryFn: async () => {
      if (!merchantId) return [];
      return GetMerchantStaffProfiles(merchantId);
    },
    enabled: !!merchantId,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Mutation: Update customer profile
 */
export function useUpdateCustomerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: UpdateCustomerProfile,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-profile-details", variables.customerId],
        refetchType: "active",
      });
    },
  });
}

/**
 * Mutation: Add customer note
 */
export function useAddCustomerNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: AddCustomerNote,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-notes", variables.customerId],
        refetchType: "active",
      });
    },
  });
}

/**
 * Mutation: Update customer note
 */
export function useUpdateCustomerNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: UpdateCustomerNote,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-notes"],
        refetchType: "active",
      });
    },
  });
}

/**
 * Mutation: Delete customer note
 */
export function useDeleteCustomerNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DeleteCustomerNote,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-notes"],
        refetchType: "active",
      });
    },
  });
}

/**
 * Mutation: Add tag to customer
 */
export function useAddCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: AddCustomerTag,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-profile-details", variables.customerId],
        refetchType: "active",
      });
    },
  });
}

/**
 * Mutation: Remove tag from customer
 */
export function useRemoveCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: RemoveCustomerTag,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-profile-details", variables.customerId],
        refetchType: "active",
      });
    },
  });
}
