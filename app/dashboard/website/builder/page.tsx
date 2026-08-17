import { redirect } from "next/navigation";

/**
 * The editor moved to `/dashboard/website/pages/{pageId}`, matching Owner's
 * shape and putting the page's identity in the path rather than a query string.
 *
 * This shim keeps every bookmark, audit-log link and shared URL working. A
 * request with no `page` resolves to `home`, which the editor route understands
 * and turns into the merchant's home page.
 */

export const dynamic = "force-dynamic";

export default async function BuilderRedirect({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; page?: string }>;
}) {
  const { location, page } = await searchParams;

  const target = `/dashboard/website/pages/${encodeURIComponent(page ?? "home")}`;
  redirect(location ? `${target}?location=${encodeURIComponent(location)}` : target);
}
