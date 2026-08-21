"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { createStarterPage } from "@/lib/site-builder/page-document";
import {
  deriveNavFromPages,
  parseNavItems,
  serializeNav,
  type NavItem,
  type NavPage,
} from "@/lib/site-builder/nav";
import { checkSubdomain } from "@/lib/site-builder/reserved-subdomains";
import {
  siteBrandSchema,
  siteFeaturesSchema,
  type SiteBrand,
  type SiteFeatures,
} from "@/lib/site-builder/site-settings";
import {
  siteTrackingSchema,
  trackingFieldLabel,
  type SiteTracking,
} from "@/lib/site-builder/tracking";
import { fetchMerchantId, fetchMerchantSite } from "@/lib/site-builder/site-context";
import type {
  ActionResult,
  MerchantSiteRow,
  SitePageRow,
} from "@/lib/site-builder/db-types";

/**
 * Site-level actions for the merchant website builder.
 *
 * Authorization is enforced by RLS (`is_merchant_admin`), not by checks here —
 * these actions look the merchant up by `clerk_org_id` to scope the query, but
 * the database is what refuses cross-tenant access. That ordering matters: a
 * bug in this file cannot leak another merchant's site.
 */

async function resolveMerchantId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<{ merchantId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !data) return { error: "Merchant not found" };
  return { merchantId: data.id as string };
}

/**
 * Returns the merchant's site, creating it (plus a starter home page) on first
 * use.
 *
 * **One site per merchant** (2026-08-15, superseding D4). The site is
 * brand-level: it covers every location, and locations become pages beneath it.
 * `locationId` is therefore not what identifies the site — it is only used to
 * seed the starter home page with that location's menu.
 *
 * Creating the site does **not** make it live — `render_mode` stays `'template'`
 * until the first successful publish, so a merchant who opens the builder and
 * changes their mind keeps their existing storefront serving the whole time.
 */
export async function GetOrCreateSite(
  clerkOrgId: string,
  locationId: string,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };
  if (!locationId) return { error: "Location is required", code: "site_not_found" };

  const supabase = createServerSupabaseClient();

  // Both reads are request-scoped memos shared with `loadSiteContext`, which the
  // builder route has already awaited by the time it gets here. On that route
  // this whole branch is free; called cold, it costs exactly what it used to.
  const merchantId = await fetchMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const existing = await fetchMerchantSite(merchantId);
  if (existing) return { data: existing };

  const { data: created, error: createError } = await supabase
    .from("merchant_sites")
    .insert({ merchant_id: merchantId })
    .select("*")
    .single();

  if (createError || !created) {
    // 23505 = another request created it between our read and our insert.
    if (createError?.code === "23505") {
      const { data: raced } = await supabase
        .from("merchant_sites")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (raced) return { data: raced as MerchantSiteRow };
    }
    return { error: createError?.message ?? "Could not create the site", code: "db_error" };
  }

  const site = created as MerchantSiteRow;

  const { error: pageError } = await supabase.from("site_pages").insert({
    site_id: site.id,
    merchant_id: merchantId,
    path: "",
    title: "Home",
    is_home: true,
    draft_content: createStarterPage({ locationId }),
  });

  if (pageError) {
    return { error: "Site created but the home page could not be added", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: "created_website",
    actionCategory: "website",
    severity: "info",
    resourceType: "merchant_site",
    resourceId: site.id,
    resourceName: "Website",
  });

  return { data: site };
}

