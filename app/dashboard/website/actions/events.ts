"use server";

import { revalidatePath } from "next/cache";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import type { ActionResult } from "@/lib/site-builder/db-types";
import { eventInputSchema, eventSlug, type EventInput } from "@/lib/site-builder/events/event";
import { loadEvents, type RenderEvent } from "@/lib/site-builder/events/event-map";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Events — first-class records, brand-scoped, optionally about one location.
 *
 * Authorization is RLS (`is_merchant_admin`); these actions resolve the site to
 * scope a query, and the database refuses anything cross-tenant.
 */

async function resolveSite(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<{ siteId?: string; merchantId?: string }> {
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (!merchant) return {};

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("id")
    .eq("merchant_id", merchant.id as string)
    .maybeSingle();
  if (!site) return { merchantId: merchant.id as string };

  return { siteId: site.id as string, merchantId: merchant.id as string };
}

export async function ListEvents(clerkOrgId: string): Promise<ActionResult<RenderEvent[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { siteId } = await resolveSite(supabase, clerkOrgId);
  if (!siteId) return { error: "This merchant has no website yet", code: "site_not_found" };

  return { data: await loadEvents(supabase, siteId) };
}

/**
 * Creates an event.
 *
 * The slug is derived here rather than asked for: a merchant naming their
 * trivia night should not also have to invent a URL for it. Collisions get a
 * short suffix, because "Trivia Night" every January must not fight last
 * year's for the same address.
 */
export async function CreateEvent(
  clerkOrgId: string,
  input: EventInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: messageFor(issue), code: "invalid_document" };
  }

  const supabase = createServerSupabaseClient();
  const { siteId } = await resolveSite(supabase, clerkOrgId);
  if (!siteId) return { error: "Create your website first", code: "site_not_found" };

  const slug = await uniqueSlug(supabase, siteId, eventSlug(parsed.data.name));

  const { data, error } = await supabase
    .from("site_events")
    .insert({ site_id: siteId, slug, ...toRow(parsed.data) })
    .select("id, slug")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create the event", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId: parsed.data.locationId,
    action: "created_website_event",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_event",
    resourceId: data.id as string,
    resourceName: parsed.data.name,
  });

  revalidatePath("/dashboard/website/events");
  return { data: { id: String(data.id), slug: String(data.slug) } };
}

export async function UpdateEvent(
  clerkOrgId: string,
  eventId: string,
  input: EventInput,
): Promise<ActionResult<{ id: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: messageFor(parsed.error.issues[0]), code: "invalid_document" };
  }

  const supabase = createServerSupabaseClient();

  // The slug is deliberately NOT recomputed on rename. Its address may already
  // be on a poster, in an email, or shared to a hundred people — quietly moving
  // it because the merchant fixed a typo in the title would break every one of
  // those links for a cosmetic edit.
  const { error } = await supabase
    .from("site_events")
    .update(toRow(parsed.data))
    .eq("id", eventId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId: parsed.data.locationId,
    action: "updated_website_event",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_event",
    resourceId: eventId,
    resourceName: parsed.data.name,
  });

  revalidatePath("/dashboard/website", "layout");
  return { data: { id: eventId } };
}

/**
 * Removes an event from the site.
 *
 * Soft, so the record of what a restaurant has run survives — and because a
 * hard delete would be blocked anyway: `photo_asset_id` is `ON DELETE RESTRICT`
 * against the asset library, on purpose.
 */
export async function ArchiveEvent(
  clerkOrgId: string,
  eventId: string,
): Promise<ActionResult<{ archived: true }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("site_events")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: "archived_website_event",
    actionCategory: "website",
    severity: "warning",
    resourceType: "site_event",
    resourceId: eventId,
    resourceName: "Event",
  });

  revalidatePath("/dashboard/website", "layout");
  return { data: { archived: true } };
}

function toRow(input: EventInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    photo_asset_id: input.photoAssetId,
    location_id: input.locationId,
    start_date: input.startDate,
    start_time: input.startTime,
    end_time: input.endTime,
    repeat: input.repeat,
    ticket_url: input.ticketUrl ?? null,
  };
}

/**
 * A slug nobody else on this site is using.
 *
 * Reads then writes, which is a race — but the unique index is what actually
 * enforces it, and the failure mode of losing that race is a duplicate-key
 * error on a manual action the merchant can simply retry. Worth far less than
 * the complexity of an advisory lock.
 */
async function uniqueSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  siteId: string,
  base: string,
): Promise<string> {
  const { data } = await supabase
    .from("site_events")
    .select("slug")
    .eq("site_id", siteId)
    .is("archived_at", null)
    .like("slug", `${base}%`);

  const taken = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
  if (!taken.has(base)) return base;

  for (let i = 2; i < 200; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Turns a Zod issue into something a merchant can act on. */
function messageFor(issue: { path: (string | number | symbol)[]; message: string } | undefined): string {
  const field = issue?.path?.[0];
  if (field === "photoAssetId") return "Choose a photo for this event.";
  if (field === "name") return "Give the event a name.";
  if (field === "ticketUrl") return "The ticket link must start with https://";
  if (field === "startDate") return "Choose a date for this event.";
  return issue?.message ?? "That event could not be saved.";
}
