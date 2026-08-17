import { redirect } from "next/navigation";

/**
 * `/dashboard/website` used to be an overview screen. The Owner-shaped rebuild
 * has no overview — the page list is the landing screen — so this keeps every
 * existing link, bookmark and sidebar entry working rather than moving the
 * merchant's front door without telling anyone.
 */

export const dynamic = "force-dynamic";

export default async function WebsiteRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  redirect(
    location
      ? `/dashboard/website/pages?location=${encodeURIComponent(location)}`
      : "/dashboard/website/pages",
  );
}
