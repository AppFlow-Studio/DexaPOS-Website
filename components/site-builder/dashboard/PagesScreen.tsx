"use client";

import { CloudOff, FileText, Home, Palette, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { PublishPage, UnpublishPage } from "@/app/dashboard/website/actions/publish";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import { websiteRoutes } from "../routes";
import DataCard from "../shell/DataCard";
import ListHeader from "../shell/ListHeader";
import StatusPill from "../shell/StatusPill";
import WebAddressCard from "./WebAddressCard";

/**
 * The Website landing screen.
 *
 * This replaced an overview page carrying a four-step readiness checklist, a
 * "next best action" panel and a card describing the ordering storefront. All
 * of it was true and none of it was what a merchant came for — which is the
 * list of their pages. Owner puts that list first and has no overview at all,
 * and the checklist's real content survives where it belongs: the one genuinely
 * blocking step, claiming a web address, is the card beneath the list.
 *
 * **Rows carry no edit button and no overflow menu.** Renaming and deleting a
 * page live in the editor's page settings, one click away through the title.
 * Two routes to the same operation is exactly the duplication this rebuild is
 * removing, and the list is the wrong home for it: the address a page lives at
 * is only meaningful next to the page it addresses.
 */
export default function PagesScreen({
  clerkOrgId,
  locationId,
  website,
  storeName,
  pages,
}: {
  clerkOrgId: string;
  locationId: string;
  website: MerchantSiteRow | null;
  storeName: string;
  pages: SitePageSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isPublished = pages.some((page) => page.published_version_id);

  const publish = (page: SitePageSummary) => {
    startTransition(async () => {
      const result = await PublishPage(clerkOrgId, page.id);
      if (!result.data) {
        // Publishing from a list cannot show a merchant *where* the problem is,
        // so it says which page and sends them to the one screen that can.
        toast.error(result.error ?? `Could not publish “${page.title}”.`, {
          action: {
            label: "Open page",
            onClick: () => router.push(websiteRoutes.editor(locationId, page.id)),
          },
        });
        return;
      }
      toast.success(
        result.data.unchanged
          ? `“${page.title}” was already up to date.`
          : `“${page.title}” is published.`,
      );
      router.refresh();
    });
  };

  const unpublish = (page: SitePageSummary) => {
    startTransition(async () => {
      const result = await UnpublishPage(clerkOrgId, page.id);
      if (!result.data) {
        toast.error(result.error ?? `Could not unpublish “${page.title}”.`);
        return;
      }
      toast.success(
        result.data.siteReverted
          ? `“${page.title}” was your last live page — your website is offline.`
          : `“${page.title}” is no longer live.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <ListHeader
        title="Pages"
        subtitle="Manage pages in your website."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={websiteRoutes.style(locationId)}>
                <Palette className="size-4" />
                Change Style
              </Link>
            </Button>
            <Button asChild>
              <Link href={websiteRoutes.newPage(locationId)}>
                <Plus className="size-4" />
                New Page
              </Link>
            </Button>
          </>
        }
      />

      <DataCard
        items={pages}
        getKey={(page) => page.id}
        getSearchText={(page) => `${page.title} ${page.path}`}
        columns={["Updated", "Status"]}
        gridTemplate="minmax(0,1fr) 110px 130px"
        emptyLabel="No pages yet"
        emptyIcon={FileText}
        renderRow={(page) => (
          <>
            <Link
              href={websiteRoutes.editor(locationId, page.id)}
              className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
            >
              {page.is_home ? (
                <Home className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{page.title}</span>
            </Link>

            <span className="truncate text-xs text-muted-foreground">
              {formatUpdated(page.updated_at)}
            </span>

            <span>
              <StatusPill
                tone={page.published_version_id ? "published" : "draft"}
                label={page.published_version_id ? "Published" : "Unpublished"}
                disabled={pending}
                // The home page is the site's root. `UnpublishPage` will take it
                // down like any other, but offering that here would let a
                // merchant break every link they have ever shared from a list
                // where the consequence is invisible.
                actions={
                  page.is_home && page.published_version_id
                    ? undefined
                    : page.published_version_id
                      ? [
                          {
                            label: "Unpublish",
                            icon: <CloudOff />,
                            destructive: true,
                            onSelect: () => unpublish(page),
                          },
                        ]
                      : [
                          {
                            label: "Publish",
                            icon: <Rocket />,
                            onSelect: () => publish(page),
                          },
                        ]
                }
              />
            </span>
          </>
        )}
      />

      {website && (
        <WebAddressCard
          clerkOrgId={clerkOrgId}
          siteId={website.id}
          storeName={storeName}
          subdomain={website.subdomain}
          isPublished={isPublished}
        />
      )}
    </div>
  );
}

/** Short and relative — a page list is scanned, not audited. */
function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