/** Site-wide settings — navigation, theme tokens, default SEO, integrations. */
export async function UpdateSiteSettings(
  clerkOrgId: string,
  siteId: string,
  patch: Partial<
    Pick<MerchantSiteRow, "nav" | "theme" | "site_seo" | "integrations" | "features" | "brand">
  >,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: before } = await supabase
    .from("merchant_sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle();

  if (!before) return { error: "Site not found", code: "site_not_found" };

  const { data, error } = await supabase
    .from("merchant_sites")
    .update(patch)
    .eq("id", siteId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Site not found", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    // A site is brand-level and has no location of its own.
    locationId: null,
    action: "updated_website_settings",
    actionCategory: "website",
    severity: "info",
    resourceType: "merchant_site",
    resourceId: siteId,
    resourceName: "Website settings",
    changes: {
      before: Object.fromEntries(
        Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]]),
      ),
      after: patch as Record<string, unknown>,
    },
  });

  // The canvas renders from this row, so it has to be re-read after a write —
  // the same reason every other mutation in this file does it. Without it a
  // merchant saves a theme and watches the editor behind the overlay keep the
  // old one until a hard reload.
  revalidatePath("/dashboard/website", "layout");

  return { data: data as MerchantSiteRow };
}

/**
 * Writes the site navigation.
 *
 * A narrow wrapper around `UpdateSiteSettings` rather than letting the client
 * hand over a `nav` blob: everything goes through `serializeNav`, which drops
 * half-typed rows and enforces `MAX_NAV_ITEMS`, so what the merchant sees after
 * saving is exactly what the header will render. The generic settings action
 * would happily store a shape the renderer silently ignores.
 *
 * **Navigation is site-wide and saves immediately.** It is not part of a page's
 * draft, because a nav stored per page would mean changing one link re-versions
 * every page. The consequence for the merchant is that a nav change is live as
 * soon as it is saved — the same bargain as the brand colour, and the reason
 * the editor says so on the panel.
 */
export async function UpdateSiteNav(
  clerkOrgId: string,
  siteId: string,
  items: NavItem[],
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const result = await UpdateSiteSettings(clerkOrgId, siteId, { nav: serializeNav(items) });

  /**
   * The nav is a *route* prop, not client state, so the server payload has to be
   * invalidated too.
   *
   * Found in browser testing: save a link, navigate away inside the dashboard,
   * come back, and the editor showed the nav as it was before the save. The
   * drawer's own state was correct and the database was correct — Next was
   * replaying a cached RSC payload for a route whose props it had no reason to
   * think had changed. A hard reload fixed it, which is exactly the kind of
   * "works on my machine" a merchant would report as lost work.
   */
  if (result.data) revalidatePath("/dashboard/website", "layout");

  return result;
}

/**
 * Fills an empty navigation in from the pages that are already published.
 *
 * Every site created before there was an editor for this carries
 * `{"items":[]}`, which renders as a header with no links: a merchant could
 * publish four pages and leave visitors able to reach exactly one of them.
 * Rather than migrate the column — a data migration cannot know which pages a
 * merchant wanted linked — this derives a sensible list the first time someone
 * opens the site, and then never touches it again.
 *
 * **Only ever acts on an empty nav.** A merchant who has deliberately emptied
 * their navigation gets it refilled once; a merchant who has arranged one is
 * never overruled. Returns the items now in force so a caller can render them
 * without a second read.
 */
export async function EnsureNavSeeded(
  clerkOrgId: string,
  siteId: string,
  currentNav: unknown,
): Promise<NavItem[]> {
  const existing = parseNavItems(currentNav);
  if (existing.length > 0) return existing;

  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from("site_pages")
    .select("title, path, is_home, status")
    .eq("site_id", siteId)
    .eq("status", "published")
    .order("is_home", { ascending: false })
    .order("created_at", { ascending: true });

  const pages: NavPage[] = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    title: String(row.title ?? ""),
    path: String(row.path ?? ""),
    isHome: row.is_home === true,
    isPublished: true,
  }));

  const derived = deriveNavFromPages(pages);
  if (derived.length === 0) return [];

  // Best effort. A site whose nav could not be seeded still opens; the merchant
  // simply sees an empty list they can fill in themselves.
  const result = await UpdateSiteNav(clerkOrgId, siteId, derived);
  return result.data ? derived : [];
}

/**
 * Writes the four brand feature toggles.
 *
 * Narrow, and validated with the schema rather than spread from the client, for
 * the reason `UpdateSiteNav` is narrow: `UpdateSiteSettings` takes a `Partial`
 * of jsonb columns, so handing it a client object would let a caller store a
 * fifth key that nothing reads and no screen can ever clear again.
 *
 * **The whole set is written every time.** A patch would make "reviews absent"
 * and "reviews false" two different stored states meaning the same thing, and
 * `resolveFeatures` would have to keep them straight forever.
 */
