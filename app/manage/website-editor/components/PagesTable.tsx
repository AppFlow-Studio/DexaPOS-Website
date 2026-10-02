"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MutedSelect } from "@/components/cms/cms-fields";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { ConfirmDialog } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import { WEBSITE_EDITOR_HOME, pageEditorHref, pagePreviewHref, routeToSlug } from "../lib/paths";

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

export interface PagesListState {
  q: string;
  category: string;
  status: string;
  page: number;
}

const UNCATEGORISED = "other";
const COLUMN_COUNT = 6;
const URL_DEFAULTS: Record<keyof PagesListState, string> = { q: "", category: "all", status: "all", page: "1" };

/** The list's state as a query string, with defaults left out so a plain visit keeps a clean address. */
function listQueryOf(state: PagesListState) {
  const params = new URLSearchParams();
  for (const key of Object.keys(URL_DEFAULTS) as (keyof PagesListState)[]) {
    const value = String(state[key]);
    if (value !== URL_DEFAULTS[key]) params.set(key, value);
  }
  return params.toString();
}

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

function pageName(page: PageRow) {
  return page.cms_title || page.title || page.route;
}

function PageRowMenu({
  page,
  editHref,
  busy,
  onDuplicate,
  onDelete,
}: {
  page: PageRow;
  editHref: string;
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
          aria-label={`Actions for ${pageName(page)}`}
          disabled={busy}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={editHref}>
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
 * Every CMS page: a §5.2 toolbar, then a `variant="data"` table from `md` with
 * essential-only record cards below (§5.3), paged at 10 (§5.7). Each row and
 * card links to the page's editor (§5.9); the search, filters and page live in
 * the URL so "Back to Pages" lands on the same page of 10.
 */
export function PagesTable({
  pages,
  categories,
  initialState,
}: {
  pages: PageRow[];
  categories: CategoryOption[];
  initialState: PagesListState;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialState.q);
  const [category, setCategory] = useState(initialState.category);
  const [status, setStatus] = useState(initialState.status);
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

  const { pageRows, pagination, setPage } = useClientPagination(filtered, 10, initialState.page);
  const filtersActive = search !== "" || category !== "all" || status !== "all";

  // `replaceState` is tracked by the Next router but never round-trips to the
  // server, so typing in the search box costs nothing.
  const listQuery = listQueryOf({ q: search, category, status, page: pagination.page });
  useEffect(() => {
    window.history.replaceState(null, "", listQuery ? `${WEBSITE_EDITOR_HOME}?${listQuery}` : WEBSITE_EDITOR_HOME);
  }, [listQuery]);

  const editHref = (page: PageRow) => pageEditorHref(page.route, listQuery);

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
      toast.success(`Duplicated ${pageName(page)}`);
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
      toast.success(`Deleted ${pageName(page)}`);
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

      {/* §5.3: page, route and status from `md`; updated joins at `lg`, category
          at `xl`. Fixed layout keeps every row one line (§5.7). */}
      <Table variant="data" bounded={false} containerClassName="hidden md:block" className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead className="w-[32%]">Route</TableHead>
            <TableHead className="hidden w-40 xl:table-cell">Category</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="hidden w-32 lg:table-cell">Updated</TableHead>
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
              <TableRow key={page.route} className="relative">
                <TableCell className="truncate font-medium">
                  {/* The whole row is one real link (§5.9); the menu sits above it. */}
                  <Link
                    href={editHref(page)}
                    aria-label={`Edit ${pageName(page)}`}
                    className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                  {pageName(page)}
                </TableCell>
                <TableCell className="truncate font-mono text-xs text-muted-foreground" title={page.route}>
                  {page.route}
                </TableCell>
                <TableCell className="hidden truncate text-muted-foreground xl:table-cell">
                  {categoryName(page.category)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{page.published ? "Published" : "Draft"}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                  <span title={formatTimestamp(page.updated_at)} suppressHydrationWarning>
                    {formatDay(page.updated_at)}
                  </span>
                </TableCell>
                <TableCell className="relative z-10 text-right">
                  <PageRowMenu
                    page={page}
                    editHref={editHref(page)}
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

      {/* Phones: the essentials only (§5.3, D-27). Category and the update time
          are in the editor. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {pageRows.length === 0 ? (
          <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="text-xs text-muted-foreground">{emptyHint}</p>
          </div>
        ) : (
          pageRows.map((page) => (
            <div
              key={page.route}
              className="relative min-w-0 rounded-2xl bg-muted/45 p-4 transition-colors hover:bg-muted"
            >
              <Link
                href={editHref(page)}
                aria-label={`Edit ${pageName(page)}`}
                className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="truncate font-semibold">{pageName(page)}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {page.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="relative z-10 -mt-1 -mr-1 shrink-0">
                  <PageRowMenu
                    page={page}
                    editHref={editHref(page)}
                    busy={busyRoute === page.route}
                    onDuplicate={() => void duplicate(page)}
                    onDelete={() => setPendingDelete(page)}
                  />
                </div>
              </div>
              <div className="mt-3 min-w-0 text-sm">
                <p className="text-xs text-muted-foreground">Route</p>
                <p className="truncate font-mono font-medium">{page.route}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="pages" />
      {/* The pager hides when everything fits on one page; the count still shows (§5.2). */}
      {pagination.totalPages <= 1 && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
          {filtersActive
            ? `${filtered.length} of ${pages.length} pages`
            : `${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
        </p>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this page?"
        description={`${pendingDelete ? pageName(pendingDelete) : "The page"} will be removed from the site. This can't be undone.`}
        confirmLabel="Delete page"
        pendingLabel="Deleting…"
        destructive
        pending={!!pendingDelete && busyRoute === pendingDelete.route}
        onConfirm={() => {
          if (pendingDelete) void remove(pendingDelete);
        }}
      />
    </div>
  );
}
