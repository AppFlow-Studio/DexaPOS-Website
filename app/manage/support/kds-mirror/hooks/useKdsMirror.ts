"use client";

import { useQuery } from "@tanstack/react-query";
import {
  hqGetKdsBoardMirror,
  hqGetKdsBoardSnapshot,
  hqGetKdsBoardSnapshots,
  hqGetKdsRoutingHealth,
  hqGetLocationKdsDisplays,
  hqGetSupportMerchantById,
  hqGetSupportMerchantLocations,
  hqSearchSupportMerchants,
  type KdsBoardSnapshotDetail,
  type KdsBoardSnapshotIndexEntry,
  type KdsDisplaySummary,
  type KdsMirrorTicket,
  type KdsRoutingHealth,
  type SupportLocationOption,
  type SupportMerchantOption,
} from "@/app/manage/actions/kds-mirror";

/**
 * Polling backstop for the live board.
 *
 * The authoritative liveness signal is the `location:<id>:orders` broadcast
 * (see useKdsMirrorRealtime). kds_item_status is not in the realtime
 * publication, so there is no table-level change feed to subscribe to and the
 * order broadcast is the only push we get. This interval covers the gap when
 * the socket is down -- which, given that a dropped socket is one of the
 * failure modes under investigation, is not a hypothetical.
 */
const MIRROR_POLL_MS = 5_000;

export const kdsMirrorKeys = {
  merchantSearch: (query: string) =>
    ["hq-kds-mirror", "merchant-search", query] as const,
  merchant: (merchantId: string | null) =>
    ["hq-kds-mirror", "merchant", merchantId ?? "none"] as const,
  locations: (merchantId: string) =>
    ["hq-kds-mirror", "locations", merchantId] as const,
  displays: (locationId: string) =>
    ["hq-kds-mirror", "displays", locationId] as const,
  board: (locationId: string, displayId: string | null) =>
    ["hq-kds-mirror", "board", locationId, displayId ?? "all"] as const,
  snapshots: (displayId: string, fromIso: string, toIso: string) =>
    ["hq-kds-mirror", "snapshots", displayId, fromIso, toIso] as const,
  snapshot: (snapshotId: string | null) =>
    ["hq-kds-mirror", "snapshot", snapshotId ?? "none"] as const,
  health: (locationId: string) =>
    ["hq-kds-mirror", "health", locationId] as const,
};

function unwrap<T>(result: {
  success: boolean;
  error: string | null;
  data: T | null;
}): T | null {
  if (!result.success) {
    throw new Error(result.error ?? "Request failed");
  }
  return result.data;
}

/**
 * Server-side merchant search. Capped and query-driven rather than fetching
 * every merchant on the platform, which does not survive a few hundred
 * tenants. `placeholderData` keeps the previous page visible while a new
 * keystroke is in flight so the list does not blank out mid-type.
 */
export function useSupportMerchantSearch(query: string) {
  return useQuery<SupportMerchantOption[]>({
    queryKey: kdsMirrorKeys.merchantSearch(query),
    queryFn: async () =>
      (await hqSearchSupportMerchants(query).then(unwrap)) ?? [],
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

/** Labels the current selection even when it is outside the search results. */
export function useSupportMerchant(merchantId: string | null) {
  return useQuery<SupportMerchantOption | null>({
    queryKey: kdsMirrorKeys.merchant(merchantId),
    queryFn: async () => await hqGetSupportMerchantById(merchantId!).then(unwrap),
    enabled: Boolean(merchantId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSupportLocations(merchantId: string | null) {
  return useQuery<SupportLocationOption[]>({
    queryKey: kdsMirrorKeys.locations(merchantId ?? ""),
    queryFn: async () =>
      (await hqGetSupportMerchantLocations(merchantId!).then(unwrap)) ?? [],
    enabled: Boolean(merchantId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useKdsDisplays(locationId: string | null) {
  return useQuery<KdsDisplaySummary[]>({
    queryKey: kdsMirrorKeys.displays(locationId ?? ""),
    queryFn: async () =>
      (await hqGetLocationKdsDisplays(locationId!).then(unwrap)) ?? [],
    enabled: Boolean(locationId),
    staleTime: 60 * 1000,
  });
}

/**
 * The live station board.
 *
 * `refetchOnWindowFocus` matters here more than usual: support staff tab away
 * to read a ticket and come back expecting the board to be current.
 */
export function useKdsMirror(
  locationId: string | null,
  kdsDisplayId: string | null,
  options?: { enabled?: boolean }
) {
  const enabled = Boolean(locationId) && options?.enabled !== false;

  return useQuery<KdsMirrorTicket[]>({
    queryKey: kdsMirrorKeys.board(locationId ?? "", kdsDisplayId),
    queryFn: async () =>
      (await hqGetKdsBoardMirror(locationId!, kdsDisplayId).then(unwrap)) ?? [],
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? MIRROR_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
}

export function useKdsMirrorSnapshots(
  kdsDisplayId: string | null,
  fromIso: string,
  toIso: string,
  options?: { enabled?: boolean }
) {
  return useQuery<KdsBoardSnapshotIndexEntry[]>({
    queryKey: kdsMirrorKeys.snapshots(kdsDisplayId ?? "", fromIso, toIso),
    queryFn: async () =>
      (await hqGetKdsBoardSnapshots(kdsDisplayId!, fromIso, toIso).then(
        unwrap
      )) ?? [],
    enabled: Boolean(kdsDisplayId) && options?.enabled !== false,
    staleTime: 15 * 1000,
  });
}

export function useKdsBoardSnapshot(snapshotId: string | null) {
  return useQuery<KdsBoardSnapshotDetail | null>({
    queryKey: kdsMirrorKeys.snapshot(snapshotId),
    queryFn: async () => await hqGetKdsBoardSnapshot(snapshotId!).then(unwrap),
    enabled: Boolean(snapshotId),
    // Snapshots are append-only and never change once written.
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });
}

export function useKdsRoutingHealth(locationId: string | null) {
  return useQuery<KdsRoutingHealth | null>({
    queryKey: kdsMirrorKeys.health(locationId ?? ""),
    queryFn: async () => await hqGetKdsRoutingHealth(locationId!).then(unwrap),
    enabled: Boolean(locationId),
    staleTime: 60 * 1000,
  });
}
