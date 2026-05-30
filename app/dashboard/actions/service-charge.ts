"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

export type ServiceChargeAppliesOn = "pre_discount" | "post_discount";

export interface ServiceChargeRule {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  rate_percent: number;
  min_party_size: number;
  applies_to_order_types: string[];
  applies_on: ServiceChargeAppliesOn;
  is_taxable: boolean;
  auto_apply: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceChargeRuleInput {
  id?: string;
  location_id: string | null;
  name: string;
  rate_percent: number;
  min_party_size: number;
  applies_to_order_types: string[];
  applies_on: ServiceChargeAppliesOn;
  auto_apply: boolean;
  is_active: boolean;
}

async function getMerchantId(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export async function GetServiceChargeRules(clerkOrgId: string) {
  if (!clerkOrgId) return { data: [] as ServiceChargeRule[] };

  const supabase = createServerSupabaseClient();
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const { data, error } = await supabase
    .from("service_charge_rules")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("location_id", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("[GetServiceChargeRules]", error);
    return { error: error.message };
  }

  return { data: (data ?? []) as ServiceChargeRule[] };
}

export async function UpsertServiceChargeRule(
  clerkOrgId: string,
  input: ServiceChargeRuleInput,
) {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServerSupabaseClient();
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const payload = {
    merchant_id: merchantId,
    location_id: input.location_id,
    name: input.name,
    rate_percent: input.rate_percent,
    min_party_size: input.min_party_size,
    applies_to_order_types: input.applies_to_order_types,
    applies_on: input.applies_on,
    // v1: server-side lock — service charges are non-taxable.
    is_taxable: false,
    auto_apply: input.auto_apply,
    is_active: input.is_active,
  };

  let before: ServiceChargeRule | null = null;
  if (input.id) {
    const { data: existing } = await supabase
      .from("service_charge_rules")
      .select("*")
      .eq("id", input.id)
      .single();
    before = (existing ?? null) as ServiceChargeRule | null;
  }

  const query = input.id
    ? supabase
        .from("service_charge_rules")
        .update(payload)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
        .select()
        .single()
    : supabase
        .from("service_charge_rules")
        .insert(payload)
        .select()
        .single();

  const { data, error } = await query;

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        error:
          "An active service charge rule already exists for this scope. Disable the existing one first or edit it instead.",
      };
    }
    console.error("[UpsertServiceChargeRule]", error);
    return { error: error.message };
  }

  const saved = data as ServiceChargeRule;

  await LogAuditEvent({
    merchantId,
    locationId: saved.location_id,
    action: input.id
      ? `Updated Service Charge: ${saved.name}`
      : `Created Service Charge: ${saved.name}`,
    actionCategory: "settings",
    resourceType: "service_charge_rule",
    resourceId: saved.id,
    resourceName: saved.name,
    changes: {
      before: before
        ? (before as unknown as Record<string, unknown>)
        : undefined,
      after: saved as unknown as Record<string, unknown>,
    },
  });

  return { data: saved };
}

export async function DeleteServiceChargeRule(
  clerkOrgId: string,
  ruleId: string,
) {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!ruleId) return { error: "Rule ID is required" };

  const supabase = createServerSupabaseClient();
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const { data: existing } = await supabase
    .from("service_charge_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("merchant_id", merchantId)
    .single();

  const before = (existing ?? null) as ServiceChargeRule | null;

  const { data, error } = await supabase
    .from("service_charge_rules")
    .update({ is_active: false })
    .eq("id", ruleId)
    .eq("merchant_id", merchantId)
    .select()
    .single();

  if (error) {
    console.error("[DeleteServiceChargeRule]", error);
    return { error: error.message };
  }

  const saved = data as ServiceChargeRule;

  await LogAuditEvent({
    merchantId,
    locationId: saved.location_id,
    action: `Disabled Service Charge: ${saved.name}`,
    actionCategory: "settings",
    resourceType: "service_charge_rule",
    resourceId: saved.id,
    resourceName: saved.name,
    changes: {
      before: before
        ? (before as unknown as Record<string, unknown>)
        : undefined,
      after: saved as unknown as Record<string, unknown>,
    },
  });

  return { data: saved };
}
