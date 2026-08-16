"use client";

import * as React from "react";
import { Check, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface FacetOption {
  /** Stable key the table filter matches on (already normalized). */
  value: string;
  label: string;
  count: number;
}

interface PaymentFacetFilterProps {
  title: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Show a search box — worth it for card brands, noise for 4 entry modes. */
  searchable?: boolean;
}

/**
 * Multi-select facet filter. Options are derived from the rows actually present,
 * so a merchant never sees a value that would return nothing.
 */
export function PaymentFacetFilter({
  title,
  options,
  selected,
  onChange,
  searchable = false,
}: PaymentFacetFilterProps) {
  const selectedSet = new Set(selected);

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange([...next]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
          disabled={options.length === 0}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedSet.size > 0 && (
            <>
              <Badge
                variant="secondary"
                className="ml-2 rounded-full border-0 px-2 font-normal lg:hidden"
              >
                {selectedSet.size}
              </Badge>
              <div className="ml-2 hidden gap-1 lg:flex">
                {selectedSet.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full border-0 px-2 font-normal"
                  >
                    {selectedSet.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => selectedSet.has(o.value))
                    .map((o) => (
                      <Badge
                        key={o.value}
                        variant="secondary"
                        className="rounded-full border-0 px-2 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 overflow-hidden rounded-2xl p-0"
        align="start"
      >
        <Command>
          {searchable && <CommandInput placeholder={title} />}
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedSet.size > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => onChange([])}
                  className="justify-center text-center"
                >
                  Clear filter
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
