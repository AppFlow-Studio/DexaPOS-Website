"use client";

import { useQuery } from "@tanstack/react-query";
import { GetAuditLogs } from "../actions/audit-logs";
import { useClerkOrgId } from "./useLocationScoped";
import { AuditLogFilters } from "@/types/audit-log";

export function useAuditLogs(
  filters?: AuditLogFilters,
  limit: number = 50,
  offset: number = 0
) {
  const clerkOrgId = useClerkOrgId();

  return useQuery({
    queryKey: ["audit-logs", clerkOrgId, filters, limit, offset],
    queryFn: () => {
      if (!clerkOrgId) return { data: [], total: 0 };
      return GetAuditLogs(clerkOrgId, filters, limit, offset);
    },
    enabled: !!clerkOrgId,
  });
}
