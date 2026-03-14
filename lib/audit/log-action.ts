"use server";

// ============================================================================
// logAuditAction — Standardized audit logging helper (Part D)
//
// Uses the new { field: { old, new } } changes format that the sentence
// builder can parse into human-readable diffs.
//
// Drop-in alongside the existing LogAuditEvent. All NEW logging calls should
// use this function going forward. Existing LogAuditEvent calls still work —
// the sentence engine handles both formats.
//
// NEVER let a logging failure break the main operation.
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogActionParams {
  // What happened
  action: "created" | "updated" | "deleted" | "archived" | "published" | "applied"
    | "completed" | "cancelled" | "voided" | "refunded" | "processed" | "failed"
    | "deactivated" | "activated" | "pin_reset" | "restocked" | "tip_adjusted"
    | (string & {}); // allow custom verbs without losing autocomplete

  // What was affected
  resource_type: string;
  resource_id: string;
  resource_name: string;
  action_category:
    | "menu" | "staff" | "order" | "inventory" | "settings"
    | "authentication" | "device" | "merchant" | "purchase_order" | "expense"
    | (string & {});

  // Severity
  severity?: "info" | "warning" | "critical" | "error";

  // Changes — new standardized format: { field: { old: x, new: y } }
  // For creates: set old to null. For deletes: set new to null.
  changes?: Record<string, { old: unknown; new: unknown }>;

  // Extra metadata (non-PII bag-of-facts)
  metadata?: Record<string, unknown>;

  // Context — if not provided, auto-resolved from Clerk session + cookie
  actor_user_id?: string;
  actor_name?: string;
  actor_email?: string;
  actor_role?: string;
  merchant_id?: string;
  location_id?: string;
  organization_id?: string;
  staff_profile_id?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Writes a single audit log entry using the standardized format.
 * Auto-resolves actor info from Clerk and location from the x-location-id cookie.
 * Swallows all errors — logging must never break the caller.
 */
export async function logAuditAction(params: LogActionParams): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();

    // ── Resolve actor ──────────────────────────────────────────────────────
    let actorUserId = params.actor_user_id;
    let actorName = params.actor_name;
    let actorEmail = params.actor_email;

    if (!actorUserId || !actorName) {
      try {
        const user = await currentUser();
        actorUserId = actorUserId ?? user?.id ?? undefined;
        actorName = actorName ?? user?.fullName ?? user?.firstName ?? "System";
        actorEmail =
          actorEmail ??
          user?.emailAddresses?.[0]?.emailAddress ??
          undefined;
      } catch {
        actorName = actorName ?? "System";
      }
    }

    // ── Resolve merchant ───────────────────────────────────────────────────
    let merchantId = params.merchant_id;
    if (!merchantId) {
      try {
        const { orgId } = await auth();
        if (orgId) {
          const { data: m } = await supabase
            .from("merchants")
            .select("id")
            .eq("clerk_org_id", orgId)
            .single();
          if (m) merchantId = m.id;
        }
      } catch {
        // merchant lookup is best-effort
      }
    }

    // ── Resolve location ───────────────────────────────────────────────────
    let locationId = params.location_id;
    if (locationId === undefined) {
      try {
        const cookieStore = await cookies();
        const cookieVal = cookieStore.get("x-location-id")?.value;
        if (cookieVal && cookieVal !== "all") locationId = cookieVal;
      } catch {
        // cookie read is best-effort
      }
    }
    if (locationId === "all") locationId = undefined;

    // ── Write log ──────────────────────────────────────────────────────────
    await supabase.from("audit_logs").insert({
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id ?? null,
      resource_name: params.resource_name,
      action_category: params.action_category,
      severity: params.severity ?? "info",
      changes: params.changes ?? null,
      metadata: params.metadata ?? null,
      status: "success",
      actor_user_id: actorUserId ?? null,
      actor_name: actorName ?? null,
      actor_email: actorEmail ?? null,
      actor_role: params.actor_role ?? null,
      merchant_id: merchantId ?? null,
      location_id: locationId ?? null,
      organization_id: params.organization_id ?? null,
      staff_profile_id: params.staff_profile_id ?? null,
    });
  } catch (error) {
    // Logging must NEVER crash the main operation
    console.error("[logAuditAction] Failed to write audit log:", error);
  }
}

// ─── Diff Builder ─────────────────────────────────────────────────────────────

/**
 * Computes a { field: { old, new } } diff between two objects.
 * Only includes fields that actually changed.
 * Strips common noise fields (ids, timestamps).
 *
 * Use this in server actions:
 *   const diff = buildDiff(oldRecord, newRecord);
 *   await logAuditAction({ ..., changes: diff });
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options?: { omitKeys?: string[] }
): Record<string, { old: unknown; new: unknown }> {
  const ALWAYS_OMIT = [
    "id", "merchant_id", "location_id", "created_at", "updated_at",
    "deleted_at", "clerk_org_id", "organization_id", "org_id",
  ];
  const omit = new Set([...ALWAYS_OMIT, ...(options?.omitKeys ?? [])]);

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of allKeys) {
    if (omit.has(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }

  return diff;
}

/**
 * Wraps a single field change into the standardized format.
 * Handy for targeted changes (e.g. just a price update).
 *
 * Usage:
 *   changes: fieldChange("price", oldPrice, newPrice)
 */
export function fieldChange(
  field: string,
  oldValue: unknown,
  newValue: unknown
): Record<string, { old: unknown; new: unknown }> {
  return { [field]: { old: oldValue ?? null, new: newValue ?? null } };
}
