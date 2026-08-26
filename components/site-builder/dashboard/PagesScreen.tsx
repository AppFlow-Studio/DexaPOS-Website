"use client";

import { CloudOff, ExternalLink, FileText, Palette, Plus, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DeletePage } from "@/app/dashboard/website/actions/pages";
import { PublishPage, UnpublishPage } from "@/app/dashboard/website/actions/publish";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import { sitePublicUrl } from "@/lib/site-builder/public-url";
import { websiteRoutes } from "../routes";
import DataCard from "../shell/DataCard";
import ConfirmByTyping from "../shell/ConfirmByTyping";
import ListHeader from "../shell/ListHeader";
import StatusPill, { type StatusAction } from "../shell/StatusPill";
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
 * **Rows carry no edit button and no overflow menu.** Renaming lives in the
 * editor's page settings, one click away through the title — the address a page
 * lives at is only meaningful next to the page it addresses.
 *
 * Deleting is the exception, and it is deliberate: it now sits in the status
 * menu here as well as in page settings, because a merchant clearing out a page
 * they never finished should not have to open it first. It is guarded by a
 * typed confirmation rather than a yes/no, since there is no undo.
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
  /** The page the delete dialog is asking about, or null when it is closed. */
  const [deleting, setDeleting] = useState<SitePageSummary | null>(null);

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

  const remove = (page: SitePageSummary) => {
    startTransition(async () => {
      const result = await DeletePage(clerkOrgId, page.id);
      if (!result.data) {
        toast.error(result.error ?? `Could not delete “${page.title}”.`);
        return;
      }
      setDeleting(null);
      toast.success(`“${page.title}” was deleted.`);
      router.refresh();
    });
  };

  /**
   * What a row's status menu offers.
   *
   * The home page is the site's root, so neither destructive option is offered
   * for it: `UnpublishPage` would take it down like any other page and break
   * every link the merchant has ever shared, and `DeletePage` refuses `is_home`
   * server-side anyway. Its menu is therefore `View` alone once published, and
   * nothing at all before then — which is why `StatusPill` reserves the
   * chevron's space rather than shrinking.
   */
  const buildActions = (page: SitePageSummary): StatusAction[] | undefined => {
    const actions: StatusAction[] = [];

    if (page.published_version_id) {
      /*
        The address the page actually lives at, which until now the product
        never told the merchant anywhere. Absent rather than disabled when no
        subdomain is claimed: there is no public address to open yet, and the
        card below the list is already the one thing saying so.
      */
      if (website?.subdomain) {
        actions.push({
          label: "View",
          icon: <ExternalLink />,
          href: sitePublicUrl(website.subdomain, page.path),
        });
      }

      if (!page.is_home) {
        actions.push({
          label: "Unpublish",
          icon: <CloudOff />,
          destructive: true,
          onSelect: () => unpublish(page),
        });
      }
    } else {
      actions.push({ label: "Publish", icon: <Rocket />, onSelect: () => publish(page) });
    }

    if (!page.is_home) {
      actions.push({
        label: "Delete",
        icon: <Trash2 />,
        destructive: true,
        // Opens the dialog rather than deleting. Radix closes the menu on
        // select, so the dialog is rendered outside it — nesting one inside a
        // menu item unmounts it as the menu goes.
        onSelect: () => setDeleting(page),
      });
    }

    return actions.length ? actions : undefined;
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
              className="min-w-0 truncate text-sm font-medium hover:underline"
            >
              {page.title}
            </Link>

            <span className="truncate text-xs text-muted-foreground">
              {formatUpdated(page.updated_at)}
            </span>

            <span>
              <StatusPill
                tone={page.published_version_id ? "published" : "draft"}
                label={page.published_version_id ? "Published" : "Unpublished"}
                disabled={pending}
                actions={buildActions(page)}
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

      <ConfirmByTyping
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description={
          deleting?.published_version_id
            ? "This page is live. Deleting it takes it off your website immediately, and anyone following a link to it will find nothing there. This cannot be undone."
            : "This page has never been published, so no guest has seen it. This cannot be undone."
        }
        actionLabel="Delete page"
        cancelLabel="Keep it"
        pending={pending}
        onConfirm={() => deleting && remove(deleting)}
      />
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
