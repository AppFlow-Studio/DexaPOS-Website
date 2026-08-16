"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { createStarterPage } from "@/lib/site-builder/page-document";
import { checkSubdomain } from "@/lib/site-builder/reserved-subdomains";
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
  patch: Partial<Pick<MerchantSiteRow, "nav" | "theme" | "site_seo" | "integrations">>,
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
