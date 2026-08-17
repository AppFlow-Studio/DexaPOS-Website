import { redirect } from "next/navigation";

/**
 * The design workspace became `/dashboard/website/style`, matching what the
 * button that opens it has always been called. This shim keeps existing links
 * working.
 */

export const dynamic = "force-dynamic";

export default async function DesignRedirect({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  redirect(
    location
      ? `/dashboard/website/style?location=${encodeURIComponent(location)}`
      : "/dashboard/website/style",
  );
}
