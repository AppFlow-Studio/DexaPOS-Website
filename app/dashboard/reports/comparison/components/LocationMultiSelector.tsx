"use client";

import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  X,
  MapPin,
  Building2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Location {
  id: string;
  name: string;
}

interface LocationMultiSelectorProps {
  locations: Location[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxSelections?: number;
}

export function LocationMultiSelector({
  locations,
  selectedIds,
  onChange,
  maxSelections = 6,
}: LocationMultiSelectorProps) {
  const [open, setOpen] = React.useState(false);

  const toggleLocation = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      if (selectedIds.length >= maxSelections) {
        toast.error("Maximum Selection Reached", {
          description: `You can only compare up to ${maxSelections} locations at once for better visualization.`,
          icon: <AlertCircle className="h-4 w-4 text-destructive" />,
        });
        return;
      }
      onChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === locations.length) {
      onChange([]);
    } else {
      // Respect max selections even when toggling all?
      // Usually "Select All" should be available if total locations <= maxSelections
      // If > maxSelections, maybe just select the first N
      if (locations.length > maxSelections) {
        toast.warning("Limited Selection", {
          description: `Selected the first ${maxSelections} locations.`,
        });
        onChange(locations.slice(0, maxSelections).map((l) => l.id));
      } else {
        onChange(locations.map((l) => l.id));
      }
    }
  };

  const removeLocation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(selectedIds.filter((i) => i !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-auto min-h-11 w-full justify-between border-0 bg-muted/60 py-2 shadow-none hover:bg-muted"
          >
            <div className="flex flex-wrap gap-1 items-center max-w-[90%]">
              {selectedIds.length === 0 ? (
                <span className="text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Select locations to compare...
                </span>
              ) : selectedIds.length === locations.length ? (
                <div className="flex items-center gap-2 font-medium">
                  <Building2 className="h-4 w-4 text-primary" />
                  All Locations Selected
                </div>
              ) : (
                <>
                  <Badge
                    variant="secondary"
                    className="bg-[#0C4FD1]/10 text-[#0C4FD1] dark:text-[#6CA0FF]"
                  >
                    {selectedIds.length} Selected
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-1">
                    {locations
                      .filter((l) => selectedIds.includes(l.id))
                      .map((l) => l.name)
                      .slice(0, 2)
                      .join(", ")}
                    {selectedIds.length > 2 && " ..."}
                  </span>
                </>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] overflow-hidden rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Search locations..." />
            <CommandList>
              <CommandEmpty>No location found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={toggleAll}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={
                        selectedIds.length === locations.length &&
                        locations.length > 0
                      }
                      className="border-primary/50 data-[state=checked]:bg-primary"
                    />
                    <span className="font-semibold text-sm">
                      Select All Locations
                    </span>
                  </div>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Individual Locations">
                {locations.map((location) => (
                  <CommandItem
                    key={location.id}
                    onSelect={() => toggleLocation(location.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={selectedIds.includes(location.id)}
                        className="border-primary/50 data-[state=checked]:bg-primary"
                      />
                      <span className="truncate text-sm">{location.name}</span>
                    </div>
                    {selectedIds.includes(location.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Pills (Desktop Only / Optional better visualization) */}
      {selectedIds.length > 0 && selectedIds.length < locations.length && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {locations
            .filter((l) => selectedIds.includes(l.id))
            .map((location) => (
              <Badge
                key={location.id}
                variant="outline"
                className="bg-muted/30 hover:bg-muted/50 border-muted-foreground/20 text-[11px] py-0.5 pl-2 pr-1 flex items-center gap-1 group transition-colors"
              >
                {location.name}
                <button
                  onClick={(e) => removeLocation(e, location.id)}
                  className="rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                >
                  <X className="h-3 w-3 text-muted-foreground group-hover:text-destructive" />
                </button>
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
}