export async function UpdateSiteFeatures(
  clerkOrgId: string,
  siteId: string,
  features: SiteFeatures,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const parsed = siteFeaturesSchema.safeParse(features);
  if (!parsed.success) {
    return { error: "Those settings could not be saved", code: "invalid_document" };
  }

  const result = await UpdateSiteSettings(clerkOrgId, siteId, { features: parsed.data });

  // The toggles decide what the Add Section catalogue offers and whether the
  // header carries a Book a table button, and both are rendered from server
  // props. Without this the editor keeps offering yesterday's answer until a
  // hard reload — the same stale-payload trap `UpdateSiteNav` documents.
  if (result.data) revalidatePath("/dashboard/website", "layout");

  return result;
}

/**
 * Writes the brand facts — social accounts, reservation link, cuisines, price
 * range, and how an unscoped visitor is treated.
 *
 * Parsed rather than repaired: this is the *write* path, where a bad value is a
 * mistake the merchant should be told about. `resolveBrand` is the read path,
 * where a bad value is history and dropping it silently is the only useful
 * behaviour.
 */
export async function UpdateSiteBrand(
  clerkOrgId: string,
  siteId: string,
  brand: SiteBrand,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const parsed = siteBrandSchema.safeParse(brand);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first?.message ?? "Those settings could not be saved",
      code: "invalid_document",
    };
  }

  const result = await UpdateSiteSettings(clerkOrgId, siteId, { brand: parsed.data });
  if (result.data) revalidatePath("/dashboard/website", "layout");

  return result;
}

/**
 * Writes the marketing pixel IDs.
 *
 * Narrow and schema-validated, like every other writer on this row — but this
 * one carries the most weight of any of them. These values end up interpolated
 * into **inline `<script>` source** on a public page, so `siteTrackingSchema`
 * is not a convenience that produces a tidy error message; it is the thing
 * standing between a text input and arbitrary JavaScript on a merchant's
 * website. Accepting a raw jsonb blob from the client here would be a
 * stored-XSS hole with a form in front of it.
 *
 * An empty string clears a field rather than storing one: `""` is what a
 * merchant types to remove a pixel, and a stored empty string would fail the
 * pattern on read and be dropped anyway — but silently, one render later,
 * rather than here where they can see it.
 */
export async function UpdateSiteIntegrations(
  clerkOrgId: string,
  siteId: string,
  tracking: SiteTracking,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const cleaned = Object.fromEntries(
    Object.entries(tracking).filter(([, value]) => typeof value === "string" && value.trim() !== ""),
  );

  const parsed = siteTrackingSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Name the field. "That does not look like a valid ID" is useless on a
    // screen with five of them.
    const field = typeof issue?.path?.[0] === "string" ? issue.path[0] : null;
    return {
      error: field
        ? `${trackingFieldLabel(field)}: ${issue.message}`
        : (issue?.message ?? "Could not save"),
      code: "invalid_document",
    };
  }

  const result = await UpdateSiteSettings(clerkOrgId, siteId, { integrations: parsed.data });
  if (result.data) revalidatePath("/dashboard/website", "layout");

  return result;
}

/**
 * Sets — or clears — the website's own logo.
 *
 * Narrow rather than folded into `UpdateSiteSettings`, which takes a `Partial`
 * of four jsonb columns: a foreign key is not site *settings*, and letting the
 * client name the column would mean trusting it with a reference into a table
 * it can otherwise only reach through RLS.
 *
 * **This is what the Style screen's Replace button was missing.** Until now the
 * built site borrowed `online_store_config.logo_url` — the *ordering* logo,
 * belonging to one location, and on a multi-location merchant whichever row
 * came back first. Passing `null` clears it and returns the site to that
 * fallback, which is why clearing is supported rather than being a delete.
 */
