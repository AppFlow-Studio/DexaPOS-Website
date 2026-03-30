"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";

interface MenuItemOption {
  id: string;
  name: string;
  price: number;
  category_name?: string;
}

interface RawMenuItem {
  id: string;
  name: string;
  price?: number | null;
  category_name?: string | null;
}

interface ItemSearchProps {
  onSelect: (item: MenuItemOption) => void;
}

export function ItemSearch({ onSelect }: ItemSearchProps) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MenuItemOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const locationId =
          selectedLocationId === "all" ? undefined : selectedLocationId;
        const { GetMenuItems } = await import(
          "@/app/dashboard/actions/menu-items"
        );
        const data = await GetMenuItems(clerkOrgId!, locationId);
        setItems(
          (data || []).map((item: RawMenuItem) => ({
            id: item.id,
            name: item.name,
            price: item.price ?? 0,
            category_name: item.category_name ?? undefined,
          }))
        );
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [open, clerkOrgId, selectedLocationId]);

  const filtered = query.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const handleSelect = (item: MenuItemOption) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-muted-foreground font-normal">
          <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0" />
          Search for an item or service
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search items..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && <CommandEmpty>Loading items...</CommandEmpty>}
            {!loading && filtered.length === 0 && (
              <CommandEmpty>No items found.</CommandEmpty>
            )}
            {!loading && filtered.length > 0 && (
              <CommandGroup heading="Menu Items">
                {filtered.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item)}
                    className="cursor-pointer justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{item.name}</span>
                      {item.category_name && (
                        <span className="text-xs text-muted-foreground">
                          {item.category_name}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      ${item.price.toFixed(2)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
