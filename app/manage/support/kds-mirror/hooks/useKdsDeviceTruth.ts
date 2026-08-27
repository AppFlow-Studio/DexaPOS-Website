"use client";

import { useQuery } from "@tanstack/react-query";
import {
  hqGetKdsDeviceTruthForOrder,
  hqGetKdsDeviceTruthHealth,
  hqGetKdsDisplayTruthWindow,
  type KdsDeviceTruthHealthRow,
  type KdsDeviceTruthOrder,
  type KdsDisplayTruthWindow,
} from "@/app/manage/actions/kds-device-truth";

/**
 * Merchant / location / display picker hooks are shared with the mirror page
 * (same RPCs, same tenancy gates). Only the device-truth data hooks live here.
 */

export const kdsDeviceTruthKeys = {
  health: (locationId: string) =>
    ["hq-kds-device-truth", "health", locationId] as const,
  window: (displayId: string, fromIso: string, toIso: string) =>
    ["hq-kds-device-truth", "window", displayId, fromIso, toIso] as const,
  order: (orderId: string) =>
    ["hq-kds-device-truth", "order", orderId] as const,
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
 * Rolling seven-day per-display health for a location. The window bounds are
 * part of the query key; changing the window refetches rather than re-filtering
 * stale data.
 */
export function useKdsDeviceTruthHealth(locationId: string | null) {
  return useQuery<KdsDeviceTruthHealthRow[]>({
    queryKey: kdsDeviceTruthKeys.health(locationId ?? ""),
    queryFn: async () =>
      (await hqGetKdsDeviceTruthHealth(locationId!).then(unwrap)) ?? [],
    enabled: Boolean(locationId),
    staleTime: 60 * 1000,
  });
}

/**
 * The routed-vs-seen window for one display: per-item verdicts, the raw
 * device-event timeline, and snapshot metadata. Append-only data, so a modest
 * staleTime is safe.
 *
 * `placeholderData` is deliberately GATED on the display being unchanged:
 * React Query passes the previous query's data as a placeholder when the query
 * key changes, so a display switch (A -> B) would otherwise keep showing
 * display A's lane while B loads — which reads as "the selection did nothing".
 * The previous window is only kept on screen while the SAME display refetches
 * (a window change, or a poll).
 */
export function useKdsDeviceTruthWindow(
  kdsDisplayId: string | null,
  fromIso: string,
  toIso: string,
  options?: { enabled?: boolean }
) {
  const enabled = Boolean(kdsDisplayId) && options?.enabled !== false;

  return useQuery<KdsDisplayTruthWindow | null>({
    queryKey: kdsDeviceTruthKeys.window(kdsDisplayId ?? "", fromIso, toIso),
    queryFn: async () =>
      await hqGetKdsDisplayTruthWindow(kdsDisplayId!, fromIso, toIso).then(
        unwrap
      ),
    enabled,
    staleTime: 15 * 1000,
    placeholderData: (previous, previousQuery) => {
      const previousDisplay = (previousQuery?.queryKey as unknown[] | undefined)?.[2];
      return previousDisplay === kdsDisplayId ? previous : undefined;
    },
  });
}

/** Per-order routed-vs-seen diff, for the order sheet's Device view tab. */
export function useKdsDeviceTruthForOrder(orderId: string | null) {
  return useQuery<KdsDeviceTruthOrder | null>({
    queryKey: kdsDeviceTruthKeys.order(orderId ?? ""),
    queryFn: async () =>
      await hqGetKdsDeviceTruthForOrder(orderId!).then(unwrap),
    enabled: Boolean(orderId),
    staleTime: 30 * 1000,
  });
}
