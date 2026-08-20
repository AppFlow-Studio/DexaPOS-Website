import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { ListSubmissions } from "@/app/dashboard/website/actions/forms";
import SubmissionsScreen from "@/components/site-builder/dashboard/SubmissionsScreen";
import { loadSiteContext } from "@/lib/site-builder/site-context";

/** One form's inbox. */

export const dynamic = "force-dynamic";

export default async function FormSubmissionsRoute({
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

  const result = await ListSubmissions(orgId, formId);
  if (!result.data) notFound();

  return (
    <SubmissionsScreen
      clerkOrgId={orgId}
      formId={formId}
      formName={result.data.formName}
      locationId={storefront.locationId}
      columns={result.data.columns}
      rows={result.data.rows}
    />
  );
}
