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
  GetCustomerSpendTrend,
  GetCustomerVisitPattern,
  GetCustomerTopItems,
  GetCustomerChannelTrend,
  GetCustomerActivityTimeline,
  GetCustomerPercentile,
  GetCustomerPercentileByClerkOrgId,
  GetCustomerVisitTrend,
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
  return (
    userInfo?.members?.[0]?.organizations?.clerk_org_id ||
    userInfo?.members?.[0]?.organizations?.merchants?.clerk_org_id ||
    ""
  );
}

// =============================================================================
// Customer List Hooks
// =============================================================================

/**
 * Fetch all customers for the current merchant, optionally filtered by location
 */
export function useCustomers(options?: {
  limit?: number;
  offset?: number;
  orderBy?: "last_order_date" | "lifetime_spend" | "visits" | "created_at";
  ascending?: boolean;
  locationId?: string;
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
    onSuccess: async (result, variables) => {
      if (result.success) {
        // Invalidate and refetch both queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["customers"], refetchType: "active" }),
          queryClient.invalidateQueries({
            queryKey: ["customer", "profile", variables.customerId],
            refetchType: "active",
          }),
        ]);
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
    onSuccess: async (result, variables) => {
      if (result.success) {
        // Invalidate and refetch both queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["customers"], refetchType: "active" }),
          queryClient.invalidateQueries({
            queryKey: ["customer", "profile", variables.customerId],
            refetchType: "active",
          }),
        ]);
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
      birthday?: string;
      anniversary?: string;
      company_name?: string;
      vip_level?: string;
      preferred_seating?: string;
      dietary_preferences?: string[];
      allergy_notes?: string;
      preferred_table?: string;
      preferred_language?: string;
      email_opt_in?: boolean;
      sms_opt_in?: boolean;
      receipt_via_email?: boolean;
      receipt_via_sms?: boolean;
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
// DEXA-CUST-002: Enhanced Overview Analytics Hooks
// =============================================================================

/**
 * Get customer spend trend over last 6 months
 */
export function useCustomerSpendTrend(customerId: string | null, months: number = 6) {
  return useQuery({
    queryKey: ["customer", "spend-trend", customerId, months],
    queryFn: () => (customerId ? GetCustomerSpendTrend(customerId, months) : null),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get customer visit pattern
 */
export function useCustomerVisitPattern(customerId: string | null, days: number = 90) {
  return useQuery({
    queryKey: ["customer", "visit-pattern", customerId, days],
    queryFn: () => (customerId ? GetCustomerVisitPattern(customerId, days) : null),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get customer top items
 */
export function useCustomerTopItems(
  customerId: string | null,
  days: number = 90,
  limit: number = 10,
) {
  return useQuery({
    queryKey: ["customer", "top-items", customerId, days, limit],
    queryFn: () =>
      customerId ? GetCustomerTopItems(customerId, days, limit) : null,
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get customer channel trend
 */
export function useCustomerChannelTrend(customerId: string | null, days: number = 90) {
  return useQuery({
    queryKey: ["customer", "channel-trend", customerId, days],
    queryFn: () => (customerId ? GetCustomerChannelTrend(customerId, days) : null),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get customer activity timeline
 */
export function useCustomerActivityTimeline(
  customerId: string | null,
  limit: number = 50,
) {
  return useQuery({
    queryKey: ["customer", "activity-timeline", customerId, limit],
    queryFn: () =>
      customerId ? GetCustomerActivityTimeline(customerId, limit) : null,
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get customer percentile rank
 * @param customerId Customer UUID
 * @param merchantId Merchant UUID (not Clerk org ID)
 */
export function useCustomerPercentile(
  customerId: string | null,
  merchantId: string | null,
) {
  return useQuery({
    queryKey: ["customer", "percentile", customerId, merchantId],
    queryFn: () =>
      customerId && merchantId
        ? GetCustomerPercentile(customerId, merchantId)
        : null,
    enabled: !!customerId && !!merchantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Get customer percentile rank using Clerk org ID
 * Automatically converts Clerk org ID to merchant UUID
 * @param customerId Customer UUID
 * @param clerkOrgId Clerk organization ID (org_*)
 */
export function useCustomerPercentileWithClerkOrgId(
  customerId: string | null,
  clerkOrgId: string | null,
) {
  return useQuery({
    queryKey: ["customer", "percentile", customerId, clerkOrgId],
    queryFn: () =>
      customerId && clerkOrgId
        ? GetCustomerPercentileByClerkOrgId(customerId, clerkOrgId)
        : null,
    enabled: !!customerId && !!clerkOrgId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Get customer visit frequency trend
 */
export function useCustomerVisitTrend(
  customerId: string | null,
  recentDays: number = 90,
  compareDays: number = 90,
) {
  return useQuery({
    queryKey: ["customer", "visit-trend", customerId, recentDays, compareDays],
    queryFn: () =>
      customerId
        ? GetCustomerVisitTrend(customerId, recentDays, compareDays)
        : null,
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type { Customer, CustomerProfile, CustomerListItem };
