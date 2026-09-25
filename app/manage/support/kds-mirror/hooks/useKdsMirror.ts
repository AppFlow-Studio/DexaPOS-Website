"use client";

import { useQuery } from "@tanstack/react-query";
import {
  hqGetKdsBoardMirror,
  hqGetKdsRoutingHealth,
  hqGetKdsSendLedger,
  hqGetKdsUnsentItems,
  hqGetLocationKdsDisplays,
  hqGetSupportMerchantById,
  hqGetSupportMerchantLocations,
  hqSearchSupportMerchants,
  type KdsDisplaySummary,
  type KdsMirrorTicket,
  type KdsRoutingHealth,
  type KdsSendLedgerEntry,
  type KdsUnsentOrder,
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
 * failure modes under investigation, is not a hypothetical. While push is
 * live the poll is only a slow safety net.
 */
const MIRROR_POLL_MS = 5_000;
const MIRROR_POLL_PUSH_LIVE_MS = 30_000;

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
  health: (locationId: string) =>
    ["hq-kds-mirror", "health", locationId] as const,
  sendLedger: (
    locationId: string,
    fromIso: string,
    toIso: string,
    orderId: string | null
  ) =>
    [
      "hq-kds-mirror",
      "send-ledger",
      locationId,
      fromIso,
      toIso,
      orderId ?? "none",
    ] as const,
  unsent: (
    locationId: string,
    fromIso: string,
    toIso: string,
    orderId: string | null
  ) =>
    [
      "hq-kds-mirror",
      "unsent",
      locationId,
      fromIso,
      toIso,
      orderId ?? "none",
    ] as const,
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
  options?: { enabled?: boolean; pushLive?: boolean }
) {
  const enabled = Boolean(locationId) && options?.enabled !== false;
  const pollMs = options?.pushLive ? MIRROR_POLL_PUSH_LIVE_MS : MIRROR_POLL_MS;

  return useQuery<KdsMirrorTicket[]>({
    queryKey: kdsMirrorKeys.board(locationId ?? "", kdsDisplayId),
    queryFn: async () =>
      (await hqGetKdsBoardMirror(locationId!, kdsDisplayId).then(unwrap)) ?? [],
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? pollMs : false,
    refetchOnWindowFocus: true,
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

/**
 * The send-attempt ledger for one location.
 *
 * Location-scoped (not display-scoped): a send is a POS action, recorded once
 * per call, and the routing decisions inside it tell us which displays were
 * involved. `orderId` narrows the query to one order when the page is
 * deep-linked from a specific ticket.
 *
 * The window bounds are part of the query key, so changing the window refetches
 * rather than re-filtering stale data.
 */
export function useKdsSendLedger(
  locationId: string | null,
  fromIso: string,
  toIso: string,
  orderId?: string | null
) {
  return useQuery<KdsSendLedgerEntry[]>({
    queryKey: kdsMirrorKeys.sendLedger(
      locationId ?? "",
      fromIso,
      toIso,
      orderId ?? null
    ),
    queryFn: async () =>
      (await hqGetKdsSendLedger(
        locationId!,
        fromIso,
        toIso,
        orderId ?? null
      ).then(unwrap)) ?? [],
    enabled: Boolean(locationId),
    staleTime: 15 * 1000,
  });
}

/**
 * Orders with items that never fired to the kitchen, location-scoped.
 *
 * Same key/refresh model as the send ledger: window bounds are part of the
 * query key and the shared Refresh button re-anchors them through the
 * component's imperative handle.
 */
export function useKdsUnsentItems(
  locationId: string | null,
  fromIso: string,
  toIso: string,
  orderId?: string | null
) {
  return useQuery<KdsUnsentOrder[]>({
    queryKey: kdsMirrorKeys.unsent(
      locationId ?? "",
      fromIso,
      toIso,
      orderId ?? null
    ),
    queryFn: async () =>
      (await hqGetKdsUnsentItems(
        locationId!,
        fromIso,
        toIso,
        orderId ?? null
      ).then(unwrap)) ?? [],
    enabled: Boolean(locationId),
    staleTime: 15 * 1000,
  });
}