export async function SetSiteLogo(
  clerkOrgId: string,
  siteId: string,
  assetId: string | null,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("merchant_sites")
    .update({ logo_asset_id: assetId })
    .eq("id", siteId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Site not found", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: assetId ? "changed_website_logo" : "removed_website_logo",
    actionCategory: "website",
    severity: "info",
    resourceType: "merchant_site",
    resourceId: siteId,
    resourceName: "Website logo",
    changes: { after: { logoAssetId: assetId } },
  });

  revalidatePath("/dashboard/website", "layout");

  return { data: data as MerchantSiteRow };
}

/**
 * Claims the web address a built site is served at.
 *
 * The last step between publishing and a visitor: a built site serves only at
 * `{subdomain}.dexaposai.com`, never at a storefront slug — that address keeps
 * serving online ordering, whatever the website does. Until this is set, a
 * merchant can publish all day and remain unreachable.
 *
 * **Collisions are the database's call, not this function's.** Checking
 * availability with a SELECT and then writing is a race with a second merchant
 * doing the same thing, and the losing side would be told "available" a moment
 * before being told otherwise. So the write goes ahead and `23505` is
 * translated — the unique index and the cross-namespace trigger both raise it,
 * which is why one handler covers a clash with another website *and* a clash
 * with somebody's ordering storefront.
 */
export async function ClaimSubdomain(
  clerkOrgId: string,
  siteId: string,
  rawSubdomain: string,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const subdomain = rawSubdomain.trim().toLowerCase();
  const check = checkSubdomain(subdomain);
  if (!check.ok) {
    return { error: check.message ?? "That web address cannot be used", code: "invalid_path" };
  }

  const supabase = createServerSupabaseClient();

  const { data: before } = await supabase
    .from("merchant_sites")
    .select("subdomain")
    .eq("id", siteId)
    .maybeSingle();

  const previous = (before as { subdomain: string | null } | null)?.subdomain ?? null;
  if (previous === subdomain) {
    const { data: unchanged } = await supabase
      .from("merchant_sites")
      .select("*")
      .eq("id", siteId)
      .maybeSingle();
    return unchanged
      ? { data: unchanged as MerchantSiteRow }
      : { error: "Site not found", code: "site_not_found" };
  }

  const { data, error } = await supabase
    .from("merchant_sites")
    .update({ subdomain })
    .eq("id", siteId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "That web address is already taken.", code: "path_taken" };
    }
    if (error?.code === "23514") {
      return {
        error: "Use lowercase letters, numbers and hyphens, 3 characters or more.",
        code: "invalid_path",
      };
    }
    return { error: error?.message ?? "Could not save the web address", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: previous ? "changed_website_address" : "claimed_website_address",
    actionCategory: "website",
    // Changing an address a site is already reachable at breaks every existing
    // link to it, which is a bigger deal than claiming a free one.
    severity: previous ? "warning" : "info",
    resourceType: "merchant_site",
    resourceId: siteId,
    resourceName: subdomain,
    changes: { before: { subdomain: previous }, after: { subdomain } },
  });

  return { data: data as MerchantSiteRow };
}

/**
 * The merchant's site, or `null` if the builder has never been opened.
 *
 * Read-only counterpart to `GetOrCreateSite`, for surfaces that must not bring
 * a site into existence as a side effect of being looked at — the preview route
 * is the reason it exists.
 *
 * It used to take a `locationId` and filter on `merchant_sites.location_id`.
 * That column has never existed: the table has been merchant-scoped since the
 * 2026-08-15 supersession of D4, so the filter was a guaranteed error from any
 * caller. It had none, which is the only reason it went unnoticed.
 */
export async function GetSite(
  clerkOrgId: string,
): Promise<ActionResult<MerchantSiteRow | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { merchantId } = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const { data, error } = await supabase
    .from("merchant_sites")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  return { data: (data as MerchantSiteRow | null) ?? null };
}

/** Pages belonging to a site, home first. Excludes document bodies. */
export async function GetSitePageCount(siteId: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count } = await supabase
    .from("site_pages")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .neq("status", "archived");
  return count ?? 0;
}
