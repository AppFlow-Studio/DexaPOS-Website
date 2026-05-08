"use server";

// =============================================================================
// Impersonation audit — server actions for /manage/audit-logs/impersonation.
// =============================================================================
// Read-only listing of impersonation_sessions joined with their per-action
// audit_logs rows. Required for SOC2 evidence and merchant disputes.
// =============================================================================

import { createClerkClient } from "@clerk/backend";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/auth";

export interface ImpersonationSessionRow {
  id: string;
  hq_user_id: string;
  hq_user_name: string | null;
  hq_user_email: string | null;
  target_merchant_id: string;
  target_merchant_name: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  action_count: number;
}

export interface ListImpersonationSessionsFilters {
  merchantId?: string;
  hqUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  endReason?: string;
}

export async function ListImpersonationSessions(
  filters: ListImpersonationSessionsFilters = {},
  limit = 100,
  offset = 0,
): Promise<{ data?: ImpersonationSessionRow[]; total?: number; error?: string }> {
  // Page is gated by audit.view at the layout level; assert here too as
  // defense-in-depth for direct action calls.
  await requireAdminAuth("system.audit.view");

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("impersonation_sessions")
    .select(
      `
      id,
      hq_user_id,
      target_merchant_id,
      started_at,
      ended_at,
      end_reason,
      reason,
      ip_address,
      user_agent,
      target_merchant:merchants!impersonation_sessions_target_merchant_id_fkey(name)
    `,
      { count: "exact" },
    )
    .order("started_at", { ascending: false });

  if (filters.merchantId) {
    query = query.eq("target_merchant_id", filters.merchantId);
  }
  if (filters.hqUserId) {
    query = query.eq("hq_user_id", filters.hqUserId);
  }
  if (filters.endReason) {
    query = query.eq("end_reason", filters.endReason);
  }
  if (filters.dateFrom) {
    query = query.gte("started_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("started_at", filters.dateTo);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return { error: error.message };

  const ids = (data ?? []).map((r) => r.id);
  let countsBySession = new Map<string, number>();
  if (ids.length > 0) {
    // Per-session action count (start/end rows + every audited action inside).
    const { data: counts } = await supabase
      .from("audit_logs")
      .select("impersonation_session_id")
      .in("impersonation_session_id", ids);
    countsBySession = (counts ?? []).reduce((acc, row) => {
      const key = row.impersonation_session_id as string;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  // Resolve HQ user IDs (Clerk) → human-readable name/email.
  const uniqueHqIds = Array.from(
    new Set((data ?? []).map((r: any) => r.hq_user_id).filter(Boolean)),
  );
  const hqUsersById = new Map<string, { name: string | null; email: string | null }>();
  if (uniqueHqIds.length > 0) {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    await Promise.all(
      uniqueHqIds.map(async (id) => {
        try {
          const u = await clerk.users.getUser(id);
          const email =
            u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
            u.emailAddresses[0]?.emailAddress ??
            null;
          const name =
            [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
            u.username ||
            null;
          hqUsersById.set(id, { name, email });
        } catch {
          hqUsersById.set(id, { name: null, email: null });
        }
      }),
    );
  }

  const rows: ImpersonationSessionRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    hq_user_id: r.hq_user_id,
    hq_user_name: hqUsersById.get(r.hq_user_id)?.name ?? null,
    hq_user_email: hqUsersById.get(r.hq_user_id)?.email ?? null,
    target_merchant_id: r.target_merchant_id,
    target_merchant_name: r.target_merchant?.name ?? null,
    started_at: r.started_at,
    ended_at: r.ended_at,
    end_reason: r.end_reason,
    reason: r.reason,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    action_count: countsBySession.get(r.id) ?? 0,
  }));

  return { data: rows, total: count ?? 0 };
}
