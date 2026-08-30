"use server";

import { revalidatePath } from "next/cache";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import type { ActionResult, MerchantSiteRow, SitePageRow } from "@/lib/site-builder/db-types";
import { parseNavItems, removeNavItemByPath, serializeNav } from "@/lib/site-builder/nav";
import { createSection } from "@/lib/site-builder/page-document";
import { RESERVATIONS_PAGE_PATH } from "@/lib/site-builder/reservations/paths";
import { CURRENT_SCHEMA_VERSION } from "@/lib/site-builder/page-document";
import {
  readSiteSettings,
  resolveReservationMode,
  type ReservationApprovalMode,
} from "@/lib/site-builder/site-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { PublishPage, UnpublishPage } from "./publish";
import { UpdateSiteBrand, UpdateSiteFeatures } from "./site";

/**
 * Provisioning the reservations page.
 *
 * A merchant who switches Reservations to "take bookings on my site" should end
 * that save with a working, linked, reachable page — not with homework. Half of
 * them will never find the builder, open Add Section and drop the widget in
 * themselves, and a booking page nobody can reach is the same as no booking
 * page.
 *
 * The page is an ordinary `site_pages` row containing one `reservations`
 * section, which is why this is provisioning rather than a new kind of object:
 * the merchant can edit it, restyle it, add photos and a policy blurb, or
 * delete it, exactly like any other page.
 */

/**
 * The path the page is created at. Not reserved — it belongs to the merchant.
 *
 * Imported rather than declared here because the site header links to the same
 * page, and a `"use server"` module cannot export a constant for it to read.
 */
const RESERVATIONS_PATH = RESERVATIONS_PAGE_PATH;
const RESERVATIONS_TITLE = "Reservations";

export interface ProvisionResult {
  pageId: string;
  path: string;
  /** True when an existing page at that path was used instead of a new one. */
  adopted: boolean;
  /** True when a previously retired page was brought back rather than created. */
  revived: boolean;
}

/**
 * Makes the page and the nav match whatever mode is currently *stored*.
 *
 * The settings screen saves the brand block the way it always has, then calls
 * this. Reading the stored mode rather than being told one means there is no
 * second source of truth to drift: if the save succeeded, this reconciles to
 * it; if it failed, this reconciles to the old value, which is also correct.
 *
 * Idempotent, so calling it on every settings save — including saves that had
 * nothing to do with reservations — is safe and cheap.
 */
/**
 * The reservations master switch: store the decision, then make the site match
 * it.
 *
 * **One action for both halves, deliberately.** Turning bookings on means
 * writing two fields *and* creating, publishing and linking a page; turning
 * them off means writing one field *and* unlinking and unpublishing that page.
 * Those halves were separate calls the settings screen had to remember to make
 * in the right order, and forgetting the second one leaves a site whose stored
 * settings and public pages disagree — a live booking page for a restaurant
 * that has switched bookings off. A caller cannot forget a step it does not
 * make.
 *
 * Returns the provisioning outcome so the screen can say what actually
 * happened: page created, existing page adopted, or menu too full to link it.
 */
export async function SetReservationsEnabled(
  clerkOrgId: string,
  siteId: string,
  enabled: boolean,
): Promise<ActionResult<ProvisionResult | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("merchant_sites")
    .select("features, brand")
    .eq("id", siteId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Site not found", code: "site_not_found" };

  const { features, brand } = readSiteSettings(data as Pick<MerchantSiteRow, "features" | "brand">);

  const featureResult = await UpdateSiteFeatures(clerkOrgId, siteId, {
    ...features,
    reservations: enabled,
  });
  if (featureResult.error) return { error: featureResult.error, code: featureResult.code };

  // `native` is written on the way ON and left alone on the way OFF. Keeping it
  // means the feature flag is the only thing that moves, so switching back on
  // restores exactly the previous state — and it keeps this write idempotent
  // for a merchant who toggles twice.
  if (enabled && brand.reservationMode !== "native") {
    const brandResult = await UpdateSiteBrand(clerkOrgId, siteId, {
      ...brand,
      reservationMode: "native",
    });
    if (brandResult.error) return { error: brandResult.error, code: brandResult.code };
  }

  // Reads back what was just stored rather than trusting `enabled`, which is
  // the same discipline `SyncReservationsPage` already applies: there is one
  // source of truth about this site's mode and it is the row, not the argument
  // that was on its way to becoming the row.
  return SyncReservationsPage(clerkOrgId, siteId);
}

