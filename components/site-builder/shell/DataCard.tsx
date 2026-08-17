"use client";

import { ChevronLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The bordered list every screen in the Website group is made of.
 *
 * Search, column headings, rows, pagination and the empty state in one place,
 * so that Pages, Forms, Events and Careers cannot drift into four slightly
 * different tables. The caller supplies the row's cells and nothing else.
 *
 * **Alignment is a shared grid template, not matching padding.** The search row
 * carries the column headings, so the headings and the cells beneath them are
 * laid out by the same `gridTemplateColumns` string — the one arrangement that
 * cannot fall out of step when a caller adds a column.
 *
 * **Searching is client-side and so is paging.** These lists are a merchant's
 * own pages and forms: tens of rows, already in memory because the server
 * component fetched them to render the screen. A round trip per keystroke would
 * buy nothing and cost the responsiveness that makes the search feel worth using.
 */
export default function DataCard<T>({
  items,
  getKey,
  getSearchText,
  renderRow,
  columns = [],
  gridTemplate,
  searchPlaceholder = "Search",
  emptyLabel,
  emptyIcon: EmptyIcon,
  pageSize = 7,
}: {
  items: T[];
  getKey: (item: T) => string;
  /** Everything the search box should match against, already concatenated. */
  getSearchText: (item: T) => string;
  /** The row's cells, in the order `gridTemplate` describes. */
  renderRow: (item: T) => React.ReactNode;
  /** Headings for every column after the first. The first is the search box. */
  columns?: string[];
  /** e.g. `"1fr 120px 140px"` — one track per cell `renderRow` returns. */
  gridTemplate: string;
  searchPlaceholder?: string;
  emptyLabel: string;
  emptyIcon?: LucideIcon;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const term = query.trim().toLowerCase();

  const matches = useMemo(
    () => (term ? items.filter((item) => getSearchText(item).toLowerCase().includes(term)) : items),
    // `getSearchText` is typically an inline arrow and would change identity on
    // every render; the data it reads is `items`, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, term],
  );

  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));

  // Clamp during render rather than in an effect: deleting the last row of the
  // final page, or typing a search that shortens the list, would otherwise paint
  // an empty page once before correcting itself.
  const current = Math.min(page, pageCount);
  if (current !== page) setPage(current);

  const start = (current - 1) * pageSize;
  const visible = matches.slice(start, start + pageSize);

  // Nothing exists yet. Owner shows the bare empty row here — no search box to
  // filter nothing with, no illustration, no call to action competing with the
  // one already in the header.
  if (items.length === 0) {
    return (
      <div className="rounded-xl border">
        <EmptyRow icon={EmptyIcon} label={emptyLabel} />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border">
        <div
          className="grid items-center gap-3 border-b border-dashed px-4 py-2.5"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <label className="relative flex min-w-0 items-center">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full min-w-0 rounded-md bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </label>

          {columns.map((label) => (
            <span key={label} className="truncate text-xs text-muted-foreground">
              {label}
            </span>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((item) => (
              <li
                key={getKey(item)}
                className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {renderRow(item)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {matches.length > pageSize && (
        <Pagination
          page={current}
          pageCount={pageCount}
          total={matches.length}
          from={start + 1}
          to={start + visible.length}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function EmptyRow({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
      {Icon && <Icon className="size-4 shrink-0" />}
      {label}
    </p>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
        <PageButton label="Previous page" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="size-4" />
        </PageButton>

        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <button
            key={number}
            type="button"
            aria-label={`Page ${number}`}
            aria-current={number === page}
            onClick={() => onChange(number)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors",
              number === page
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {number}
          </button>
        ))}

        <PageButton
          label="Next page"
          disabled={page === pageCount}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </PageButton>
      </div>

      <span className="text-xs tabular-nums text-muted-foreground">
        {from}-{to} of {total}
      </span>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
