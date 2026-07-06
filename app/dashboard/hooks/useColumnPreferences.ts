"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VisibilityState } from "@tanstack/react-table";
import {
  GetUserUiPreference,
  SetUserUiPreference,
  type UserUiPreferenceKey,
} from "@/app/dashboard/actions/user-ui-preferences";

/**
 * Per-user column-visibility persistence, backed by public.user_ui_preferences so
 * the choice follows the user across devices. localStorage is used as an instant
 * paint cache (first render reflects the last-known layout before the DB round-trip)
 * and as an offline fallback; the DB is the source of truth once loaded.
 */
export function useColumnPreferences(
  prefKey: UserUiPreferenceKey,
  localStorageKey: string
) {
  const queryClient = useQueryClient();

  // Instant, synchronous read of the cached layout (SSR-safe).
  const readLocal = useCallback((): VisibilityState => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(localStorageKey);
      return raw ? (JSON.parse(raw) as VisibilityState) : {};
    } catch {
      return {};
    }
  }, [localStorageKey]);

  const writeLocal = useCallback(
    (value: VisibilityState) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(value));
      } catch {
        /* ignore quota / disabled storage */
      }
    },
    [localStorageKey]
  );

  const query = useQuery({
    queryKey: ["user-ui-pref", prefKey],
    queryFn: async (): Promise<VisibilityState> => {
      const res = await GetUserUiPreference<VisibilityState>(prefKey);
      // Fall back to the local cache if the user has no saved DB pref yet.
      return res.data ?? readLocal();
    },
    // Seed from localStorage so the first paint isn't empty while the DB loads.
    initialData: readLocal,
    staleTime: 60_000,
  });

  // Mirror the resolved DB value back into the local cache for the next cold start.
  useEffect(() => {
    if (query.data) writeLocal(query.data);
  }, [query.data, writeLocal]);

  const mutation = useMutation({
    mutationFn: async (value: VisibilityState) => {
      writeLocal(value); // optimistic local write (survives offline)
      const res = await SetUserUiPreference(prefKey, value);
      if (!res.success) throw new Error(res.error ?? "Failed to save preference");
      return value;
    },
    onMutate: (value) => {
      queryClient.setQueryData(["user-ui-pref", prefKey], value);
    },
  });

  const setVisibility = useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      const prev =
        queryClient.getQueryData<VisibilityState>(["user-ui-pref", prefKey]) ??
        readLocal();
      const next =
        typeof updater === "function"
          ? (updater as (p: VisibilityState) => VisibilityState)(prev)
          : updater;
      mutation.mutate(next);
    },
    [mutation, queryClient, prefKey, readLocal]
  );

  return {
    columnVisibility: query.data ?? {},
    setColumnVisibility: setVisibility,
  };
}
