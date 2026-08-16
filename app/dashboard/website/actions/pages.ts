"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { createEmptyPage } from "@/lib/site-builder/page-document";
import { checkPagePath, slugifyPagePath } from "@/lib/site-builder/reserved-paths";
import { createStarterHomePage } from "@/lib/site-builder/starter-page";
import type {
  ActionResult,
  MerchantSiteRow,
  SitePageRow,
  SitePageSummary,
} from "@/lib/site-builder/db-types";

/**
 * Page management.
 *
 * Multi-page is modelled from day one because it costs nothing in the schema and
 * a migration later would touch live merchant data — but the v1 builder UI ships
 * home-page-only. These actions exist and work; the canvas simply does not
 * expose them yet.
 */

const PAGE_SUMMARY_COLUMNS =
  "id, site_id, merchant_id, path, title, is_home, status, revision, published_version_id, published_at, created_at, updated_at";

export async function ListPages(
  clerkOrgId: string,
  siteId: string,
): Promise<ActionResult<SitePageSummary[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("site_pages")
    .select(PAGE_SUMMARY_COLUMNS)
    .eq("site_id", siteId)
    .neq("status", "archived")
    .order("is_home", { ascending: false })
    .order("title", { ascending: true });

  if (error) return { error: error.message, code: "db_error" };
  return { data: (data ?? []) as SitePageSummary[] };
}

export async function CreatePage(
  clerkOrgId: string,
  siteId: string,
  /**
   * `locationId` makes this a **location page** — one restaurant's hours,
   * address, menu and prices. Omit it for a brand page (home, About, contact),
   * which speaks for the whole business and shows no prices until the visitor
   * picks somewhere. See HANDOFF §11.
   */
  input: { title: string; path?: string; locationId?: string },
): Promise<ActionResult<SitePageSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const title = input.title.trim();
  if (!title) return { error: "Give the page a name", code: "invalid_path" };

  const path = (input.path ?? slugifyPagePath(title)).trim();
  const pathCheck = checkPagePath(path);
  if (!pathCheck.ok) {
    return { error: pathCheck.message ?? "That page address is not allowed", code: "invalid_path" };
  }
  if (path === "") {
    return {
      error: "That name cannot be turned into a page address. Try adding some letters.",
      code: "invalid_path",
    };
  }

  const supabase = createServerSupabaseClient();

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("id, merchant_id, max_pages")
    .eq("id", siteId)
    .maybeSingle();

  if (!site) return { error: "Site not found", code: "site_not_found" };
  const siteRow = site as Pick<MerchantSiteRow, "id" | "merchant_id" | "max_pages">;

  // Quota (blocker B9). NULL means unlimited, which is every merchant in v1 —
  // the check exists so turning limits on later is a config change.
  if (siteRow.max_pages !== null) {
    const { count } = await supabase
      .from("site_pages")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .neq("status", "archived");

    if ((count ?? 0) >= siteRow.max_pages) {
      return {
        error: `Your plan includes ${siteRow.max_pages} pages.`,
        code: "page_limit_reached",
      };
    }
  }

  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      site_id: siteId,
      merchant_id: siteRow.merchant_id,
      location_id: input.locationId ?? null,
      path,
      title,
      is_home: false,
      draft_content: createEmptyPage(
        input.locationId ? { locationId: input.locationId } : undefined,
      ),
    })
    .select(PAGE_SUMMARY_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "A page already uses that address", code: "path_taken" };
    }
    return { error: error?.message ?? "Could not create the page", code: "db_error" };
  }

  const page = data as SitePageSummary;

  await LogAuditEvent({
    clerkOrgId,
    locationId: input.locationId ?? null,
    action: "created_website_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: page.id,
    resourceName: page.title,
  });

  return { data: page };
}

