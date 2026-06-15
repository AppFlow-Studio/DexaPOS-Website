"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useFuzzySearchList, Highlight } from "@nozbe/microfuzz/react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CornerDownLeft,
  Loader2,
  ShoppingCart,
  User as UserIcon,
  Utensils,
} from "lucide-react";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import { SearchRecords } from "@/app/dashboard/actions/global-search";
import {
  NAV_INDEX,
  DEFAULT_RECENT_PATHS,
  type NavSearchItem,
} from "./nav-index";

const RECENTS_KEY = "dexa.globalSearch.recents";
const MAX_RECENTS = 5;
/** How many nav results to show before collapsing behind "See all results". */
const PAGES_PREVIEW_CAP = 7;
/** Group size at which the records "See all results" link appears. */
const RECORDS_PREVIEW_CAP = 6;
/** Debounce (ms) before firing the record-search server action. */
const RECORDS_DEBOUNCE_MS = 250;

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read recently-selected nav paths from localStorage (most-recent first). */
function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(paths: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(paths.slice(0, MAX_RECENTS)));
  } catch {
    /* localStorage unavailable (private mode / quota) — recents are best-effort */
  }
}

const byPath = new Map(NAV_INDEX.map((item) => [item.path, item]));

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const clerkOrgId = useClerkOrgId();
  const selectedLocationId = useLocationStore((s) => s.selectedLocationId);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  // Load recents whenever the palette opens, and reset transient UI state.
  useEffect(() => {
    if (open) {
      const stored = readRecents();
      setRecentPaths(stored.length > 0 ? stored : DEFAULT_RECENT_PATHS);
      setQuery("");
      setDebouncedQuery("");
      setShowAll(false);
    }
  }, [open]);

  // Debounce the query that drives the (networked) record search. Navigation
  // search stays instant off `query`; only records wait for the debounce.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), RECORDS_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // ── Navigation (in-memory fuzzy) ──────────────────────────────────────────
  const getText = useCallback(
    (item: NavSearchItem) => [item.label, item.section, ...(item.keywords ?? [])],
    []
  );

  const mapResultItem = useCallback(
    ({ item, matches }: { item: NavSearchItem; matches: Array<Array<[number, number]> | null> }) => ({
      item,
      ranges: matches[0] ?? null,
    }),
    []
  );

  const navResults = useFuzzySearchList({
    list: NAV_INDEX,
    queryText: query,
    getText,
    mapResultItem,
    // 'aggressive' (classic fuzzy) is required for the typo-tolerance acceptance
    // cases — 'smart' rejects e.g. "invntry" -> Inventory as too poor a match.
    strategy: "aggressive",
  });

  // ── Records (debounced server action) ─────────────────────────────────────
  const recordsEnabled = !!clerkOrgId && debouncedQuery.length >= 2;
  const {
    data: records,
    isFetching: recordsFetching,
  } = useQuery({
    queryKey: ["global-search-records", clerkOrgId, selectedLocationId, debouncedQuery],
    queryFn: () => SearchRecords(clerkOrgId, selectedLocationId, debouncedQuery),
    enabled: recordsEnabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const recentItems = useMemo(
    () =>
      recentPaths
        .map((path) => byPath.get(path))
        .filter((i): i is NavSearchItem => Boolean(i)),
    [recentPaths]
  );

  const visibleNav = showAll ? navResults : navResults.slice(0, PAGES_PREVIEW_CAP);
  const navOverflow = navResults.length > PAGES_PREVIEW_CAP;

  const orders = records?.orders ?? [];
  const customers = records?.customers ?? [];
  const menuItems = records?.menuItems ?? [];
  const hasRecordResults = orders.length > 0 || customers.length > 0 || menuItems.length > 0;
  // Records are loading when we have a query but no fresh data yet for it.
  const recordsLoading = recordsEnabled && recordsFetching;
  const noMatchAtAll =
    isSearching && navResults.length === 0 && !hasRecordResults && !recordsLoading;

  const goTo = useCallback(
    (path: string, recentPath?: string) => {
      if (recentPath) {
        const next = [recentPath, ...recentPaths.filter((p) => p !== recentPath)].slice(0, MAX_RECENTS);
        writeRecents(next);
      }
      onOpenChange(false);
      router.push(path);
    },
    [recentPaths, router, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search pages, orders, customers, items…"
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          setShowAll(false);
        }}
      />
      <CommandList>
        {/* Recent (empty query) */}
        {!isSearching && recentItems.length > 0 && (
          <CommandGroup heading={<GroupHeading label="Recent" count={recentItems.length} />}>
            {recentItems.map((item) => (
              <NavRow key={`recent-${item.path}`} item={item} ranges={null} onSelect={() => goTo(item.path, item.path)} />
            ))}
          </CommandGroup>
        )}

        {/* No match anywhere */}
        {noMatchAtAll && (
          <CommandEmpty>No results match &ldquo;{trimmed}&rdquo;.</CommandEmpty>
        )}

        {/* Pages / Navigation */}
        {isSearching && navResults.length > 0 && (
          <CommandGroup heading={<GroupHeading label="Pages" count={navResults.length} />}>
            {visibleNav.map(({ item, ranges }) => (
              <NavRow key={item.path} item={item} ranges={ranges} onSelect={() => goTo(item.path, item.path)} />
            ))}
            {navOverflow && !showAll && (
              <CommandItem
                value="__see_all_pages__"
                onSelect={() => setShowAll(true)}
                className="justify-center text-sm text-primary"
              >
                See all results ({navResults.length}) →
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {/* Records loading */}
        {isSearching && recordsLoading && !hasRecordResults && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching records…
          </div>
        )}

        {/* Orders */}
        {orders.length > 0 && (
          <CommandGroup
            heading={<GroupHeading label="Orders" count={orders.length} loading={recordsLoading} />}
          >
            {orders.slice(0, RECORDS_PREVIEW_CAP).map((o) => {
              const primary = o.display_number || o.order_number;
              const secondary =
                o.customer_name || o.customer_phone || `Order #${o.order_number}`;
              return (
                <RecordRow
                  key={o.id}
                  value={`order-${o.id}`}
                  icon={ShoppingCart}
                  primary={`#${primary}`}
                  secondary={secondary}
                  onSelect={() => goTo(`/dashboard/orders/${o.id}`)}
                />
              );
            })}
            {orders.length > RECORDS_PREVIEW_CAP && (
              <SeeAllRow value="__see_all_orders__" label="See all orders →" onSelect={() => goTo("/dashboard/orders")} />
            )}
          </CommandGroup>
        )}

        {/* Customers */}
        {customers.length > 0 && (
          <CommandGroup heading={<GroupHeading label="Customers" count={customers.length} />}>
            {customers.slice(0, RECORDS_PREVIEW_CAP).map((c) => (
              <RecordRow
                key={c.id}
                value={`customer-${c.id}`}
                icon={UserIcon}
                primary={c.name || c.phone || c.email || "Customer"}
                secondary={c.phone || c.email || ""}
                onSelect={() => goTo(`/dashboard/customers?customerId=${c.id}`)}
              />
            ))}
            {customers.length > RECORDS_PREVIEW_CAP && (
              <SeeAllRow value="__see_all_customers__" label="See all customers →" onSelect={() => goTo("/dashboard/customers")} />
            )}
          </CommandGroup>
        )}

        {/* Menu Items */}
        {menuItems.length > 0 && (
          <CommandGroup heading={<GroupHeading label="Menu Items" count={menuItems.length} />}>
            {menuItems.slice(0, RECORDS_PREVIEW_CAP).map((m) => (
              <RecordRow
                key={m.id}
                value={`item-${m.id}`}
                icon={Utensils}
                primary={m.name}
                secondary="Menu item"
                onSelect={() => goTo(`/dashboard/menu/items/${m.id}`)}
              />
            ))}
            {menuItems.length > RECORDS_PREVIEW_CAP && (
              <SeeAllRow value="__see_all_items__" label="See all items →" onSelect={() => goTo("/dashboard/menu/items")} />
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function GroupHeading({
  label,
  count,
  loading,
}: {
  label: string;
  count: number;
  loading?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <Badge variant="secondary" className="text-[10px] px-1.5">
        {count}
      </Badge>
      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </span>
  );
}

function SeeAllRow({
  value,
  label,
  onSelect,
}: {
  value: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="justify-center text-sm text-primary">
      {label}
    </CommandItem>
  );
}

function NavRow({
  item,
  ranges,
  onSelect,
}: {
  item: NavSearchItem;
  ranges: Array<[number, number]> | null;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <CommandItem value={`${item.path}|${item.label}`} onSelect={onSelect} className="group gap-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {ranges ? <Highlight text={item.label} ranges={ranges} /> : item.label}
        </span>
        <span className="truncate text-xs text-muted-foreground">{item.section}</span>
      </div>
      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-aria-selected:opacity-100" />
    </CommandItem>
  );
}

function RecordRow({
  value,
  icon: Icon,
  primary,
  secondary,
  onSelect,
}: {
  value: string;
  icon: typeof ShoppingCart;
  primary: string;
  secondary: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="group gap-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{primary}</span>
        {secondary && <span className="truncate text-xs text-muted-foreground">{secondary}</span>}
      </div>
      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-aria-selected:opacity-100" />
    </CommandItem>
  );
}
