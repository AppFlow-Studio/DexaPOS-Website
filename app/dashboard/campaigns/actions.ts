"use server";

import { getEffectiveMerchantContext } from "@/lib/admin/merchant-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildPaginationMeta, normalizePagination } from "@/lib/pagination";
import type { PaginatedResult } from "@/types/pagination";
import type { Campaign, Message, MessageFilters } from "./types";

// Restrict search to literal text; PostgREST filter syntax must not be accepted
// from a search box. Keep '+' for international phone numbers.
function searchText(value = "") {
  return value.slice(0, 120).replace(/[^\p{L}\p{N}\s+@.\-]/gu, " ").trim();
}

export async function getCampaigns(
  clerkOrgId: string,
  options: { page?: number; search?: string } = {},
): Promise<PaginatedResult<Campaign>> {
  const { merchantId } = await getEffectiveMerchantContext(clerkOrgId);
  // Use the caller's JWT so RLS remains in force, including during HQ viewing.
  const supabase = createServerSupabaseClient();
  const pagination = normalizePagination({ page: options.page, pageSize: 25 });
  let query = supabase.from("marketing_campaigns")
    .select("id,name,campaign_type,status,body,subject,created_at,scheduled_for,total_recipients", { count: "exact" })
    .eq("merchant_id", merchantId);
  const search = searchText(options.search);
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, count, error } = await query
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.pageSize - 1);
  if (error) throw new Error("Unable to load campaigns. Please try again.");
  return { data: (data ?? []) as Campaign[], pagination: buildPaginationMeta(count ?? 0, pagination) };
}

export async function getMessages(
  clerkOrgId: string,
  filters: MessageFilters = {},
): Promise<PaginatedResult<Message>> {
  const { merchantId } = await getEffectiveMerchantContext(clerkOrgId);
  const supabase = createServerSupabaseClient();
  const pagination = normalizePagination({ page: filters.page, pageSize: 25 });
  let query = supabase.from("message_log")
    .select("id,body,campaign_id,channel,cost,created_at,direction,error_code,from_number,messaging_profile_id,occurred_at,status,telnyx_message_id,to_number,updated_at", { count: "exact" })
    .eq("merchant_id", merchantId)
    .eq("channel", "sms");
  if (filters.direction && filters.direction !== "all") {
    if (!["inbound", "outbound"].includes(filters.direction)) throw new Error("Invalid direction.");
    query = query.eq("direction", filters.direction);
  }
  if (filters.status && filters.status !== "all") {
    if (!["sent", "delivered", "failed", "received", "queued", "sending", "pending"].includes(filters.status)) {
      throw new Error("Invalid message status.");
    }
    query = query.eq("status", filters.status);
  }
  if (filters.campaignId) {
    if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(filters.campaignId)) throw new Error("Invalid campaign.");
    query = query.eq("campaign_id", filters.campaignId);
  }
  if (filters.days) {
    if (![1, 7, 30].includes(filters.days)) throw new Error("Invalid date range.");
    query = query.gte("created_at", new Date(Date.now() - filters.days * 86_400_000).toISOString());
  }
  const search = searchText(filters.search);
  if (search) query = query.or(`to_number.ilike.%${search}%,from_number.ilike.%${search}%,body.ilike.%${search}%`);
  const { data, count, error } = await query
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.pageSize - 1);
  if (error) throw new Error("Unable to load SMS messages. Please try again.");
  return { data: (data ?? []) as Message[], pagination: buildPaginationMeta(count ?? 0, pagination) };
}
