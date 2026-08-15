"use client";

import { useState, useCallback } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SearchCustomers } from "@/app/dashboard/actions/customers";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import type { CustomerListItem } from "@/types/customer";

interface CustomerSearchProps {
  value: CustomerListItem | null;
  onSelect: (customer: CustomerListItem | null) => void;
  onAddNew?: () => void;
}

export function CustomerSearch({ value, onSelect, onAddNew }: CustomerSearchProps) {
  const clerkOrgId = useClerkOrgId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(
    async (q: string) => {
      setQuery(q);
      if (!q.trim() || !clerkOrgId) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await SearchCustomers(clerkOrgId, q, 10);
        setResults(data);
      } finally {
        setLoading(false);
      }
    },
    [clerkOrgId]
  );

  const handleSelect = (customer: CustomerListItem) => {
    onSelect(customer);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const handleClear = () => {
    onSelect(null);
  };

  const displayName = value
    ? value.name || value.email || value.phone || "Customer"
    : null;

  return (
    <div className="flex items-center gap-2">
      {/* Wrapper is the flex child (a plain div has no shrink-0 like Button does),
          so flex-1 + min-w-0 lets the trigger shrink and the "Clear" button stays
          inside the column instead of overflowing/clipping. */}
      <div className="flex-1 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* Borderless filled control (§4.2). */}
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between rounded-full border-0 bg-muted/60 px-3 font-normal shadow-none hover:bg-muted"
          >
            <span className={cn("truncate", !displayName && "text-muted-foreground")}>
              {displayName ?? "Search by email, phone or name"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(380px,calc(100vw-2rem))] rounded-2xl p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search customers..."
              value={query}
              onValueChange={handleSearch}
            />
            <CommandList>
              {loading && (
                <CommandEmpty>Searching...</CommandEmpty>
              )}
              {!loading && query.trim() && results.length === 0 && (
                <CommandEmpty>No customers found.</CommandEmpty>
              )}
              {!loading && !query.trim() && (
                <CommandEmpty>Type to search customers.</CommandEmpty>
              )}
              {results.length > 0 && (
                <CommandGroup heading="Customers">
                  {results.map((customer) => {
                    const name =
                      customer.name ||
                      customer.email ||
                      customer.phone ||
                      "Unknown";
                    return (
                      <CommandItem
                        key={customer.id}
                        value={customer.id}
                        onSelect={() => handleSelect(customer)}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value?.id === customer.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{name}</span>
                          {customer.email && (
                            <span className="text-xs text-muted-foreground">
                              {customer.email}
                            </span>
                          )}
                          {customer.phone && !customer.email && (
                            <span className="text-xs text-muted-foreground">
                              {customer.phone}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {onAddNew && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                        onAddNew();
                      }}
                      className="cursor-pointer text-[#0C4FD1] dark:text-[#6CA0FF]"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add new customer
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      </div>
      {value && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-9 shrink-0 rounded-full px-3 text-muted-foreground hover:text-foreground"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