/**
 * Sets whether website bookings are accepted on the spot or held for review.
 *
 * **One rule for the whole business.** It writes `merchant_sites.brand`, one
 * jsonb column on one row per merchant, rather than `reservation_settings`,
 * which is keyed per location — see the plan's §2. A merchant-wide answer
 * stored per branch is N rows that can drift, and a branch created next month
 * would silently take the column default instead of the answer already given.
 *
 * **Deliberately does not call `SyncReservationsPage`.** Its sibling
 * `SetReservationsEnabled` must, because turning bookings on or off changes
 * whether a public page should exist at all. Approval mode changes only what
 * happens when a guest submits — the same page, the same availability grid, a
 * different sentence on the button. Provisioning has nothing to do.
 *
 * **Existing bookings are untouched.** Switching to manual does not un-confirm
 * tonight's tables; the mode is read at booking time by
 * `create_public_reservation` and nowhere else.
 */
export async function SetReservationApproval(
  clerkOrgId: string,
  siteId: string,
  mode: ReservationApprovalMode,
): Promise<ActionResult<MerchantSiteRow>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("merchant_sites")
    .select("features, brand")
    .eq("id", siteId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Site not found", code: "site_not_found" };

  const { brand } = readSiteSettings(data as Pick<MerchantSiteRow, "features" | "brand">);

  // Spread the resolved brand rather than patching the raw column: `resolveBrand`
  // is an allowlist, so writing a partial object here would drop every key it
  // did not carry.
  return UpdateSiteBrand(clerkOrgId, siteId, { ...brand, reservationApproval: mode });
}

export async function SyncReservationsPage(
  clerkOrgId: string,
  siteId: string,
): Promise<ActionResult<ProvisionResult | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("merchant_sites")
    .select("features, brand")
    .eq("id", siteId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Site not found", code: "site_not_found" };

  const row = data as Pick<MerchantSiteRow, "features" | "brand">;
  const mode = resolveReservationMode(readSiteSettings(row));

  if (mode === "native") return EnsureReservationsPage(clerkOrgId, siteId);

  // 'off' and 'link' both mean the same thing for this page: nobody should be
  // able to reach a booking form that will not take a booking.
  const retired = await RetireReservationsPage(clerkOrgId, siteId);
  if (retired.error) return { error: retired.error, code: retired.code ?? "db_error" };
  return { data: null };
}

/**
 * Creates and publishes the reservations page — once, ever.
 *
 * It no longer links the page into `merchant_sites.nav`; the header's "Book a
 * table" button is the single entry point, and the two together gave a merchant
 * two header entries for one page. See the note at the publish step.
 *
 * The ordering rule that governed this is still worth knowing, because
 * `RetireReservationsPage` is bound by its mirror image: `merchant_sites.nav` is
 * read straight through `readNav` at render time with no version gate, while an
 * unpublished page hits `notFound()`. So a nav item must never exist before its
 * page is published, and must be removed before that page is unpublished — get
 * either wrong and the header carries a live 404.
 */
