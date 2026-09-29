"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MutedSelect } from "@/components/cms/cms-fields";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import { pageEditorHref, pagePreviewHref, routeToSlug } from "../lib/paths";

export interface PageRow {
  route: string;
  cms_title: string;
  title: string;
  description: string;
  updated_at: string;
  published: boolean;
  category: string | null;
}

export interface CategoryOption {
  slug: string;
  name: string;
}

const UNCATEGORISED = "other";
const COLUMN_COUNT = 5;

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PageRowMenu({
  page,
  busy,
  onDuplicate,
  onDelete,
}: {
  page: PageRow;
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          aria-label={`Actions for ${page.cms_title || page.route}`}
          disabled={busy}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={pageEditorHref(page.route)}>
            <Pencil aria-hidden /> Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={pagePreviewHref(page.route)} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> Preview
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy aria-hidden /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Every CMS page: a §5.2 toolbar, a `variant="data"` table from `lg` (its fit
 * breakpoint, §5.3) with record cards below, paged at 10 (§5.7).
 */
export function PagesTable({ pages, categories }: { pages: PageRow[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [busyRoute, setBusyRoute] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PageRow | null>(null);

  const categoryName = useMemo(() => {
    const names = new Map(categories.map((c) => [c.slug, c.name]));
    return (slug: string | null) => {
      const key = slug || UNCATEGORISED;
      return names.get(key) || (key === UNCATEGORISED ? "Other" : key);
    };
  }, [categories]);

  // Category order first (as the old grouped list showed it), then route.
  const sorted = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.slug, i]));
    const rank = (slug: string | null) => order.get(slug || UNCATEGORISED) ?? Number.MAX_SAFE_INTEGER;
    return [...pages].sort((a, b) => rank(a.category) - rank(b.category) || a.route.localeCompare(b.route));
  }, [pages, categories]);

  const categoryOptions = useMemo(() => {
    const used = new Set(pages.map((p) => p.category || UNCATEGORISED));
    const known = categories.filter((c) => used.has(c.slug)).map((c) => ({ value: c.slug, label: c.name }));
    const unknown = [...used]
      .filter((slug) => !categories.some((c) => c.slug === slug))
      .map((slug) => ({ value: slug, label: categoryName(slug) }));
    return [{ value: "all", label: "All categories" }, ...known, ...unknown];
  }, [pages, categories, categoryName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((page) => {
      if (category !== "all" && (page.category || UNCATEGORISED) !== category) return false;
      if (status === "published" && !page.published) return false;
      if (status === "draft" && page.published) return false;
      if (!q) return true;
      return (
        page.route.toLowerCase().includes(q) ||
        (page.cms_title || "").toLowerCase().includes(q) ||
        (page.title || "").toLowerCase().includes(q)
      );
    });
  }, [sorted, search, category, status]);

  const { pageRows, pagination, setPage } = useClientPagination(filtered, 10);
  const filtersActive = search !== "" || category !== "all" || status !== "all";

  const withFilterReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const duplicate = async (page: PageRow) => {
    setBusyRoute(page.route);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(routeToSlug(page.route))}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success(`Duplicated ${page.cms_title || page.route}`);
      router.refresh();
    } catch {
      toast.error("Couldn't duplicate the page");
    } finally {
      setBusyRoute(null);
    }
  };

  const remove = async (page: PageRow) => {
    setBusyRoute(page.route);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(routeToSlug(page.route))}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(`Deleted ${page.cms_title || page.route}`);
      router.refresh();
    } catch {
      toast.error("Couldn't delete the page");
    } finally {
      setBusyRoute(null);
      setPendingDelete(null);
    }
  };

  const emptyTitle = pages.length === 0 ? "No pages yet" : "No pages match these filters";
  const emptyHint =
    pages.length === 0
      ? "Create one with New page and it will appear here."
      : "Clear the search or filters to widen the results.";

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" aria-hidden />
          <Input
            value={search}
            onChange={(e) => withFilterReset(setSearch)(e.target.value)}
            placeholder="Search by title or route"
            aria-label="Search pages"
            className="h-10 pl-10"
          />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <MutedSelect
            ariaLabel="Category"
            value={category}
            onValueChange={withFilterReset(setCategory)}
            options={categoryOptions}
            className="h-9 px-3 text-[0.8125rem] sm:w-44"
          />
          <MutedSelect
            ariaLabel="Status"
            value={status}
            onValueChange={withFilterReset(setStatus)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
            ]}
            className="h-9 px-3 text-[0.8125rem] sm:w-36"
          />
          {filtersActive && (
            <Button
              variant="ghost"
              className="col-span-2 h-9 px-4 text-[0.8125rem] font-medium"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setStatus("all");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <Table variant="data" containerClassName="hidden lg:block" className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center">
                <p className="text-sm font-medium">{emptyTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((page) => (
              <TableRow key={page.route}>
                <TableCell className="max-w-[22rem]">
                  <Link
                    href={pageEditorHref(page.route)}
                    className="block truncate font-medium hover:underline hover:underline-offset-2"
                  >
                    {page.cms_title || page.title || page.route}
                  </Link>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{page.route}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{categoryName(page.category)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="w-fit rounded-full border-0 px-2.5 text-xs font-medium">
                    {page.published ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  <span title={formatTimestamp(page.updated_at)} suppressHydrationWarning>
                    {formatDay(page.updated_at)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <PageRowMenu
                    page={page}
                    busy={busyRoute === page.route}
                    onDuplicate={() => void duplicate(page)}
                    onDelete={() => setPendingDelete(page)}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {pageRows.length === 0 ? (
          <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="text-xs text-muted-foreground">{emptyHint}</p>
          </div>
        ) : (
          pageRows.map((page) => (
            <div key={page.route} className="relative min-w-0 rounded-2xl bg-muted/45 p-4">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={pageEditorHref(page.route)}
                    className="block truncate font-medium after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                  >
                    {page.cms_title || page.title || page.route}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted-foreground">{page.route}</p>
                </div>
                <div className="relative z-10 -mt-1 -mr-1">
                  <PageRowMenu
                    page={page}
                    busy={busyRoute === page.route}
                    onDuplicate={() => void duplicate(page)}
                    onDelete={() => setPendingDelete(page)}
                  />
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Category</dt>
                  <dd className="truncate font-medium">{categoryName(page.category)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="truncate font-medium">{page.published ? "Published" : "Draft"}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-muted-foreground">Updated</dt>
                  <dd className="truncate font-medium tabular-nums" suppressHydrationWarning>
                    {formatTimestamp(page.updated_at)}
                  </dd>
                </div>
              </dl>
            </div>
          ))
        )}
      </div>

      {pagination.total > 0 && pagination.total <= pagination.pageSize && (
        <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
          {pagination.total} {pagination.total === 1 ? "page" : "pages"}
        </p>
      )}
      <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="pages" />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.cms_title || pendingDelete?.route} will be removed from the site. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={!!busyRoute}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) void remove(pendingDelete);
              }}
            >
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
