"use client";

import {
  ArrowRight,
  FileText,
  Home,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CreatePage, DeletePage, RenamePage } from "@/app/dashboard/website/actions/pages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SitePageSummary } from "@/lib/site-builder/db-types";
import { checkPagePath, slugifyPagePath } from "@/lib/site-builder/reserved-paths";

/**
 * The site's pages, and everything a merchant can do to one.
 *
 * Multi-page has been modelled end to end since the foundation migration and
 * invisible in the product: `CreatePage`, `RenamePage` and `DeletePage` all
 * existed with nothing calling them. This is the surface that calls them.
 *
 * Deliberately a list rather than a grid of cards. A page's identity is its
 * **address** — two pages called "Menu" at `/menu` and `/menus` are a mistake a
 * merchant needs to see at a glance, and a card layout hides the one column
 * that would show it.
 */
export default function PageListCard({
  id,
  clerkOrgId,
  siteId,
  locationId,
  pages,
}: {
  id?: string;
  clerkOrgId: string;
  siteId: string;
  locationId: string;
  pages: SitePageSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SitePageSummary | null>(null);
  const [deleting, setDeleting] = useState<SitePageSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const builderHref = (page: SitePageSummary) =>
    `/dashboard/website/builder?location=${encodeURIComponent(locationId)}&page=${encodeURIComponent(page.id)}`;

  const remove = (page: SitePageSummary) => {
    startTransition(async () => {
      const result = await DeletePage(clerkOrgId, page.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDeleting(null);
      toast.success(`“${page.title}” was removed`);
      router.refresh();
    });
  };

  return (
    <Card id={id}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Pages</CardTitle>
          <CardDescription>
            Every page on your website. The home page is what visitors see first.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New page
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {pages.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No pages yet. Your home page is created with your website.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {pages.map((page) => (
              <li
                key={page.id}
                className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {page.is_home ? <Home className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{page.title}</p>
                      {page.is_home && (
                        <Badge variant="secondary" className="h-5">
                          Home
                        </Badge>
                      )}
                      {/* Says whether guests can see it, not what the row is. */}
                      <Badge
                        variant={page.published_version_id ? "default" : "outline"}
                        className="h-5"
                      >
                        {page.published_version_id ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      /{page.path}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={builderHref(page)}>
                      Edit
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Options for ${page.title}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setRenaming(page)}>
                        <PencilLine />
                        Rename
                      </DropdownMenuItem>
                      {/* The home page has no delete: removing it would leave
                          the site with no root, and `DeletePage` refuses it
                          anyway — better not to offer the action than to offer
                          one that always fails. */}
                      {!page.is_home && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(page)}>
                            <Trash2 />
                            Remove
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PageDialog
        open={creating}
        mode="create"
        onOpenChange={setCreating}
        onSubmit={(title, path, done) =>
          startTransition(async () => {
            const result = await CreatePage(clerkOrgId, siteId, { title, path });
            if (result.error) {
              toast.error(result.error);
              return;
            }
            done();
            toast.success(`“${title}” was created`);
            router.refresh();
          })
        }
      />

      <PageDialog
        open={renaming !== null}
        mode="rename"
        page={renaming ?? undefined}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={(title, path, done) =>
          startTransition(async () => {
            if (!renaming) return;
            const result = await RenamePage(clerkOrgId, renaming.id, {
              title,
              // The home page's address is structural; the action refuses to
              // change it, so it is never sent.
              ...(renaming.is_home ? {} : { path }),
            });
            if (result.error) {
              toast.error(result.error);
              return;
            }
            done();
            toast.success("Page updated");
            router.refresh();
          })
        }
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.published_version_id
                ? "This page is live. Removing it takes it off your website, and anyone following a link to it will find nothing there. Its version history is kept."
                : "This page has never been published, so no guest has seen it. Its version history is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove(deleting);
              }}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove the page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/**
 * One dialog for both creating and renaming.
 *
 * The address is derived from the title while the merchant has not touched it,
 * then left alone the moment they do — the same rule the section editors use.
 * Typing a title and getting a sensible URL for free is the common case;
 * silently rewriting an address someone chose is never wanted.
 */
function PageDialog({
  open,
  mode,
  page,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "rename";
  page?: SitePageSummary;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string, path: string, done: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [pathEdited, setPathEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed whenever the dialog opens on a different page.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = page?.id ?? "new";
  if (open && seededFor !== key) {
    setSeededFor(key);
    setTitle(page?.title ?? "");
    setPath(page?.path ?? "");
    setPathEdited(Boolean(page));
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const isHome = page?.is_home ?? false;
  const effectivePath = pathEdited ? path : slugifyPagePath(title);
  const check = checkPagePath(effectivePath);
  const trimmedTitle = title.trim();
  // The home page keeps its empty path, so it is exempt from the path check.
  const valid = trimmedTitle.length > 0 && (isHome || (effectivePath !== "" && check.ok));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New page" : `Rename “${page?.title}”`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Give the page a name. Its web address is suggested from the name and you can change it."
              : isHome
                ? "The home page's address cannot be changed — it is the root of your website, and every published link points at it."
                : "Changing the address breaks links that already point at this page."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Page name</span>
            <input
              autoFocus
              type="text"
              value={title}
              placeholder="About us"
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>

          {!isHome && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Web address</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">/</span>
                <input
                  type="text"
                  value={effectivePath}
                  placeholder="about-us"
                  onChange={(e) => {
                    setPathEdited(true);
                    setPath(e.target.value);
                  }}
                  className="h-9 w-full rounded-md border bg-transparent px-3 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              {effectivePath !== "" && !check.ok && (
                <span className="mt-1.5 block text-xs text-destructive">{check.message}</span>
              )}
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!valid || submitting}
            onClick={() => {
              setSubmitting(true);
              onSubmit(trimmedTitle, effectivePath, () => {
                setSubmitting(false);
                onOpenChange(false);
              });
              // The transition owns the pending state from here; re-enable so a
              // failed submit does not leave a permanently dead button.
              setTimeout(() => setSubmitting(false), 0);
            }}
          >
            {mode === "create" ? "Create page" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
