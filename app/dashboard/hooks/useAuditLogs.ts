"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { GetAuditLogs } from "../actions/audit-logs";
import { useClerkOrgId } from "./useLocationScoped";
import { AuditLogFilters } from "@/types/audit-log";

export function useAuditLogs(
  filters?: AuditLogFilters,
  limit: number = 50,
  offset: number = 0,
  orgIdOverride?: string
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;

  return useQuery({
    queryKey: ["audit-logs", clerkOrgId, filters, limit, offset],
    queryFn: () => {
      if (!clerkOrgId) return { data: [], total: 0 };
      return GetAuditLogs(clerkOrgId, filters, limit, offset);
    },
    enabled: !!clerkOrgId,
    // Changing a tab, filter or page builds a new query key. Without this the
    // cache is empty for that key, so the page drops to a full skeleton and
    // has no idea how many rows are coming. Keeping the previous result means
    // the current entries stay on screen during the fetch and the skeleton —
    // when one is needed at all — can size itself to the real count.
    placeholderData: keepPreviousData,
  });
}
