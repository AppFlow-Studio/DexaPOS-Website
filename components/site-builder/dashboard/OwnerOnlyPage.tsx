import Link from "next/link";

import { Button } from "@/components/ui/button";
import { websiteRoutes } from "@/components/site-builder/routes";
import { OwnerOnlyBanner } from "./OwnerOnlyBanner";

/**
 * Full-page "view only" state for website-builder sub-pages that are purely
 * editing surfaces (style, settings, tracking, new page). Website editing is
 * owner-only (product decision 2026-09-13); non-owners are sent here instead of
 * the editor so they never see controls that would fail server-side.
 *
 * Rendered from server route components (which resolve ownership with
 * `isMerchantOwnerForOrg`), so this is a plain server component that composes the
 * client `OwnerOnlyBanner`.
 */
export function OwnerOnlyPage({
  locationId,
  title,
  description,
}: {
  locationId?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 sm:p-6 lg:p-8">
      <OwnerOnlyBanner />
      <div className="rounded-2xl border bg-card p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {description ?? "Only the store owner can change the website."}
        </p>
        <Button className="mt-4" asChild>
          <Link href={websiteRoutes.pages(locationId)}>Back to pages</Link>
        </Button>
      </div>
    </div>
  );
}