export async function EnsureReservationsPage(
  clerkOrgId: string,
  siteId: string,
): Promise<ActionResult<ProvisionResult | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: siteData, error: siteError } = await supabase
    .from("merchant_sites")
    .select("id, merchant_id, brand, reservations_page_id, reservations_page_provisioned_at")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) return { error: siteError.message, code: "db_error" };
  if (!siteData) return { error: "Site not found", code: "site_not_found" };

  const site = siteData as Pick<
    MerchantSiteRow,
    "id" | "merchant_id" | "brand" | "reservations_page_id" | "reservations_page_provisioned_at"
  >;

  let adopted = false;
  let revived = false;
  let pageId = site.reservations_page_id ?? null;

  // ── Has this site been provisioned before? ────────────────────────────────
  if (site.reservations_page_provisioned_at) {
    const { data: existing } = pageId
      ? await supabase.from("site_pages").select("id, status").eq("id", pageId).maybeSingle()
      : { data: null };

    // The merchant deleted the page on purpose. NEVER recreate it — a page that
    // grows back every time a setting is saved is worse than no page, and this
    // is exactly why `reservations_page_provisioned_at` is set once and never
    // cleared rather than being inferred from `reservations_page_id`.
    if (!existing) return { data: null };

    pageId = (existing as { id: string }).id;
    revived = true;
  }

  // ── First time: adopt an existing page at that path, or create one ────────
  if (!pageId) {
    const { data: atPath } = await supabase
      .from("site_pages")
      .select("id")
      .eq("site_id", siteId)
      .eq("path", RESERVATIONS_PATH)
      .maybeSingle();

    if (atPath) {
      // A merchant who already made a /reservations page pointing at OpenTable
      // gets that page upgraded, not a second one at /reservations-2. Two pages
      // both called Reservations is a worse outcome than either.
      pageId = (atPath as { id: string }).id;
      adopted = true;
      const appended = await appendReservationsSection(supabase, pageId);
      if (appended.error) return { error: appended.error, code: appended.code ?? "db_error" };
    } else {
      const created = await supabase
        .from("site_pages")
        .insert({
          site_id: siteId,
          merchant_id: site.merchant_id,
          // A BRAND page. The widget asks which restaurant when the merchant has
          // more than one bookable location, and skips the question when they
          // have one — so a single nav link scales to any number of branches.
          location_id: null,
          path: RESERVATIONS_PATH,
          title: RESERVATIONS_TITLE,
          is_home: false,
          draft_content: buildReservationsPage(
            await resolveFooterLocation(supabase, site.merchant_id, site.brand),
          ),
        })
        .select("id")
        .maybeSingle();

      if (created.error || !created.data) {
        return {
          error: created.error?.message ?? "Could not create the reservations page",
          code: "db_error",
        };
      }
      pageId = (created.data as { id: string }).id;
    }
  }

  // ── Publish, THEN link ────────────────────────────────────────────────────
  const published = await PublishPage(clerkOrgId, pageId);
  if (published.error) {
    return { error: published.error, code: published.code ?? "db_error" };
  }

  // ── No nav item, deliberately ─────────────────────────────────────────────
  //
  // This used to append a "Reservations" link to `merchant_sites.nav`. It no
  // longer does, because the header already carries a "Book a table" call to
  // action pointing at this exact page — so a merchant who switched bookings on
  // got TWO entries in their header for one destination.
  //
  // The button wins over the nav item on both counts that matter. "Book a
  // table" is an action and "Reservations" is a filing cabinet, and the nav has
  // only five inline slots before the rest fall into a More menu — spending one
  // on a duplicate of the button beside it is the most expensive place to put
  // it. A merchant who wants the page in their menu as well can add it in the
  // nav editor; nothing here stops them.
  //
  // `RetireReservationsPage` still REMOVES this item, which is what cleans up
  // sites provisioned by the older code: switching bookings off and on again
  // drops the stale link and never re-adds it.

  const { error: markError } = await supabase
    .from("merchant_sites")
    .update({
      reservations_page_id: pageId,
      // Set once, on the first provision, and never cleared.
      reservations_page_provisioned_at:
        site.reservations_page_provisioned_at ?? new Date().toISOString(),
    })
    .eq("id", siteId);

  if (markError) return { error: markError.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: revived ? "revived_reservations_page" : "created_reservations_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: pageId,
    resourceName: RESERVATIONS_TITLE,
  });

  revalidatePath("/dashboard/website", "layout");

  return { data: { pageId, path: RESERVATIONS_PATH, adopted, revived } };
}

/**
 * Takes the reservations page out of service without destroying it.
 *
 * **Unpublish, do not delete.** By the time a merchant turns bookings off they
 * may have added a hero image, photos and a cancellation policy to this page.
 * Deleting it would throw that away for a setting they might flip back tomorrow.
 * Unpublishing keeps every word and makes the page unreachable, which is the
 * only part that actually matters — a live booking form that cannot take
 * bookings is worse than a missing page.
 *
 * The nav item goes, because a link to an unpublished page 404s.
 */
