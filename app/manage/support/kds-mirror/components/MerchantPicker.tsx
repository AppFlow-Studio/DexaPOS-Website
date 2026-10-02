"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useSupportMerchant,
  useSupportMerchantSearch,
} from "../hooks/useKdsMirror";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Searchable merchant picker.
 *
 * A plain <Select> here meant fetching and rendering every merchant on the
 * platform, which is fine at ten tenants and useless at a few hundred: the
 * payload grows without bound and nobody can find a name by scrolling. This
 * searches server-side against name and dba_name, capped per request.
 *
 * `shouldFilter={false}` is important -- cmdk's built-in fuzzy filter would
 * re-filter the already-filtered server results against the same query and
 * quietly hide valid matches (a merchant whose dba_name matched but whose
 * name did not).
 */
export function MerchantPicker({
  merchantId,
  onMerchantChange,
  className,
}: {
  merchantId: string | null;
  onMerchantChange: (merchantId: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(input), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [input]);

  const results = useSupportMerchantSearch(debounced);
  const selected = useSupportMerchant(merchantId);

  const label = selected.data
    ? (selected.data.dba_name ?? selected.data.name)
    : merchantId
      ? selected.isError
        ? "Couldn't load this merchant"
        : "Loading merchant..."
      : null;

  const merchants = results.data ?? [];
  // Loading is not empty (§4.9): any fetch with nothing on screen yet shows
  // the spinner, including the first load and a Retry.
  const isSearching =
    results.isFetching && (debounced !== "" || merchants.length === 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* A combobox trigger shares the muted, borderless field material
            (UI-DESIGN-SYSTEM §4.2), so it is a ghost button with the fill. */}
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label="Merchant"
          className={cn(
            "h-11 w-full min-w-0 justify-between border-0 bg-muted/60 px-3 text-[0.8125rem] font-normal shadow-none hover:bg-muted sm:h-9 sm:w-60",
            className
          )}
        >
          <span
            className={cn("truncate", !label && "text-muted-foreground")}
          >
            {label ?? "Search merchants"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* popover.tsx has no data-slot for the global overlay radius, so the
          radius is set here (§4.6). */}
      <PopoverContent
        className="w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or DBA..."
            value={input}
            onValueChange={setInput}
          />
          <CommandList>
            {/* A failed search is not "no match" (§4.9). */}
            {results.isError && !results.isFetching ? (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                <p className="text-sm font-medium">
                  We couldn&rsquo;t search merchants
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4"
                  onClick={() => void results.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : isSearching && merchants.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching
              </div>
            ) : (
              <>
                <CommandEmpty>No merchant matches that.</CommandEmpty>
                {merchants.map((merchant) => (
                  <CommandItem
                    key={merchant.id}
                    value={merchant.id}
                    onSelect={() => {
                      onMerchantChange(merchant.id);
                      setOpen(false);
                      setInput("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        merchantId === merchant.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {merchant.dba_name ?? merchant.name}
                    </span>
                    {merchant.dba_name &&
                      merchant.dba_name !== merchant.name && (
                        <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                          {merchant.name}
                        </span>
                      )}
                  </CommandItem>
                ))}
                {/* The server caps each search, so say so rather than letting
                    someone assume a short list is the whole platform. */}
                {merchants.length >= 20 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Showing the first {merchants.length}. Keep typing to narrow.
                  </p>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
