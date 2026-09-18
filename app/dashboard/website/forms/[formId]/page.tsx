import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import { notFound, redirect } from "next/navigation";

import { GetForm } from "@/app/dashboard/website/actions/forms";
import FormBuilder from "@/components/site-builder/builder/FormBuilder";
import { OwnerOnlyPage } from "@/components/site-builder/dashboard/OwnerOnlyPage";
import { isMerchantOwnerForOrg } from "@/lib/site-builder/owner";
import {
  buildRenderContext,
  loadSiteContext,
  resolveWebsiteLocation,
} from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The form builder — the page editor's shell, editing a form. */

export const dynamic = "force-dynamic";

export default async function FormEditorRoute({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const { formId } = await params;
  const { location } = await searchParams;

  const scope = await resolveWebsiteLocation(orgId, location);
  if (!scope || scope.kind === "no-storefront") redirect("/dashboard/website/pages");
  if (scope.kind === "pick") redirect("/dashboard/website/pages");

  const storefront = await loadSiteContext(orgId, scope.locationId);
  if (!storefront) redirect("/dashboard/website/pages");

  // Editing forms is owner-only. Managers manage submissions (a separate route),
  // but the form builder mutates, so a non-owner sees the read-only notice.
  if (!(await isMerchantOwnerForOrg(orgId))) {
    return (
      <OwnerOnlyPage
        locationId={storefront.locationId}
        title="Editing forms is view only"
        description="Only the store owner can edit forms."
      />
    );
  }

  const result = await GetForm(orgId, formId);
  if (!result.data) notFound();

  // The response count is only for the toolbar button's label, so a failed read
  // costs a number rather than the screen.
  const supabase = createServerSupabaseClient();
  const { data: counts } = await supabase
    .from("site_forms")
    .select("submission_count")
    .eq("id", formId)
    .maybeSingle();

  // The merchant's own theme, resolved by the same function the canvas and the
  // live page use, so the form preview cannot show one brand colour while the
  // page carrying the form shows another.
  const { theme } = buildRenderContext(storefront, "preview");

  return (
    <FormBuilder
      clerkOrgId={orgId}
      formId={result.data.id}
      locationId={storefront.locationId}
      theme={theme}
      initialDoc={result.data.doc}
      initialRevision={result.data.revision}
      initialPublishedAt={result.data.publishedAt}
      submissionCount={Number(counts?.submission_count ?? 0)}
    />
  );
}