export async function RetireReservationsPage(
  clerkOrgId: string,
  siteId: string,
): Promise<ActionResult<{ retired: boolean }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: siteData, error: siteError } = await supabase
    .from("merchant_sites")
    .select("id, nav, reservations_page_id")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) return { error: siteError.message, code: "db_error" };
  if (!siteData) return { error: "Site not found", code: "site_not_found" };

  const site = siteData as Pick<MerchantSiteRow, "id" | "nav" | "reservations_page_id">;

  // Link first here, and page second — the reverse of provisioning, and for the
  // same reason. Removing the link before unpublishing means there is never a
  // moment where the header points at a page that 404s.
  const items = parseNavItems(site.nav);
  const without = removeNavItemByPath(items, RESERVATIONS_PATH);

  if (without.length !== items.length) {
    const { error: navError } = await supabase
      .from("merchant_sites")
      .update({ nav: serializeNav(without) })
      .eq("id", siteId);
    if (navError) return { error: navError.message, code: "db_error" };
  }

  if (site.reservations_page_id) {
    // A page the merchant has since deleted is not an error — there is simply
    // nothing left to retire.
    const result = await UnpublishPage(clerkOrgId, site.reservations_page_id);
    if (result.error && result.code !== "page_not_found") {
      return { error: result.error, code: result.code ?? "db_error" };
    }
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: "retired_reservations_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: site.reservations_page_id ?? siteId,
    resourceName: RESERVATIONS_TITLE,
  });

  revalidatePath("/dashboard/website", "layout");

  return { data: { retired: true } };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header, hero, the widget, footer.
 *
 * The hero is not decoration — `validatePage` lists it as a REQUIRED section
 * and `PublishPage` refuses an invalid document, so a page without one cannot
 * be published at all. An earlier version left it out on the argument that a
 * full-bleed image pushes the time grid below the fold; the document contract
 * settled that, and a test now pins it.
 *
 * `locationId` binds the footer, which shows an address and opening hours and
 * therefore has to know whose. Unbound it fails validation with "Footer is not
 * linked to a location yet" — which, for a page created automatically, would
 * surface to the merchant as a failure they cannot act on.
 */
function buildReservationsPage(locationId: string | null) {
  const ctx = locationId ? { locationId } : undefined;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      createSection("header", ctx),
      createSection("hero", ctx),
      createSection("reservations", ctx),
      createSection("footer", ctx),
    ],
    seo: {
      title: RESERVATIONS_TITLE,
      // Long enough to clear the 50-character floor `validatePage` warns below,
      // and to read as a sentence in a search result rather than a label.
      description:
        "Book a table with us online — choose your party size, pick a date and time, and we will confirm straight away.",
    },
    settings: {},
  };
}

/**
 * Which location the page's footer speaks for.
 *
 * The page itself is a BRAND page — it books for any branch, and the widget
 * asks which when there is more than one. But the footer still has to print one
 * address, so it takes the merchant's declared default and falls back to their
 * first active location. Null only when the merchant has no active location at
 * all, in which case publishing will fail loudly rather than silently produce a
 * footer addressed to nobody.
 */
async function resolveFooterLocation(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string,
  brand: Record<string, unknown> | null,
): Promise<string | null> {
  const declared = brand && typeof brand.defaultLocationId === "string" ? brand.defaultLocationId : null;

  if (declared) {
    const { data } = await supabase
      .from("locations")
      .select("id")
      .eq("id", declared)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }

  const { data } = await supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? (data as { id: string }).id : null;
}

/** Adds the widget to a page the merchant already made at `/reservations`. */
async function appendReservationsSection(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  pageId: string,
): Promise<ActionResult<true>> {
  const { data, error } = await supabase
    .from("site_pages")
    .select("draft_content")
    .eq("id", pageId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Page not found", code: "page_not_found" };

  const doc = (data as Pick<SitePageRow, "draft_content">).draft_content as {
    sections?: { kind: string }[];
  };
  const sections = Array.isArray(doc?.sections) ? doc.sections : [];

  // Already has one — adopting the page twice must not give it two widgets.
  if (sections.some((s) => s.kind === "reservations")) return { data: true };

  // Before the footer if there is one, so the widget does not land underneath
  // the colophon.
  const footerAt = sections.findIndex((s) => s.kind === "footer");
  const next = [...sections];
  next.splice(footerAt === -1 ? next.length : footerAt, 0, createSection("reservations"));

  const { error: writeError } = await supabase
    .from("site_pages")
    .update({ draft_content: { ...doc, sections: next } })
    .eq("id", pageId);

  if (writeError) return { error: writeError.message, code: "db_error" };
  return { data: true };
}
