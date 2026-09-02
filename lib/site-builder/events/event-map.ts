/**
 * Loading a site's events for a render.
 *
 * Unlike assets and forms, this is **not** keyed by ids collected from the
 * document — the `events` section references no event, it renders whatever is
 * upcoming. So the loader takes a site and returns the list, and the render
 * context carries the list rather than a resolver function.
 *
 * That difference is the whole point of events being first-class records: an
 * event added today appears on every page carrying an events section, without
 * any of them being republished.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { EVENT_REPEATS, type EventRepeat, type SiteEvent } from "./event";

/** An event as a renderer needs it: photo already a URL, location already named. */
export interface RenderEvent extends SiteEvent {
  photoUrl: string | null;
  photoAlt: string | null;
  locationName: string | null;
}

export const NO_EVENTS: RenderEvent[] = [];

/**
 * The anonymous visitor's view.
 *
 * One RPC, photo URLs already joined — an events page is a list, so resolving
 * images per row would be N+1 on exactly the page that can least afford it.
 */
export async function loadPublicEvents(
  supabase: SupabaseClient,
  siteId: string,
): Promise<RenderEvent[]> {
  const { data, error } = await supabase.rpc("get_public_site_events", { p_site_id: siteId });

  if (error) {
    // Fail soft, like every other loader here: an events lookup that fails
    // costs the page its events, not the page.
    console.warn("[site-builder] public events lookup failed:", error.message);
    return NO_EVENTS;
  }

  return toRenderEvents((data ?? []) as Record<string, unknown>[]);
}

/** The merchant's view, under RLS, for the builder canvas and the dashboard. */
export async function loadEvents(
  supabase: SupabaseClient,
  siteId: string,
): Promise<RenderEvent[]> {
  const { data, error } = await supabase
    .from("site_events")
    .select(
      "id, slug, name, description, location_id, start_date, start_time, end_time, repeat, ticket_url, photo_asset_id, site_assets:photo_asset_id(cdn_url, alt_text)",
    )
    .eq("site_id", siteId)
    .is("archived_at", null)
    .order("start_date", { ascending: true })
    .limit(200);

  if (error) {
    console.warn("[site-builder] events lookup failed:", error.message);
    return NO_EVENTS;
  }

  return toRenderEvents(
    ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const asset = row.site_assets as { cdn_url?: string; alt_text?: string } | null;
      return { ...row, photo_url: asset?.cdn_url ?? null, photo_alt: asset?.alt_text ?? null };
    }),
  );
}

function toRenderEvents(rows: Record<string, unknown>[]): RenderEvent[] {
  return rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? "Event"),
    description: str(row.description),
    photoAssetId: String(row.photo_asset_id ?? ""),
    photoUrl: str(row.photo_url) ?? null,
    photoAlt: str(row.photo_alt) ?? null,
    locationId: (row.location_id as string | null) ?? null,
    locationName: str(row.location_name) ?? null,
    // Postgres returns `time` as `HH:MM:SS`; everything downstream expects
    // `HH:MM`, which is also what an `input[type=time]` produces.
    startDate: String(row.start_date ?? "").slice(0, 10),
    startTime: String(row.start_time ?? "23:00").slice(0, 5),
    endTime: String(row.end_time ?? "02:00").slice(0, 5),
    repeat: asRepeat(row.repeat),
    ticketUrl: str(row.ticket_url),
  }));
}

function asRepeat(value: unknown): EventRepeat {
  return EVENT_REPEATS.includes(value as EventRepeat) ? (value as EventRepeat) : "none";
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
