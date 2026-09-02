import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ListForms } from "@/app/dashboard/website/actions/forms";
import FormsScreen from "@/components/site-builder/dashboard/FormsScreen";
import { Button } from "@/components/ui/button";
import { loadSiteContext } from "@/lib/site-builder/site-context";

/**
 * The forms list.
 *
 * Reads rather than creates, like every other Website screen: opening the forms
 * list is not a merchant asking for a website to exist.
 */

export const dynamic = "force-dynamic";

export default async function WebsiteFormsRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) redirect("/dashboard/website/pages");

  const result = await ListForms(orgId);

  // No website yet — the action says so rather than inventing one.
  if (!result.data) return <NoSite locationId={storefront.locationId} />;

  return (
    <FormsScreen clerkOrgId={orgId} locationId={storefront.locationId} forms={result.data} />
  );
}

function NoSite({ locationId }: { locationId: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Create your website before adding forms</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Forms live on your website pages, so start with a home page. Then you can build a contact or
        catering form and drop it onto any page.
      </p>
      <Button className="mt-5" asChild>
        <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(locationId)}`}>
          Create website
        </Link>
      </Button>
    </div>
  );
}
