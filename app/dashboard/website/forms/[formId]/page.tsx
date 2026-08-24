import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { GetForm } from "@/app/dashboard/website/actions/forms";
import FormBuilder from "@/components/site-builder/builder/FormBuilder";
import { buildRenderContext, loadSiteContext } from "@/lib/site-builder/site-context";
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
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const { formId } = await params;
  const { location } = await searchParams;

  const storefront = await loadSiteContext(orgId, location);
  if (!storefront) redirect("/dashboard/website/pages");

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