export async function RenamePage(
  clerkOrgId: string,
  pageId: string,
  input: { title?: string; path?: string },
): Promise<ActionResult<SitePageSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("site_pages")
    .select(PAGE_SUMMARY_COLUMNS)
    .eq("id", pageId)
    .maybeSingle();

  if (!existing) return { error: "Page not found", code: "page_not_found" };
  const before = existing as SitePageSummary;

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { error: "Give the page a name", code: "invalid_path" };
    patch.title = title;
  }

  if (input.path !== undefined) {
    // The home page's address is structural, not editorial. Renaming it would
    // move the site's root and break every published link to it.
    if (before.is_home) {
      return { error: "The home page address cannot be changed", code: "invalid_path" };
    }
    const path = input.path.trim();
    const pathCheck = checkPagePath(path);
    if (!pathCheck.ok || path === "") {
      return {
        error: pathCheck.message ?? "That page address is not allowed",
        code: "invalid_path",
      };
    }
    patch.path = path;
  }

  if (Object.keys(patch).length === 0) return { data: before };

  const { data, error } = await supabase
    .from("site_pages")
    .update(patch)
    .eq("id", pageId)
    .select(PAGE_SUMMARY_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "A page already uses that address", code: "path_taken" };
    }
    return { error: error?.message ?? "Could not rename the page", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "renamed_website_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: pageId,
    resourceName: (data as SitePageSummary).title,
    changes: {
      before: { title: before.title, path: before.path },
      after: patch,
    },
  });

  return { data: data as SitePageSummary };
}

/**
 * Archives a page.
 *
 * Soft delete only. A hard delete of a page with a published version would break
 * live URLs and take its version history with it, so it is not offered.
 */
export async function DeletePage(
  clerkOrgId: string,
  pageId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("site_pages")
    .select(PAGE_SUMMARY_COLUMNS)
    .eq("id", pageId)
    .maybeSingle();

  if (!existing) return { error: "Page not found", code: "page_not_found" };
  const page = existing as SitePageSummary;

  if (page.is_home) {
    return { error: "The home page cannot be deleted", code: "not_deletable" };
  }

  const { error } = await supabase
    .from("site_pages")
    .update({ status: "archived", published_version_id: null, published_at: null })
    .eq("id", pageId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    action: "archived_website_page",
    actionCategory: "website",
    severity: "warning",
    resourceType: "site_page",
    resourceId: pageId,
    resourceName: page.title,
  });

  return { data: { id: pageId } };
}

/**
 * Creates the site's home page, pre-filled with a usable restaurant layout.
 *
 * A merchant's first page must not be blank. A blank canvas asks someone with
 * no design experience to invent a homepage structure; a starter page asks them
 * to replace words and photos, which is a task they can actually finish. Every
 * section is ordinary and editable — nothing here is a template the merchant is
 * locked into.
 *
 * Idempotent: `uq_site_pages_one_home` allows one home page per site, so a
 * double submit or a retried request returns the existing page rather than
 * failing.
 */
export async function CreateHomePage(
  clerkOrgId: string,
  siteId: string,
  input: { locationId: string; menuItemIds?: string[]; restaurantName?: string },
): Promise<ActionResult<SitePageSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("site_pages")
    .select(PAGE_SUMMARY_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_home", true)
    .maybeSingle();

  if (existing) return { data: existing as SitePageSummary };

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("id, merchant_id")
    .eq("id", siteId)
    .maybeSingle();

  if (!site) return { error: "Site not found", code: "site_not_found" };
  const siteRow = site as Pick<MerchantSiteRow, "id" | "merchant_id">;

  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      site_id: siteId,
      merchant_id: siteRow.merchant_id,
      location_id: input.locationId,
      // The home page is the site root, so its path is the empty string.
      path: "",
      title: "Home",
      is_home: true,
      draft_content: createStarterHomePage({
        locationId: input.locationId,
        menuItemIds: input.menuItemIds,
        restaurantName: input.restaurantName,
      }),
    })
    .select(PAGE_SUMMARY_COLUMNS)
    .single();

  if (error || !data) {
    // Lost a race with a concurrent create; the winner's row is the answer.
    if (error?.code === "23505") {
      const { data: raced } = await supabase
        .from("site_pages")
        .select(PAGE_SUMMARY_COLUMNS)
        .eq("site_id", siteId)
        .eq("is_home", true)
        .maybeSingle();
      if (raced) return { data: raced as SitePageSummary };
    }
    return { error: error?.message ?? "Could not create the home page", code: "db_error" };
  }

  const page = data as SitePageSummary;

  await LogAuditEvent({
    clerkOrgId,
    locationId: input.locationId,
    action: "created_website_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: page.id,
    resourceName: page.title,
    changes: { after: { isHome: true, starter: true } },
  });

  return { data: page };
}

/** Returns the home page, which every site has from creation. */
export async function GetHomePage(
  clerkOrgId: string,
  siteId: string,
): Promise<ActionResult<SitePageSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("site_pages")
    .select(PAGE_SUMMARY_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_home", true)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "This site has no home page", code: "page_not_found" };

  return { data: data as SitePageSummary };
}
