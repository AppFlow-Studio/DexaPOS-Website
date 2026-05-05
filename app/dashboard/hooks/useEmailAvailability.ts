"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { checkInviteEmail, type CheckInviteEmailResult } from "@/app/dashboard/actions/check-invite-email";
import { isValidEmail, normalizeEmail } from "@/lib/utils/email";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface UseEmailAvailabilityOptions {
  /** Pass the merchant's Clerk org id to scope the check; omit for HQ (global). */
  clerkOrgId?: string | null;
  /** Disable the check entirely (e.g. when the field is hidden). */
  enabled?: boolean;
  /** Debounce window in ms (default 400). */
  debounceMs?: number;
}

export interface UseEmailAvailabilityResult {
  isChecking: boolean;
  hasConflict: boolean;
  message: string | null;
  isAvailable: boolean;
  /** True only once a non-empty, syntactically-valid email has been entered. */
  isCheckable: boolean;
}

/**
 * Live email-availability check for invite/create forms.
 * Shape of the returned status maps directly to inline UI:
 *   isChecking → "Checking…"
 *   hasConflict → red `message`
 *   isAvailable → green "Available"
 */
export function useEmailAvailability(
  email: string,
  opts: UseEmailAvailabilityOptions = {},
): UseEmailAvailabilityResult {
  const { clerkOrgId = null, enabled = true, debounceMs = 400 } = opts;
  const normalized = normalizeEmail(email);
  const debounced = useDebouncedValue(normalized, debounceMs);
  const isCheckable = isValidEmail(debounced);

  const query = useQuery<CheckInviteEmailResult>({
    queryKey: ["email-availability", debounced, clerkOrgId ?? "global"],
    queryFn: () => checkInviteEmail(debounced, clerkOrgId ?? undefined),
    enabled: enabled && isCheckable,
    staleTime: 30_000,
    retry: false,
  });

  // Treat the still-debouncing window as "checking" so the UI doesn't flash
  // "Available" for an email that hasn't been validated yet.
  const isDebouncing = isValidEmail(normalized) && normalized !== debounced;
  const isChecking = enabled && (isDebouncing || (isCheckable && query.isFetching));
  const data = query.data;
  const hasConflict = !!data && !data.ok;

  return {
    isChecking,
    hasConflict,
    message: hasConflict ? data?.message ?? "Email unavailable" : null,
    isAvailable: !!data && data.ok && !isChecking,
    isCheckable: isValidEmail(normalized),
  };
}
