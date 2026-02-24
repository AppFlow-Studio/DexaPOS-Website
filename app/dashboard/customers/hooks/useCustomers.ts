"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetCustomers,
  GetCustomerProfile,
  SearchCustomers,
  UpdateCustomer,
  AddCustomerTag,
  RemoveCustomerTag,
  UpdateCustomerNotes,
  CreateCustomer,
  CheckCustomerByPhone,
  BulkAddTagToCustomers,
  BulkRemoveTagFromCustomers,
  FindDuplicateCustomers,
  MergeCustomers,
  DeleteCustomer,
} from "@/app/dashboard/actions/customers";
import type {
  Customer,
  CustomerProfile,
  CustomerListItem,
} from "@/types/customer";

// =============================================================================
// Helper Hook: Get Clerk Org ID
// =============================================================================

function useClerkOrgId(): string {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

// =============================================================================
// Customer List Hooks
// =============================================================================

/**
 * Fetch all customers for the current merchant
 */
export function useCustomers(options?: {
  limit?: number;
  offset?: number;
  orderBy?: "last_order_date" | "lifetime_spend" | "visits" | "created_at";
  ascending?: boolean;
}) {
  const clerkOrgId = useClerkOrgId();

  return useQuery<CustomerListItem[]>({
    queryKey: ["customers", clerkOrgId, options],
    queryFn: () => GetCustomers(clerkOrgId, options),
    enabled: !!clerkOrgId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Search customers by name, phone, or email
 */
export function useSearchCustomers(query: string, limit: number = 20) {
  const clerkOrgId = useClerkOrgId();

  return useQuery<CustomerListItem[]>({
    queryKey: ["customers", "search", clerkOrgId, query],
    queryFn: () => SearchCustomers(clerkOrgId, query, limit),
    enabled: !!clerkOrgId && query.trim().length >= 2,
    staleTime: 10000, // 10 seconds
  });
}

// =============================================================================
// Customer Profile Hook
// =============================================================================

/**
 * Fetch full customer profile with analytics
 * Uses the get_customer_profile RPC function
 */
export function useCustomerProfile(customerId: string | null) {
  return useQuery<CustomerProfile | null>({
    queryKey: ["customer", "profile", customerId],
    queryFn: () => (customerId ? GetCustomerProfile(customerId) : null),
    enabled: !!customerId,
    staleTime: 15000, // 15 seconds
  });
}

// =============================================================================
// Customer Update Mutations
// =============================================================================

/**
 * Update customer fields
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      updates,
    }: {
      customerId: string;
      updates: Partial<
        Pick<Customer, "name" | "phone" | "email" | "address" | "notes" | "tags">
      >;
    }) => UpdateCustomer(customerId, updates),
    onSuccess: (result, variables) => {
      if (result.success) {
        // Invalidate both the list and the specific customer profile
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({
          queryKey: ["customer", "profile", variables.customerId],
        });
      }
    },
  });
}

/**
 * Add a tag to a customer
 */
export function useAddCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      tag,
    }: {
      customerId: string;
      tag: string;
    }) => AddCustomerTag(customerId, tag),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({
          queryKey: ["customer", "profile", variables.customerId],
        });
      }
    },
  });
}

/**
 * Remove a tag from a customer
 */
export function useRemoveCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      tag,
    }: {
      customerId: string;
      tag: string;
    }) => RemoveCustomerTag(customerId, tag),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({
          queryKey: ["customer", "profile", variables.customerId],
        });
      }
    },
  });
}

/**
 * Update customer notes
 */
export function useUpdateCustomerNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      notes,
    }: {
      customerId: string;
      notes: string;
    }) => UpdateCustomerNotes(customerId, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({
        queryKey: ["customer", "profile", variables.customerId],
      });
    },
  });
}

// =============================================================================
// Customer Creation & Duplicate Check Hooks (Phase 2)
// =============================================================================

/**
 * Check if a customer with given phone already exists
 */
export function useCheckCustomerByPhone() {
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (phone: string) => CheckCustomerByPhone(clerkOrgId, phone),
  });
}

/**
 * Create a new customer
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (data: {
      name: string;
      phone: string;
      email?: string;
      address?: string;
      tags?: string[];
      notes?: string;
    }) => CreateCustomer(clerkOrgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/**
 * Bulk add a tag to multiple customers
 */
export function useBulkAddCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerIds,
      tag,
    }: {
      customerIds: string[];
      tag: string;
    }) => BulkAddTagToCustomers(customerIds, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/**
 * Bulk remove a tag from multiple customers
 */
export function useBulkRemoveCustomerTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerIds,
      tag,
    }: {
      customerIds: string[];
      tag: string;
    }) => BulkRemoveTagFromCustomers(customerIds, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

// =============================================================================
// Smart Deduplication Hooks (Phase 3)
// =============================================================================

/**
 * Find duplicate customer groups
 */
export function useFindDuplicateCustomers() {
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: () => FindDuplicateCustomers(clerkOrgId),
  });
}

/**
 * Merge duplicate customers
 */
export function useMergeCustomers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      primaryId,
      duplicateIds,
    }: {
      primaryId: string;
      duplicateIds: string[];
    }) => MergeCustomers(primaryId, duplicateIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/**
 * Delete a customer
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();

  return useMutation({
    mutationFn: (customerId: string) => DeleteCustomer(customerId, clerkOrgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type { Customer, CustomerProfile, CustomerListItem };
