"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { createStarterPage } from "@/lib/site-builder/page-document";
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

  const { merchantId, error: merchantError } = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: merchantError, code: "merchant_not_found" };

  const { data: existing } = await supabase
    .from("merchant_sites")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (existing) return { data: existing as MerchantSiteRow };

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

/** The site for a location, or `undefined` if the builder was never opened. */
export async function GetSite(
  clerkOrgId: string,
  locationId: string,
): Promise<ActionResult<MerchantSiteRow | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { merchantId } = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const { data, error } = await supabase
    .from("merchant_sites")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("location_id", locationId)
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
